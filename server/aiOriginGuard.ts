/* Origin / Referer gate for /api/ai/* routes.
 *
 * Pragmatic mitigation for the bundled-token gap: the bearer pair
 * (server AI_API_TOKEN ↔ frontend VITE_AI_API_TOKEN) is baked into
 * the SPA bundle and is therefore public. An Origin allowlist
 * prevents trivial cross-origin abuse — a rogue page on another
 * domain can't issue requests against the proxy even if it has read
 * the bundled token, because the browser-supplied Origin won't
 * match the allowlist.
 *
 * Three modes:
 *   1. ALLOWED_ORIGINS configured → Origin (or Referer fallback)
 *      must match. 403 otherwise.
 *   2. ALLOWED_ORIGINS unset + NODE_ENV !== "production" → allow.
 *      Local dev with no env should "just work".
 *   3. ALLOWED_ORIGINS unset + NODE_ENV === "production" → 503
 *      (fail closed). Production must opt into the allowlist
 *      explicitly; we don't silently expose the proxy.
 *
 * Caveat: Origin headers can be forged by non-browser clients
 * (curl, scripts). Treat this as a browser-side abuse filter, not
 * a real authorization boundary — pair with auth + rate limiting. */

import type { MiddlewareHandler } from "hono";

/** Parse the env value into a normalized allowlist. Empty/blank
 *  entries are dropped; values are matched case-insensitively
 *  against the request's Origin scheme + host (no trailing slash). */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",")
    .map((s) => s.trim().replace(/\/$/, "").toLowerCase())
    .filter((s) => s.length > 0);
}

/** Extract scheme + host (no path/query) from a URL string. Returns
 *  null when the input isn't a parseable absolute URL — Referer is
 *  the most common offender, so failures fall back to "no origin
 *  could be derived" rather than an exception. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Pure decision — exported for fixture testing without needing a
 *  real Hono context. */
export function checkOrigin(args: {
  origin: string | null | undefined;
  referer: string | null | undefined;
  allowed: string[];
  isProduction: boolean;
}): { allow: true } | { allow: false; status: 403 | 503; message: string } {
  if (args.allowed.length === 0) {
    if (args.isProduction) {
      return {
        allow: false,
        status: 503,
        message: "Cross-origin policy not configured. Set ALLOWED_ORIGINS in production.",
      };
    }
    return { allow: true };
  }
  const candidate = originOf(args.origin) ?? originOf(args.referer);
  if (!candidate || !args.allowed.includes(candidate)) {
    return {
      allow: false,
      status: 403,
      message: "Request origin is not allowed.",
    };
  }
  return { allow: true };
}

/** Hono middleware factory. Reads ALLOWED_ORIGINS + NODE_ENV at
 *  request time so config can change without a process restart. */
export function requireAllowedOrigin(): MiddlewareHandler {
  return async (c, next) => {
    const decision = checkOrigin({
      origin: c.req.header("origin"),
      referer: c.req.header("referer"),
      allowed: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
      isProduction: process.env.NODE_ENV === "production",
    });
    if (!decision.allow) {
      return new Response(JSON.stringify({ ok: false, message: decision.message }), {
        status: decision.status,
        headers: { "content-type": "application/json" },
      });
    }
    return next();
  };
}
