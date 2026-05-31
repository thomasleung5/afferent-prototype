/* Per-key sliding-window rate limit for /api/ai/* routes.
 *
 * In-memory only — no external store, no persistence across
 * restarts. Right tradeoff for a single-instance deploy where the
 * goal is to stop a runaway client from burning Anthropic tokens,
 * not survive node restarts or coordinate across replicas.
 *
 * For multi-replica deployments swap in a shared Redis-backed
 * counter; the pure-function decision logic (recordRequest) stays
 * the same, just the store changes. */

import type { MiddlewareHandler } from "hono";

const WINDOW_MS = 60_000;
const DEFAULT_PER_MINUTE = 30;

/** Map of rate-limit key → ascending request timestamps within the
 *  current window. Older timestamps are dropped on each recorded
 *  request so the map doesn't grow unbounded for idle keys. */
export type RateLimitStore = Map<string, number[]>;

/** Pure decision — exported for fixture testing without needing a
 *  real Hono context. Records the new request iff allowed; an
 *  over-limit request does NOT count against future windows
 *  (otherwise a sustained attacker would lock themselves out
 *  indefinitely while we still pay to reject every probe). */
export function recordRequest(args: {
  key: string;
  now: number;
  perMinute: number;
  store: RateLimitStore;
}): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const { key, now, perMinute, store } = args;
  const windowStart = now - WINDOW_MS;
  const previous = store.get(key) ?? [];
  // Drop timestamps outside the window. Keep ascending order so the
  // oldest entry is at index 0 — needed for retry-after math below.
  const recent = previous.filter((t) => t > windowStart);

  if (recent.length >= perMinute) {
    // Save the trimmed array even on rejection so memory doesn't
    // accumulate dead history for hot keys.
    store.set(key, recent);
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  store.set(key, recent);
  return { allowed: true };
}

/** Resolve the per-minute cap from the environment. Invalid /
 *  non-positive values fall back to the default. */
export function resolvePerMinute(): number {
  const raw = process.env.AI_RATE_LIMIT_PER_MIN;
  const parsed = raw != null ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PER_MINUTE;
}

/** Best-effort client IP. Prefers X-Forwarded-For (first hop) for
 *  deploys behind a reverse proxy; falls back to a generic key when
 *  no IP is available so the limiter still throttles a misconfigured
 *  proxy chain (every anonymous request shares one counter). */
export function clientKey(headers: {
  forwarded?: string | null;
  realIp?: string | null;
}): string {
  if (headers.forwarded) {
    const first = headers.forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  if (headers.realIp) return headers.realIp.trim();
  return "anonymous";
}

/** Module-level store. Tests pass their own to keep state isolated. */
const sharedStore: RateLimitStore = new Map();

/** Hono middleware. Reads the cap at request time. Returns 429 with
 *  a Retry-After header when the caller exhausts the window. */
export function rateLimit(opts: {
  store?: RateLimitStore;
  perMinute?: () => number;
} = {}): MiddlewareHandler {
  const store = opts.store ?? sharedStore;
  const getPerMinute = opts.perMinute ?? resolvePerMinute;
  return async (c, next) => {
    const key = clientKey({
      forwarded: c.req.header("x-forwarded-for"),
      realIp: c.req.header("x-real-ip"),
    });
    const result = recordRequest({
      key,
      now: Date.now(),
      perMinute: getPerMinute(),
      store,
    });
    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: `Rate limit exceeded. Retry in ${result.retryAfterSec}s.`,
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": String(result.retryAfterSec),
          },
        },
      );
    }
    return next();
  };
}
