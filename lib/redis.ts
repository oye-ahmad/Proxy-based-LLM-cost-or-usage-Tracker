import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const hasRedisEnv =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN &&
  process.env.UPSTASH_REDIS_REST_URL !== "https://placeholder.upstash.io";

export const redis = hasRedisEnv
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    })
  : null;

// 60 requests per minute per project API key sliding window rate limiter
export const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      analytics: true,
      prefix: "ratelimit:project"
    })
  : null;

export async function checkRateLimit(projectId: string): Promise<{ success: boolean }> {
  if (!ratelimit) {
    return { success: true };
  }
  try {
    return await ratelimit.limit(projectId);
  } catch (err) {
    console.warn("Redis rate limit check error:", err);
    return { success: true };
  }
}

/**
 * Generates deterministic cache key using Web Crypto API (compatible with Edge functions & Node)
 */
export async function cacheKeyFor(projectId: string, model: string, body: unknown): Promise<string> {
  const str = JSON.stringify({ model, body });
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `cache:${projectId}:${hashHex}`;
}

const CACHE_TTL_SECONDS = 60 * 10; // 10 minutes cache window

export async function getCached(key: string): Promise<any> {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch (err) {
    console.warn("Redis cache get error:", err);
    return null;
  }
}

export async function setCached(key: string, value: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn("Redis cache set error:", err);
  }
}

export function spendKeyFor(projectId: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `spend:${projectId}:${today}`;
}

export async function incrementSpend(projectId: string, costUsd: number): Promise<number> {
  if (!redis) return costUsd;
  try {
    const key = spendKeyFor(projectId);
    const total = await redis.incrbyfloat(key, costUsd);
    await redis.expire(key, 60 * 60 * 36);
    return typeof total === "number" ? total : parseFloat(String(total));
  } catch (err) {
    console.warn("Redis spend increment error:", err);
    return costUsd;
  }
}
