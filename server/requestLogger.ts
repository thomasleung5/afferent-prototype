/* Per-request structured log middleware.
 *
 * Wraps each protected API request to emit:
 *   - One INFO line on completion with method, route, status, latency_ms, req_id
 *   - One ERROR line on uncaught exception (re-thrown after logging,
 *     so the global onError handler can convert it to a 500 JSON
 *     response — see server/index.ts)
 *
 * Each request also gets a stable `req_id` (Web Crypto UUID v4)
 * exposed on `c.var.requestId` so downstream handlers can correlate
 * their own log lines with the envelope, and so the global error
 * handler can echo the same id back to the client.
 *
 * What we DO NOT log: Authorization headers, request bodies, query
 * strings (may carry tokens for auth redirects), uploaded file
 * contents, user emails. The route + status + latency + req_id is
 * enough for postmortems without becoming a leak. */

import type { MiddlewareHandler } from "hono";
import { logEvent } from "./logger";

export interface RequestLogEnv {
  Variables: {
    requestId: string;
  };
}

export function requestLogger(): MiddlewareHandler<RequestLogEnv> {
  return async (c, next) => {
    const route = new URL(c.req.url).pathname;
    const method = c.req.method;
    const requestId = newRequestId();
    c.set("requestId", requestId);
    const t0 = Date.now();
    try {
      await next();
    } catch (err) {
      const latency_ms = Date.now() - t0;
      logEvent({
        level: "error",
        msg: "request failed",
        method,
        route,
        latency_ms,
        req_id: requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    const latency_ms = Date.now() - t0;
    const status = c.res.status;
    logEvent({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      msg: "request",
      method,
      route,
      status,
      latency_ms,
      req_id: requestId,
    });
  };
}

/** Generate a request correlation id. Uses Web Crypto's randomUUID
 *  when available (Node 19+) and falls back to a non-cryptographic
 *  base36 string otherwise — the id is for log correlation, not
 *  security, so the fallback is fine. */
function newRequestId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
