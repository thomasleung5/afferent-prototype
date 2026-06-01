/* Supabase user-JWT verification.
 *
 * Verifies the access_token a logged-in Supabase user sends as
 * `Authorization: Bearer <token>`. Supabase signs access_tokens with
 * an ES256 keypair (the project's "signing key"); the public side is
 * published at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`.
 *
 * Why JWKS instead of `supabase.auth.getUser(token)`:
 *   - One JWKS fetch is cached for the process lifetime; verification
 *     itself is local (no per-request Supabase round-trip).
 *   - We don't hold a service-role key on this server.
 *   - The token itself is the source of truth — Supabase signs it.
 *
 * Token revocation is best-effort: a refreshed/revoked token will
 * still verify until `exp`. Access tokens are short-lived (1h by
 * default in Supabase), so the window is bounded.
 *
 * Failure modes intentionally return distinct reasons so the client
 * can log a useful breadcrumb, but the HTTP status is always 401 so
 * we don't leak server-side detail. */

import {
  createRemoteJWKSet, jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

export interface AuthUser {
  id: string;          // Supabase `sub` claim — the user's auth uid.
  email?: string;      // Best-effort; not all access tokens carry it.
  role?: string;       // `authenticated` / `service_role` / `anon`.
}

export type VerifyResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "no-token" | "bad-token" | "expired" | "wrong-audience" | "not-configured" };

export interface VerifyArgs {
  authorization: string | null | undefined;
  /** Project URL (e.g. https://abc.supabase.co). The JWKS endpoint is
   *  derived from it. Required unless `jwks` is supplied directly. */
  supabaseUrl?: string;
  /** Test seam — pre-built key getter (createLocalJWKSet). Overrides
   *  `supabaseUrl` when set, so fixtures don't need to mock fetch. */
  jwks?: JWTVerifyGetKey;
  /** Expected `aud`. Defaults to "authenticated" — what Supabase puts
   *  on user access_tokens. */
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

const jwksCache = new Map<string, JWTVerifyGetKey>();

function getJwksFor(supabaseUrl: string): JWTVerifyGetKey {
  let getter = jwksCache.get(supabaseUrl);
  if (!getter) {
    const url = new URL("/auth/v1/.well-known/jwks.json", supabaseUrl);
    getter = createRemoteJWKSet(url);
    jwksCache.set(supabaseUrl, getter);
  }
  return getter;
}

/** Pure verification — exported so middleware tests can drive it
 *  by passing a local JWKS via `args.jwks`. */
export async function verifySupabaseJwt(args: VerifyArgs): Promise<VerifyResult> {
  const token = readBearer(args.authorization);
  if (!token) return { ok: false, reason: "no-token" };

  let keyGetter: JWTVerifyGetKey;
  if (args.jwks) {
    keyGetter = args.jwks;
  } else if (args.supabaseUrl) {
    keyGetter = getJwksFor(args.supabaseUrl);
  } else {
    return { ok: false, reason: "not-configured" };
  }

  try {
    const { payload } = await jwtVerify(token, keyGetter, {
      // Supabase issues ES256-signed tokens with the new asymmetric
      // signing model. RS256 is accepted in case a project is
      // explicitly configured that way.
      algorithms: ["ES256", "RS256"],
      audience: args.audience ?? "authenticated",
      ...(args.supabaseUrl ? { issuer: `${args.supabaseUrl.replace(/\/$/, "")}/auth/v1` } : {}),
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return { ok: false, reason: "bad-token" };
    const role = typeof payload.role === "string" ? payload.role : undefined;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { ok: true, user: { id: sub, email, role } };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "JWTExpired") return { ok: false, reason: "expired" };
    if (name === "JWTClaimValidationFailed") return { ok: false, reason: "wrong-audience" };
    return { ok: false, reason: "bad-token" };
  }
}
