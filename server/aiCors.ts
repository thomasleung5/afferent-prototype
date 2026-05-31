/* CORS configuration for /api/ai/* routes.
 *
 * Shares the ALLOWED_ORIGINS env list with aiOriginGuard so the two
 * gates can't drift apart. CORS is the BROWSER side of the contract
 * (controls whether the browser surfaces the response to the SPA);
 * aiOriginGuard is the SERVER side (rejects requests entirely). Both
 * are needed: CORS without the guard would let curl/scripts through;
 * the guard without CORS would let the server accept the request but
 * the browser would refuse to read the response.
 *
 * Three modes mirror the origin guard:
 *   1. ALLOWED_ORIGINS configured → reflect those origins only.
 *   2. ALLOWED_ORIGINS unset + dev → reflect any Origin so localhost
 *      tools (CodeSandbox previews, ngrok URLs, alternate vite ports)
 *      can hit the dev API without ceremony.
 *   3. ALLOWED_ORIGINS unset + production → no CORS headers issued.
 *      The origin guard will already 503; this just keeps us from
 *      sending Access-Control-Allow-Origin on a doomed response. */

import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import { parseAllowedOrigins } from "./aiOriginGuard";

const ALLOWED_METHODS = ["POST", "OPTIONS"];
const ALLOWED_HEADERS = ["authorization", "content-type"];

/** Hono CORS middleware. Reads ALLOWED_ORIGINS + NODE_ENV at request
 *  time so config can change without a process restart. */
export function aiCors(): MiddlewareHandler {
  return cors({
    origin: (origin) => {
      const allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
      if (allowed.length === 0) {
        // No allowlist configured. Dev reflects whatever the browser
        // sent so SPAs on alternate ports work; production drops the
        // header (the origin guard will 503 the request anyway).
        if (process.env.NODE_ENV === "production") return null;
        return origin ?? "*";
      }
      if (!origin) return null;
      const normalized = origin.toLowerCase().replace(/\/$/, "");
      return allowed.includes(normalized) ? origin : null;
    },
    allowMethods: ALLOWED_METHODS,
    allowHeaders: ALLOWED_HEADERS,
    maxAge: 600,
  });
}
