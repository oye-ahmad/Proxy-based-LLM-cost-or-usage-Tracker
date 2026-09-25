"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { createBrowserSupabase } from "@/lib/supabase";

type Project = {
  id: string;
  name: string;
  api_key: string;
  daily_budget_usd?: number;
  created_at: string;
};

type RecentRequest = {
  id: string;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd: number;
  latency_ms: number;
  cached: boolean;
  feature_tag: string | null;
  user_tag: string | null;
  status_code?: number;
  created_at: string;
};

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showKey, setShowKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // New Project Form state
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Sandbox Tester state
  const [sandboxModel, setSandboxModel] = useState<string>("qwen/qwen3.8-27b");
  const [sandboxPrompt, setSandboxPrompt] = useState<string>(
    "Explain quantum computing in one simple sentence."
  );
  const [sandboxFeature, setSandboxFeature] = useState<string>("dashboard-demo");
  const [sandboxSending, setSandboxSending] = useState<boolean>(false);
  const [sandboxResponse, setSandboxResponse] = useState<any | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // Fetch all projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const json = await res.json();
      if (json.projects && json.projects.length > 0) {
        setProjects(json.projects);

        // Check URL param or default to first project
        const urlParams = new URLSearchParams(window.location.search);
        const urlProjectId = urlParams.get("project");
        const found = json.projects.find((p: Project) => p.id === urlProjectId);
        setSelectedProject(found || json.projects[0]);
      } else {
        setProjects([]);
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Create Project handler
  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreatingProject(true);
    setProjectError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      setNewProjectName("");
      await fetchProjects();
      setSelectedProject(data.project);
    } catch (err: any) {
      setProjectError(err.message);
    } finally {
      setIsCreatingProject(false);
    }
  }

  // Fetch Requests & Realtime Listener
  useEffect(() => {
    if (!selectedProject) return;

    const supabase = createBrowserSupabase();

    // Load initial 50 requests for the project
    supabase
      .from("requests")
      .select("*")
      .eq("project_id", selectedProject.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data) {
          setRecentRequests(data as RecentRequest[]);
        }
      });

    // Subscribe to live inserts via Supabase Realtime
    const channel = supabase
      .channel(`requests-${selectedProject.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "requests",
          filter: `project_id=eq.${selectedProject.id}`
        },
        (payload) => {
          const newReq = payload.new as RecentRequest;
          setRecentRequests((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedProject?.id]);

  // Aggregate stats client-side (resilient against missing SQL views)
  const totalSpend = useMemo(
    () => recentRequests.reduce((sum, r) => sum + Number(r.cost_usd || 0), 0),
    [recentRequests]
  );

  const totalRequests = recentRequests.length;

  const cacheHits = useMemo(
    () => recentRequests.filter((r) => r.cached).length,
    [recentRequests]
  );

  const cacheHitRate = totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 100) : 0;

  const avgLatency = useMemo(() => {
    if (totalRequests === 0) return 0;
    const sum = recentRequests.reduce((s, r) => s + (r.latency_ms || 0), 0);
    return Math.round(sum / totalRequests);
  }, [recentRequests, totalRequests]);

  // Daily spend trend data for chart
  const dailySpendData = useMemo(() => {
    const map: Record<string, { day: string; cost: number; count: number }> = {};
    recentRequests.forEach((r) => {
      const dayStr = r.created_at ? r.created_at.slice(0, 10) : "Today";
      if (!map[dayStr]) {
        map[dayStr] = { day: dayStr.slice(5), cost: 0, count: 0 };
      }
      map[dayStr].cost += Number(r.cost_usd || 0);
      map[dayStr].count += 1;
    });

    return Object.values(map).reverse();
  }, [recentRequests]);

  // Feature breakdown
  const featureBreakdown = useMemo(() => {
    const map: Record<string, { tag: string; cost: number; count: number }> = {};
    recentRequests.forEach((r) => {
      const tag = r.feature_tag || "untagged";
      if (!map[tag]) {
        map[tag] = { tag, cost: 0, count: 0 };
      }
      map[tag].cost += Number(r.cost_usd || 0);
      map[tag].count += 1;
    });

    return Object.values(map).sort((a, b) => b.cost - a.cost);
  }, [recentRequests]);

  // Proxy Sandbox Test Handler
  async function handleSendSandboxPrompt() {
    if (!selectedProject) return;

    setSandboxSending(true);
    setSandboxResponse(null);
    setSandboxError(null);

    try {
      const res = await fetch("/api/proxy/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${selectedProject.api_key}`,
          "x-feature": sandboxFeature.trim() || "sandbox-test"
        },
        body: JSON.stringify({
          model: sandboxModel,
          messages: [{ role: "user", content: sandboxPrompt }],
          max_tokens: 150
        })
      });

      const cacheHeader = res.headers.get("x-proxy-cache");
      const json = await res.json();

      if (!res.ok) {
        const errorMessage =
          typeof json.error === "string"
            ? json.error
            : json.error?.message || JSON.stringify(json.error || json);
        throw new Error(errorMessage);
      }

      setSandboxResponse({
        status: res.status,
        cacheHeader,
        body: json
      });
    } catch (err: any) {
      setSandboxError(err.message);
    } finally {
      setSandboxSending(false);
    }
  }

  function handleCopyKey() {
    if (!selectedProject) return;
    navigator.clipboard.writeText(selectedProject.api_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  return (
    <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-slate-950 text-sm">
              ⚡
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              LLM Usage &amp; Cost Tracker
            </h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Proxy-based real-time latency, caching, and token cost monitor
          </p>
        </div>

        {/* Project Selector & Key Badge */}
        <div className="flex flex-wrap items-center gap-3">
          {projects.length > 0 && (
            <select
              value={selectedProject?.id || ""}
              onChange={(e) => {
                const proj = projects.find((p) => p.id === e.target.value);
                if (proj) {
                  setSelectedProject(proj);
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.set("project", proj.id);
                  window.history.pushState({}, "", newUrl.toString());
                }
              }}
              className="bg-slate-900 text-slate-200 text-sm rounded-lg border border-slate-700 px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
          )}

          {selectedProject && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <span className="text-slate-400 font-mono">Key:</span>
              <span className="font-mono text-emerald-400">
                {showKey
                  ? selectedProject.api_key
                  : `${selectedProject.api_key.slice(0, 10)}...`}
              </span>
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-slate-400 hover:text-white transition-colors"
                title="Toggle key visibility"
              >
                {showKey ? "🙈" : "👁️"}
              </button>
              <button
                onClick={handleCopyKey}
                className="text-slate-400 hover:text-emerald-400 transition-colors ml-1 font-medium"
              >
                {copiedKey ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="mt-8 flex-1 space-y-8">
        {/* Project Setup / Switcher Banner if no project */}
        {projects.length === 0 && !loading && (
          <div className="glass-panel rounded-2xl p-8 max-w-xl mx-auto text-center space-y-4">
            <div className="text-4xl">🚀</div>
            <h2 className="text-xl font-semibold text-white">Create Your First Project</h2>
            <p className="text-slate-400 text-sm">
              Generate an API key to start proxying LLM requests and tracking usage metrics live.
            </p>

            <form onSubmit={handleCreateProject} className="flex flex-col gap-3 pt-2">
              <input
                type="text"
                placeholder="Project Name (e.g. My AI Assistant)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="bg-slate-900 text-white rounded-lg border border-slate-700 px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
              {projectError && <p className="text-red-400 text-xs">{projectError}</p>}
              <button
                type="submit"
                disabled={isCreatingProject}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-semibold rounded-lg px-4 py-2.5 text-sm hover:opacity-95 transition-opacity disabled:opacity-50"
              >
                {isCreatingProject ? "Creating..." : "Create Project & Get API Key"}
              </button>
            </form>
          </div>
        )}

        {selectedProject && (
          <>
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Spend"
                value={`$${totalSpend.toFixed(4)}`}
                subtext={`Daily limit: $${(selectedProject.daily_budget_usd || 5).toFixed(2)}`}
                accentColor="emerald"
                icon="💲"
              />
              <StatCard
                label="Total Requests"
                value={totalRequests.toLocaleString()}
                subtext="Real-time proxy requests"
                accentColor="cyan"
                icon="📊"
              />
              <StatCard
                label="Cache Hit Rate"
                value={`${cacheHitRate}%`}
                subtext={`${cacheHits} prompt calls served from Redis ($0 cost)`}
                accentColor="purple"
                icon="⚡"
              />
              <StatCard
                label="Avg Latency"
                value={`${avgLatency} ms`}
                subtext="Average client response speed"
                accentColor="amber"
                icon="⏱️"
              />
            </div>

            {/* Middle Grid: Spend Chart & Feature Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Spend Trend Chart */}
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">Spend Over Time</h3>
                    <p className="text-xs text-slate-400">Daily cost aggregation</p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    Live Updates
                  </span>
                </div>

                <div className="h-64 w-full mt-2">
                  {dailySpendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailySpendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                        <YAxis
                          stroke="#64748b"
                          fontSize={12}
                          tickFormatter={(v) => `$${v.toFixed(3)}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderColor: "#334155",
                            borderRadius: "8px",
                            color: "#f8fafc"
                          }}
                          formatter={(value: any) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          dot={{ fill: "#10b981", r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                      No request history logged yet. Send a request to see the graph update!
                    </div>
                  )}
                </div>
              </div>

              {/* Spend by Feature */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col">
                <h3 className="text-base font-semibold text-white">Spend by Feature</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Grouped by <code className="text-emerald-400">X-Feature</code> header
                </p>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-64 pr-1">
                  {featureBreakdown.map((item) => {
                    const percentage = totalSpend > 0 ? Math.round((item.cost / totalSpend) * 100) : 0;
                    return (
                      <div key={item.tag} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono text-slate-300">{item.tag}</span>
                          <span className="font-mono text-emerald-400">
                            ${item.cost.toFixed(4)} ({item.count} reqs)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                            style={{ width: `${Math.max(percentage, 4)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {featureBreakdown.length === 0 && (
                    <p className="text-slate-500 text-xs py-8 text-center">
                      No feature tags logged yet. Add header <code className="text-slate-400 font-mono">X-Feature: my-feature</code> in calls.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive Proxy Test Sandbox & Live Log Tabs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Interactive Proxy Sandbox */}
              <div className="glass-panel rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">⚡ Proxy Test Sandbox</h3>
                  <span className="text-xs text-cyan-400 font-mono">Interactive</span>
                </div>
                <p className="text-xs text-slate-400">
                  Send a live request through the proxy to inspect response latency, cost, and Redis caching.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1 block">Model</label>
                    <select
                      value={sandboxModel}
                      onChange={(e) => setSandboxModel(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="qwen/qwen3.8-27b">qwen/qwen3.8-27b (Groq)</option>
                      <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Groq)</option>
                      <option value="allam-2-7b">allam-2-7b (Groq)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (OpenAI)</option>
                      <option value="gpt-4o">gpt-4o (OpenAI)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1 block">Feature Tag Header (X-Feature)</label>
                    <input
                      type="text"
                      value={sandboxFeature}
                      onChange={(e) => setSandboxFeature(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1 block">Prompt</label>
                    <textarea
                      rows={3}
                      value={sandboxPrompt}
                      onChange={(e) => setSandboxPrompt(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:border-emerald-500 focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    onClick={handleSendSandboxPrompt}
                    disabled={sandboxSending}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs py-2.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {sandboxSending ? "Sending via Proxy..." : "Send Request via Proxy"}
                  </button>

                  {sandboxError && (
                    <div className="bg-red-950/50 border border-red-800 text-red-300 p-2.5 rounded-lg text-xs">
                      {sandboxError}
                    </div>
                  )}

                  {sandboxResponse && (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-400">Status: {sandboxResponse.status}</span>
                        <span className={sandboxResponse.cacheHeader === "HIT" ? "text-emerald-400 font-bold" : "text-cyan-400"}>
                          Cache: {sandboxResponse.cacheHeader || "MISS"}
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto bg-slate-900 p-2 rounded text-slate-300 font-mono text-[11px]">
                        {JSON.stringify(sandboxResponse.body, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Live Request Stream */}
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 flex flex-col">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">Live Requests Stream</h3>
                    <p className="text-xs text-slate-400">Real-time requests logged for this project</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Supabase Realtime
                  </span>
                </div>

                <div className="flex-1 overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/60 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Model</th>
                        <th className="py-2.5 px-3">Feature</th>
                        <th className="py-2.5 px-3">Cache</th>
                        <th className="py-2.5 px-3">Latency</th>
                        <th className="py-2.5 px-3 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {recentRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-slate-200">
                            {req.model}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {req.feature_tag || "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            {req.cached ? (
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px]">
                                HIT ($0)
                              </span>
                            ) : (
                              <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px]">
                                MISS
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {req.latency_ms} ms
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">
                            ${Number(req.cost_usd || 0).toFixed(4)}
                          </td>
                        </tr>
                      ))}

                      {recentRequests.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-500 font-sans">
                            No request history logged yet. Use the Proxy Test Sandbox to send a test request!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  icon,
  accentColor
}: {
  label: string;
  value: string;
  subtext: string;
  icon: string;
  accentColor: "emerald" | "cyan" | "purple" | "amber";
}) {
  const borderColors = {
    emerald: "hover:border-emerald-500/40",
    cyan: "hover:border-cyan-500/40",
    purple: "hover:border-purple-500/40",
    amber: "hover:border-amber-500/40"
  };

  return (
    <div className={`glass-panel glass-panel-hover rounded-2xl p-5 ${borderColors[accentColor]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-white tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] text-slate-400 truncate">{subtext}</div>
    </div>
  );
}
