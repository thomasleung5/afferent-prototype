/* Bearer-token gate for /api/ai/* routes.
 *
 * Three modes, chosen at request time from the environment:
 *
 *   1. AI_API_TOKEN configured → require `Authorization: Bearer <token>`
 *      with a constant-time equality check. Mismatch / absent header
 *      → 401.
 *
 *   2. AI_API_TOKEN unset + NODE_ENV !== "production" → allow.
 *      Local dev with no token in .env.local should "just work".
 *
 *   3. AI_API_TOKEN unset + NODE_ENV === "production" → fail closed
 *      with 503. Production must opt into auth explicitly; we don't
 *      silently expose the proxy without it.
 *
 * Caveat for the readme: when the frontend reads the matching token
 * from VITE_AI_API_TOKEN it gets baked into the JS bundle and is
 * therefore PUBLIC. This gate is a basic API throttle — it prevents
 * drive-by abuse from anyone hitting the URL directly with no
 * context. It is NOT a substitute for user-level authn / authz. */

import type { MiddlewareHandler } from "hono";

interface DenyResponse {
  ok: false;
  message: string;
}

function deny(message: string, status: 401 | 503): Response {
  const body: DenyResponse = { ok: false, message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Compare two strings in constant time. Returns false for length
 *  mismatches and for any byte-level mismatch — both branches walk
 *  the full input so a timing attacker can't infer prefix matches. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Extract the bearer token from an `Authorization: Bearer X` header.
 *  Returns null when the header is absent or doesn't use the Bearer
 *  scheme; case-insensitive on the scheme per RFC 6750. */
export function readBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Pure decision function — exported for fixture testing without
 *  needing a real Hono context. */
export function checkBearerAuth(args: {
  authorization: string | null | undefined;
  envToken: string | undefined;
  isProduction: boolean;
}): { allow: true } | { allow: false; status: 401 | 503; message: string } {
  const expected = args.envToken?.trim();
  if (!expected) {
    if (args.isProduction) {
      return {
        allow: false,
        status: 503,
        message: "AI parsing is not configured. AI_API_TOKEN must be set in production.",
      };
    }
    return { allow: true };
  }
  const supplied = readBearer(args.authorization);
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    return {
      allow: false,
      status: 401,
      message: "Authentication required.",
    };
  }
  return { allow: true };
}

/** Hono middleware factory. Reads AI_API_TOKEN + NODE_ENV at request
 *  time (not module-load time) so tests + dev hot-reload pick up env
 *  changes without restart. */
export function requireAiBearer(): MiddlewareHandler {
  return async (c, next) => {
    const decision = checkBearerAuth({
      authorization: c.req.header("authorization"),
      envToken: process.env.AI_API_TOKEN,
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

// Re-exported so consumers can build matching error responses
// elsewhere in the server if needed.
export { deny as denyResponse };
