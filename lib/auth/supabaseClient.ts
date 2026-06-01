/* Browser-side Supabase client.
 *
 * Reads project URL + anon key from `import.meta.env` so they're
 * inlined at build time. The anon key is PUBLIC by design — it's the
 * Supabase tenant identifier the browser uses to talk to Supabase
 * Auth. Real authorization happens server-side: the access_token
 * Supabase issues after sign-in is verified by `server/requireAuth.ts`
 * before any /api/ai/* or /api/import/* route runs. Never wire the
 * service-role key here. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface AppEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  /** Build-time escape hatch for the browser smoke tests: forces the
   *  SPA into "no-supabase" mode so the route guard doesn't redirect
   *  to /login. The flag has no effect at runtime — it's read out of
   *  `import.meta.env`, which Vite inlines at build time. Production
   *  builds never set it. */
  VITE_AUTH_DISABLED?: string;
  /** Build-time test seam for the StudyMenu smoke spec: returns a
   *  minimal fake SupabaseClient that synthesizes a signed-in session
   *  so AuthContext mounts in `configured: true` + `session: !null`
   *  mode. No network calls are made. Production builds never set it. */
  VITE_AUTH_TEST_FIXTURE?: string;
}

function readEnv(): AppEnv {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return {
    VITE_SUPABASE_URL: env?.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: env?.VITE_SUPABASE_ANON_KEY,
    VITE_AUTH_DISABLED: env?.VITE_AUTH_DISABLED,
    VITE_AUTH_TEST_FIXTURE: env?.VITE_AUTH_TEST_FIXTURE,
  };
}

let cached: SupabaseClient | null = null;

/** Returns the singleton browser Supabase client, or null when the
 *  env vars aren't configured (local dev without an auth project) OR
 *  when VITE_AUTH_DISABLED is set (smoke-test mode). The auth provider
 *  falls back to a "no-supabase" state so the SPA still mounts. */
export function getSupabaseClient(): SupabaseClient | null {
  if (cached) return cached;
  const env = readEnv();
  if (env.VITE_AUTH_TEST_FIXTURE === "1" || env.VITE_AUTH_TEST_FIXTURE === "true") {
    cached = buildFakeFixtureClient();
    return cached;
  }
  if (env.VITE_AUTH_DISABLED === "1" || env.VITE_AUTH_DISABLED === "true") return null;
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  cached = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

/** Synthetic SupabaseClient used by the StudyMenu Playwright smoke.
 *  Implements only the methods AuthContext + aiAuthHeaders read; cast
 *  to SupabaseClient so the typed call sites compile. */
function buildFakeFixtureClient(): SupabaseClient {
  const fakeSession = {
    access_token: "fixture-access-token",
    refresh_token: "fixture-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: "00000000-0000-0000-0000-0000000000aa",
      email: "fixture@example.com",
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
    },
  };
  const fake = {
    auth: {
      getSession: async () => ({ data: { session: fakeSession }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe(): void { /* no-op */ } } },
      }),
      signInWithPassword: async () => ({ data: { session: fakeSession }, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ data: null, error: null }),
      updateUser: async () => ({ data: { user: fakeSession.user }, error: null }),
      getUser: async () => ({ data: { user: fakeSession.user }, error: null }),
    },
  };
  return fake as unknown as SupabaseClient;
}
