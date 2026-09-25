import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, cacheKeyFor, getCached, setCached, incrementSpend } from "@/lib/redis";
import { estimateCostUsd } from "@/lib/pricing";

export const runtime = "edge";

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const start = Date.now();

  const authHeader = req.headers.get("authorization");
  const apiKey = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing project API key in Authorization header" },
      { status: 401 }
    );
  }

  // Look up project by API key
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("*")
    .eq("api_key", apiKey)
    .single();

  if (projectError || !project) {
    return NextResponse.json(
      { error: "Invalid or unknown project API key" },
      { status: 401 }
    );
  }

  // Enforce project rate limits (Upstash sliding window)
  const rateLimitResult = await checkRateLimit(project.id);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded for this project. Please slow down." },
      { status: 429 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const model = body.model ?? "unknown";
  const featureTag = req.headers.get("x-feature") || null;
  const userTag = req.headers.get("x-user") || null;

  // Check Redis response cache for identical request
  const cacheKey = await cacheKeyFor(project.id, model, body);
  const cachedResponse = await getCached(cacheKey);

  if (cachedResponse) {
    let bodyText =
      typeof cachedResponse === "string"
        ? cachedResponse
        : JSON.stringify(cachedResponse);

    // If corrupted cache contains "[object Object]", bypass corrupted entry
    if (bodyText === '"[object Object]"' || bodyText === "[object Object]") {
      bodyText = "";
    }

    if (bodyText) {
      const latencyMs = Date.now() - start;
      await logRequest({
        projectId: project.id,
        model,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        latencyMs,
        cached: true,
        statusCode: 200,
        featureTag,
        userTag
      });

      return new NextResponse(bodyText, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-proxy-cache": "HIT"
        }
      });
    }
  }

  // Forward to upstream LLM Provider
  const rawUpstreamUrl = process.env.UPSTREAM_BASE_URL || "https://api.openai.com/v1";
  let upstreamBase = rawUpstreamUrl.endsWith("/") ? rawUpstreamUrl.slice(0, -1) : rawUpstreamUrl;
  let upstreamPath = params.path ? params.path.join("/") : "chat/completions";

  // Strip duplicated /v1 if both base URL and request path include v1
  if (upstreamBase.endsWith("/v1") && upstreamPath.startsWith("v1/")) {
    upstreamPath = upstreamPath.slice(3);
  } else if (upstreamBase.endsWith("/v1") && upstreamPath === "v1") {
    upstreamPath = "";
  }

  const targetUrl = upstreamPath ? `${upstreamBase}/${upstreamPath}` : upstreamBase;

  const upstreamApiKey = process.env.UPSTREAM_API_KEY;
  if (!upstreamApiKey) {
    return NextResponse.json(
      { error: "UPSTREAM_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstreamApiKey}`
      },
      body: JSON.stringify(body)
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to reach upstream provider", details: err?.message },
      { status: 502 }
    );
  }

  const responseText = await upstreamRes.text();
  const latencyMs = Date.now() - start;

  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const json = JSON.parse(responseText);
    promptTokens = json.usage?.prompt_tokens ?? json.usage?.input_tokens ?? 0;
    completionTokens = json.usage?.completion_tokens ?? json.usage?.output_tokens ?? 0;

    if (upstreamRes.ok) {
      await setCached(cacheKey, responseText);
    }
  } catch {
    // Non-JSON or streaming response
  }

  const costUsd = estimateCostUsd(model, promptTokens, completionTokens);

  await logRequest({
    projectId: project.id,
    model,
    promptTokens,
    completionTokens,
    costUsd,
    latencyMs,
    cached: false,
    statusCode: upstreamRes.status,
    featureTag,
    userTag
  });

  // Track spend & check budget threshold
  const todaySpend = await incrementSpend(project.id, costUsd);
  const dailyBudget = project.daily_budget_usd ?? 5.0;

  if (todaySpend > dailyBudget) {
    fetch(`${req.nextUrl.origin}/api/alert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        projectName: project.name,
        todaySpend,
        dailyBudget
      })
    }).catch(() => {});
  }

  return new NextResponse(responseText, {
    status: upstreamRes.status,
    headers: {
      "content-type": upstreamRes.headers.get("content-type") || "application/json",
      "x-proxy-cache": "MISS"
    }
  });
}

async function logRequest(row: {
  projectId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  cached: boolean;
  statusCode: number;
  featureTag: string | null;
  userTag: string | null;
}) {
  try {
    const record: Record<string, any> = {
      project_id: row.projectId,
      model: row.model,
      prompt_tokens: row.promptTokens,
      completion_tokens: row.completionTokens,
      cost_usd: row.costUsd,
      latency_ms: row.latencyMs,
      cached: row.cached,
      feature_tag: row.featureTag,
      user_tag: row.userTag
    };

    const { error } = await supabaseAdmin.from("requests").insert(record);
    if (error) {
      console.error("Error inserting request log to Supabase:", error);
    }
  } catch (err) {
    console.error("Failed logging request:", err);
  }
}
