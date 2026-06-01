/* Hono auth middleware for /api/ai/* and /api/import/*.
 *
 * Replaces the legacy shared-bearer gate (server/aiAuth.ts) with real
 * user-JWT verification against Supabase. The shared-bearer model was
 * never user-level authn — VITE_AI_API_TOKEN gets baked into the SPA
 * bundle and is therefore PUBLIC.
 *
 * Three modes, chosen at request time from the environment:
 *
 *   1. SUPABASE_JWT_SECRET configured → verify the bearer token's
 *      HS256 signature + `aud: "authenticated"` + `exp`. Mismatch or
 *      absent header → 401.
 *
 *   2. SUPABASE_JWT_SECRET unset + NODE_ENV === "production"
 *      → 503 fail-closed. Production must opt into auth explicitly.
 *
 *   3. AUTH_DEV_BYPASS=1 + NODE_ENV !== "production" → allow without
 *      verification and inject a synthetic dev user onto the context.
 *      This is the only path that skips signature verification, and
 *      it's gated on the env explicitly to prevent foot-guns.
 *
 * Adds `c.var.user` (Hono context) for downstream handlers that want
 * to read the caller's id/email. */

import type { Context, MiddlewareHandler } from "hono";
import { verifySupabaseJwt, type AuthUser } from "./auth";

export interface AuthEnv {
  Variables: {
    user: AuthUser;
  };
}

function jsonDeny(message: string, status: 401 | 503): Response {
  return new Response(JSON.stringify({ ok: false, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Decide whether the dev-bypass escape hatch is allowed. Exported so
 *  fixtures can drive it without process.env manipulation. */
export function devBypassEnabled(env: {
  bypassFlag: string | undefined;
  isProduction: boolean;
}): boolean {
  if (env.isProduction) return false;
  const v = env.bypassFlag?.trim();
  return v === "1" || v === "true";
}

export const DEV_BYPASS_USER: AuthUser = {
  id: "dev-bypass-user",
  email: "dev@local",
  role: "authenticated",
};

/** Hono middleware factory. Reads SUPABASE_JWT_SECRET + AUTH_DEV_BYPASS
 *  + NODE_ENV at request time so tests + tsx watch pick up env changes
 *  without restart. */
export function requireAuth(): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const isProduction = process.env.NODE_ENV === "production";

    // Dev escape hatch — explicit env flag, only allowed in non-prod.
    if (devBypassEnabled({
      bypassFlag: process.env.AUTH_DEV_BYPASS,
      isProduction,
    })) {
      c.set("user", DEV_BYPASS_USER);
      return next();
    }

    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      // Misconfigured server. In prod this is a hard failure; in dev
      // we still 401 (not 503) so the client gets a consistent error
      // shape — the dev bypass is the documented dev path.
      return jsonDeny(
        isProduction
          ? "Authentication is not configured. SUPABASE_JWT_SECRET must be set in production."
          : "Authentication required. Set AUTH_DEV_BYPASS=1 for local development.",
        isProduction ? 503 : 401,
      );
    }

    const result = await verifySupabaseJwt({
      authorization: c.req.header("authorization"),
      jwtSecret,
    });
    if (!result.ok) {
      return jsonDeny(messageForReason(result.reason), 401);
    }
    c.set("user", result.user);
    return next();
  };
}

/** Helper for handlers that want the authenticated user. */
export function getAuthUser(c: Context<AuthEnv>): AuthUser {
  return c.get("user");
}

function messageForReason(reason: "no-token" | "bad-token" | "expired" | "wrong-audience" | "not-configured"): string {
  switch (reason) {
    case "no-token":       return "Authentication required.";
    case "expired":        return "Session expired. Please sign in again.";
    case "wrong-audience": return "Token is not valid for this resource.";
    case "bad-token":      return "Invalid authentication token.";
    case "not-configured": return "Authentication is not configured on the server.";
  }
}
