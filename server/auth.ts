/* Supabase user-JWT verification.
 *
 * Verifies the access_token a logged-in Supabase user sends as
 * `Authorization: Bearer <token>`. Supabase signs access_tokens with
 * the project's JWT secret using HS256 by default; we verify the
 * signature + standard claims locally with `jose` so there's no
 * per-request network round-trip to Supabase.
 *
 * Why local verification instead of `supabase.auth.getUser(token)`:
 *   - Per-request latency cost is zero (HMAC verify is ~µs).
 *   - We don't hold a service-role key on this server.
 *   - The token itself is the source of truth — Supabase signs it.
 *
 * Token revocation is best-effort: a refreshed/revoked token will
 * still verify until `exp`. Access tokens are short-lived (1h by
 * default in Supabase), so the window is bounded.
 *
 * Failure modes intentionally return distinct messages so the client
 * can log a useful breadcrumb, but the HTTP status is always 401 so
 * we don't leak server-side detail. */

import { jwtVerify } from "jose";

export interface AuthUser {
  id: string;          // Supabase `sub` claim — the user's auth uid.
  email?: string;      // Best-effort; not all access tokens carry it.
  role?: string;       // `authenticated` / `service_role` / `anon`.
}

export type VerifyResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "no-token" | "bad-token" | "expired" | "wrong-audience" | "not-configured" };

interface VerifyArgs {
  authorization: string | null | undefined;
  jwtSecret: string | undefined;
  /** Expected `aud` claim. Defaults to "authenticated" — the value
   *  Supabase puts on user access_tokens. */
  audience?: string;
}

/** Extract the bearer token from an `Authorization: Bearer X` header.
 *  Returns null when the header is absent or doesn't use the Bearer
 *  scheme; case-insensitive on the scheme per RFC 6750. */
export function readBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Pure verification — exported so middleware tests can drive it
 *  without spinning up a Hono context. */
export async function verifySupabaseJwt(args: VerifyArgs): Promise<VerifyResult> {
  if (!args.jwtSecret) return { ok: false, reason: "not-configured" };
  const token = readBearer(args.authorization);
  if (!token) return { ok: false, reason: "no-token" };

  try {
    const secret = new TextEncoder().encode(args.jwtSecret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      audience: args.audience ?? "authenticated",
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return { ok: false, reason: "bad-token" };
    const role = typeof payload.role === "string" ? payload.role : undefined;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { ok: true, user: { id: sub, email, role } };
  } catch (err) {
    // `jose` throws JWTExpired specifically for expired tokens — surface
    // a distinct reason so the client can prompt a refresh rather than
    // a re-login.
    const name = err instanceof Error ? err.name : "";
    if (name === "JWTExpired") return { ok: false, reason: "expired" };
    if (name === "JWTClaimValidationFailed") return { ok: false, reason: "wrong-audience" };
    return { ok: false, reason: "bad-token" };
  }
}
