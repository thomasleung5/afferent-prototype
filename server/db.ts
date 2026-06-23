/* Server-side Supabase client backed by the service-role key.
 *
 * Used by the protected /api/studies/* handlers to query and write
 * the persistence tables defined in supabase/migrations/. The
 * service-role key bypasses RLS by design — handlers enforce
 * authorization in code via requireAuth() + the role helpers in
 * server/studies/authorization.ts. RLS policies on the tables are
 * defense-in-depth and the contract for any future direct-PostgREST
 * read path.
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ NEVER pass this client (or the service-role key) to the    │
 *   │ browser. It can read / write every row regardless of user. │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Lazy singleton — the client is constructed on first use so:
 *   - test fixtures that import server modules don't try to build a
 *     Supabase client at import time;
 *   - the server can boot even when SUPABASE_SERVICE_ROLE_KEY is
 *     unset (the studies endpoints will return 503 in that case).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Default provider — builds the service-role client from env on first
 *  call. Test fixtures swap this out via `setDbClientProviderForTests`. */
function defaultProvider(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

let provider: () => SupabaseClient | null = defaultProvider;

/** Return the singleton service-role client, or null when the
 *  required env vars aren't set. Callers should 503 on null. */
export function getDbClient(): SupabaseClient | null {
  return provider();
}

/** Test seam — inject a fake SupabaseClient (or any object that
 *  satisfies the subset of the client API the handlers actually use).
 *  Pass `null` to simulate "DB not configured" (handlers should 503).
 *  Call `resetDbClientProviderForTests()` to restore the env-driven
 *  default after each fixture. */
export function setDbClientProviderForTests(
  next: () => SupabaseClient | null,
): void {
  provider = next;
  cached = null;
}

/** Restore the default env-driven provider. */
export function resetDbClientProviderForTests(): void {
  provider = defaultProvider;
  cached = null;
}

