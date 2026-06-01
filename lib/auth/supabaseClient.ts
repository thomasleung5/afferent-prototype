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
}

function readEnv(): AppEnv {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return {
    VITE_SUPABASE_URL: env?.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: env?.VITE_SUPABASE_ANON_KEY,
  };
}

let cached: SupabaseClient | null = null;

/** Returns the singleton browser Supabase client, or null when the
 *  env vars aren't configured (local dev without an auth project).
 *  The auth provider falls back to a "no-supabase" state in that
 *  case so the SPA still mounts. */
export function getSupabaseClient(): SupabaseClient | null {
  if (cached) return cached;
  const env = readEnv();
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
