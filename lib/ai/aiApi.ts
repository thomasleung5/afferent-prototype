/* Thin wrapper around fetch for the /api/ai/* endpoints.
 *
 * Centralizes two concerns:
 *   1. Attach `Authorization: Bearer <token>` when the build-time
 *      env var VITE_AI_API_TOKEN is configured (matches the server's
 *      AI_API_TOKEN gate — see server/aiAuth.ts).
 *   2. Normalize the response shape so each adapter doesn't repeat
 *      the same "non-2xx without 502 → text body; otherwise JSON"
 *      handling.
 *
 * Security note: VITE_* env vars are baked into the SPA bundle and
 * are therefore PUBLIC. The bearer pair (server AI_API_TOKEN +
 * frontend VITE_AI_API_TOKEN) is a basic API gate — it stops random
 * unauthenticated requests against the proxy, but anyone who can
 * load the SPA can read the token. Pair with rate limiting / origin
 * checks / real user auth for stronger protection. */

const TOKEN: string | undefined = (() => {
  // Read via the import.meta.env bag so build-tooling can inline the
  // value at SPA build time. Guarded with optional chaining so this
  // module is safe to import from non-Vite contexts (e.g. fixture
  // tests that may pull it transitively).
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_AI_API_TOKEN;
})();

/** Auth headers for /api/ai/* requests. Empty object when no token is
 *  configured at build time (matches the server's permissive dev mode). */
export function aiAuthHeaders(): Record<string, string> {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

/** Generic POST helper for the AI parse routes. Returns the parsed
 *  JSON body when the response is JSON-shaped (any status), or
 *  synthesizes a `{ ok: false, message }` body from the raw text /
 *  HTTP status when the server returned plaintext (e.g. an upstream
 *  proxy 502 with an HTML error page). */
export async function aiApiPost<T extends { ok: boolean; message?: string }>(
  path: string,
  body: FormData,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    body,
    headers: aiAuthHeaders(),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  const text = await res.text().catch(() => "");
  return { ok: false, message: text || `HTTP ${res.status}` } as T;
}
