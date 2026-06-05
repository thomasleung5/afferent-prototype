/* Per-key sliding-window rate limit for /api/ai/* + /api/import/*.
 *
 * Two layers, chosen for the multi-instance story:
 *
 *   1. `recordRequest` — pure sliding-window decision against a
 *      `RateLimitStore`. The store is a thin `get(key) / set(key, ts[])`
 *      interface that a `Map<string, number[]>` satisfies out of the
 *      box. This layer is sync and stays in memory.
 *
 *   2. `RateLimitAdapter` — the surface the Hono middleware actually
 *      calls. The default Hono middleware wraps `recordRequest` with
 *      an in-process `Map`-backed store via a small inline adapter.
 *      To move to a shared backend later (Redis / Cloudflare KV /
 *      etc.) implement this interface with an async `record()` — the
 *      middleware already awaits — and pass it via
 *      `rateLimit({ adapter })`. The pure decision function stays
 *      untouched; only the storage hop changes.
 *
 * Multi-replica deployments REQUIRE swapping the adapter. With the
 * in-memory default each replica counts its own bucket, so the
 * effective per-client cap is `perMinute × replicaCount` — fine for
 * cost containment on a single VM, not adequate as a real shared cap.
 *
 * Right tradeoff today: stop a runaway client from burning Anthropic
 * tokens on the single-instance deploy we ship by default; expose a
 * clean swap point for the day we scale out. */

import type { MiddlewareHandler } from "hono";

const WINDOW_MS = 60_000;
const DEFAULT_PER_MINUTE = 30;

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

/** Storage interface for the in-process sliding window. `Map<string, number[]>`
 *  is structurally compatible — no wrapper needed. Implementations only
 *  need to round-trip a timestamp list per key; the trimming and decision
 *  live in `recordRequest`. */
export interface RateLimitStore {
  get(key: string): number[] | undefined;
  set(key: string, value: number[]): unknown;
}

/** Higher-level adapter that the middleware calls. The default
 *  in-memory implementation delegates to `recordRequest`. A future
 *  Redis-backed adapter would replace the body with a Lua INCR/EXPIRE
 *  script (or a transactional GET+SET) and return a Promise — the
 *  middleware already awaits the result. */
export interface RateLimitAdapter {
  record(args: {
    key: string;
    now: number;
    perMinute: number;
  }): Promise<RateLimitDecision> | RateLimitDecision;
}

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
}): RateLimitDecision {
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

/** Default adapter — wraps a Map-backed store with `recordRequest`.
 *  Private because every external caller passes an `adapter` / `store`
 *  via `rateLimit(opts)` (the public entry point) or imports
 *  `recordRequest` directly for tests. */
function createInMemoryAdapter(store: RateLimitStore = new Map()): RateLimitAdapter {
  return {
    record: (args) => recordRequest({ ...args, store }),
  };
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

/** Module-level adapter. Tests typically pass their own via `opts.store`
 *  or `opts.adapter` to keep state isolated. */
const sharedAdapter: RateLimitAdapter = createInMemoryAdapter();

/** Hono middleware. Reads the cap at request time. Returns 429 with
 *  a Retry-After header when the caller exhausts the window.
 *
 *  Backwards-compatible options:
 *    - `store`   — Map-compatible store; wraps it as an in-memory adapter.
 *    - `adapter` — full adapter; takes precedence over `store`. */
export function rateLimit(opts: {
  store?: RateLimitStore;
  adapter?: RateLimitAdapter;
  perMinute?: () => number;
} = {}): MiddlewareHandler {
  const adapter = opts.adapter
    ?? (opts.store ? createInMemoryAdapter(opts.store) : sharedAdapter);
  const getPerMinute = opts.perMinute ?? resolvePerMinute;
  return async (c, next) => {
    const key = clientKey({
      forwarded: c.req.header("x-forwarded-for"),
      realIp: c.req.header("x-real-ip"),
    });
    const result = await adapter.record({
      key,
      now: Date.now(),
      perMinute: getPerMinute(),
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
