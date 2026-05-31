/* Per-request structured log middleware for /api/ai/*.
 *
 * Wraps each request to emit:
 *   - One INFO line on completion with status + latency_ms
 *   - One ERROR line on uncaught exception (re-thrown after logging)
 *
 * Parsers can still emit their own domain log lines (model used,
 * tokens consumed, rows recovered) via logEvent; this middleware
 * just guarantees every request has an envelope log even when the
 * handler forgets to emit one. */

import type { MiddlewareHandler } from "hono";
import { logEvent } from "./logger";

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const route = new URL(c.req.url).pathname;
    const t0 = Date.now();
    try {
      await next();
    } catch (err) {
      const latency_ms = Date.now() - t0;
      logEvent({
        level: "error",
        msg: "request failed",
        route,
        latency_ms,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    const latency_ms = Date.now() - t0;
    const status = c.res.status;
    logEvent({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      msg: "request",
      route,
      status,
      latency_ms,
    });
  };
}
