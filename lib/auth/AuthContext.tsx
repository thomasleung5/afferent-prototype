/* Auth context — single source of truth for session state.
 *
 * Listens to Supabase's onAuthStateChange and exposes:
 *   - `session` — the live Supabase session (or null)
 *   - `loading` — true until the initial getSession() resolves
 *   - `signInWithPassword` / `signOut` — wrapped Supabase calls
 *
 * When Supabase isn't configured at all (env vars absent), the
 * provider mounts in a "no-supabase" state and the auth gate falls
 * back to the server's dev-bypass behavior. This keeps `npm run dev`
 * working without forcing every contributor to set up a Supabase
 * project; production deployments MUST configure the env vars or
 * the server middleware will reject every request. */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
import { disableSandboxMode } from "@/lib/studies/sandboxMode";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
  /** Trigger a password-recovery email. Supabase will send a link that
   *  lands the user at `redirectTo`; that page calls `updatePassword`
   *  to finish the flow. */
  requestPasswordRecovery: (email: string, redirectTo: string) => Promise<{ ok: boolean; message?: string }>;
  /** Update the signed-in (or recovery-session) user's password. */
  updatePassword: (password: string) => Promise<{ ok: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        ok: false,
        message: "Auth is not configured. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.",
      };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // Sandbox is session-scoped — clear on sign-out so the next
    // sign-in always starts behind the study-selection gate rather
    // than silently reusing the previous user's "browse without a
    // study" choice.
    disableSandboxMode();
    await supabase.auth.signOut();
  }, []);

  const requestPasswordRecovery = useCallback(async (email: string, redirectTo: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        ok: false,
        message: "Auth is not configured. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.",
      };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { ok: false, message: "Auth is not configured." };
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session, loading, configured,
    signInWithPassword, signOut,
    requestPasswordRecovery, updatePassword,
  }), [session, loading, configured, signInWithPassword, signOut, requestPasswordRecovery, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider/>.");
  return ctx;
}
