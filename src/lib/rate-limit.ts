import type { NextRequest } from "next/server";

/**
 * Tiny dependency-free fixed-window rate limiter.
 *
 * Keys are "route:clientIp". The limit is per server instance — on platforms
 * that scale to several instances (e.g. Vercel) this is a per-instance cap,
 * which still blunts single-origin abuse but is not a global guarantee. That
 * case is documented in the audit; add a durable limiter (e.g. Upstash) if a
 * global cap is ever required.
 */

export interface RateLimitOptions {
  /** Max requests allowed inside one windowMs. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function clientIp(req: NextRequest | Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimit(
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): { ok: boolean; remaining: number; retryAfterSeconds: number } {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, remaining: options.limit - 1, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > options.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return {
    ok: true,
    remaining: options.limit - bucket.count,
    retryAfterSeconds: 0,
  };
}

/** Test hook: drop every bucket between test cases. */
export function resetRateLimiter(): void {
  buckets.clear();
}
