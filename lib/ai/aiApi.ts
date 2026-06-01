/* Thin wrapper around fetch for the /api/ai/* + /api/import/*
 * endpoints.
 *
 * Centralizes two concerns:
 *   1. Attach `Authorization: Bearer <supabase access_token>` so the
 *      server's requireAuth middleware can verify the user's JWT.
 *      The token is read live from the Supabase session — never from
 *      a build-time env var, since that path was the legacy
 *      VITE_AI_API_TOKEN model that wasn't real authn.
 *   2. Normalize the response shape so each adapter doesn't repeat
 *      the same "non-2xx without 502 → text body; otherwise JSON"
 *      handling. */

import { getSupabaseClient } from "@/lib/auth/supabaseClient";
import { reportClientError } from "@/lib/telemetry/clientErrorReporter";

/** Auth headers for /api/ai/* + /api/import/* requests. Reads the
 *  current Supabase session live (via getSession). Returns an empty
 *  object when no session is active — the server will then 401 the
 *  request, which the caller surfaces as a sign-in prompt. */
export async function aiAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Generic POST helper for the AI parse routes. Returns the parsed
 *  JSON body when the response is JSON-shaped (any status), or
 *  synthesizes a `{ ok: false, message }` body from the raw text /
 *  HTTP status when the server returned plaintext (e.g. an upstream
 *  proxy 502 with an HTML error page).
 *
 *  Non-2xx responses + thrown fetch errors are logged to the browser
 *  console (warn / error tone depending on severity) so failures
 *  show up in dev tools without surfacing scary stack traces to the
 *  user. Endpoint path + HTTP status are the only things logged —
 *  uploaded file contents, request bodies, and `Authorization`
 *  headers never enter the log. */
export async function aiApiPost<T extends { ok: boolean; message?: string }>(
  path: string,
  body: FormData,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      body,
      headers: await aiAuthHeaders(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error.";
    reportClientError({
      source: "apiFetch",
      level: "error",
      message,
      fields: { path },
    });
    return { ok: false, message } as T;
  }

  if (res.status >= 400) {
    reportClientError({
      source: "apiResponse",
      level: "warn",
      message: `non-2xx response`,
      fields: { path, status: res.status },
    });
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  const text = await res.text().catch(() => "");
  return { ok: false, message: text || `HTTP ${res.status}` } as T;
}
