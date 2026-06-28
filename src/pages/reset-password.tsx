/* Password-recovery landing page.
 *
 * Flow:
 *   1. User clicks the recovery link in their email; Supabase appends
 *      a recovery hash to `/reset-password`.
 *   2. The Supabase JS client (configured with
 *      `detectSessionInUrl: true` in supabaseClient.ts) consumes that
 *      hash on mount and establishes a recovery session.
 *      `onAuthStateChange` then fires with event "PASSWORD_RECOVERY".
 *   3. While we wait for that, we show a "verifying your recovery
 *      link" placeholder. Once the session lands the password form
 *      enables.
 *   4. On submit we call `updateUser({ password })`. Success → sign
 *      the user out and bounce them to /login so they re-authenticate
 *      with the new credential (the cleanest end-to-end semantics).
 *   5. If the hash never resolves into a session (expired / tampered
 *      / wrong project), we surface a clear "link expired" message
 *      with a way back to the login page. */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Btn } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/auth/supabaseClient";

/** Hard-cap on how long we wait for Supabase to consume the recovery
 *  hash before declaring the link invalid. Supabase usually settles
 *  the session within ~100ms; 4s is generous for slow networks while
 *  still feeling responsive when the link is genuinely bad. */
const RECOVERY_TIMEOUT_MS = 4000;

type Phase =
  | { kind: "checking" }
  | { kind: "ready" }          // recovery session in place; show form
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "expired" }
  | { kind: "not-configured" };

export function ResetPasswordPage() {
  const { session, configured, updatePassword, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>(configured ? { kind: "checking" } : { kind: "not-configured" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Listen for the recovery event so we can transition the phase the
  // moment Supabase finishes consuming the hash. We ALSO fall through
  // on any auth state change that lands a session — different Supabase
  // SDK versions emit either "PASSWORD_RECOVERY" or "SIGNED_IN" here.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    // If we already have a session (e.g. the user reloaded the page),
    // the recovery session is in hand — show the form immediately.
    if (session) {
      setPhase({ kind: "ready" });
      return;
    }

    getSupabaseClient().then((supabase) => {
      if (cancelled || !supabase) return;

      const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
        if (cancelled) return;
        if (next || event === "PASSWORD_RECOVERY") {
          setPhase({ kind: "ready" });
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      timeout = setTimeout(() => {
        if (cancelled) return;
        // No session by now — the link is expired or invalid. We don't
        // distinguish further; the user just needs a new recovery email.
        setPhase((p) => (p.kind === "checking" ? { kind: "expired" } : p));
      }, RECOVERY_TIMEOUT_MS);
    });

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      unsubscribe?.();
    };
  }, [configured, session]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length === 0) {
      setError("Pick a new password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPhase({ kind: "submitting" });
    const result = await updatePassword(password);
    if (!result.ok) {
      setError(result.message ?? "Could not update password.");
      setPhase({ kind: "ready" });
      return;
    }
    // Sign out so the user re-authenticates with the new password.
    // The /login redirect happens via the root route guard once the
    // session clears. We swallow errors here because the password
    // update itself already succeeded — the user MUST see the
    // "done" state so they don't think the reset silently failed.
    try {
      await signOut();
    } catch {
      // Intentionally ignored — see comment above.
    }
    setPhase({ kind: "done" });
  };

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div className="display" style={{ fontSize: 20, fontWeight: 600 }}>
          Reset password
        </div>

        {phase.kind === "not-configured" && (
          <div style={warnBox}>
            Authentication isn't configured for this build — set
            {" "}<code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}

        {phase.kind === "checking" && (
          <div style={muted}>Verifying your recovery link…</div>
        )}

        {phase.kind === "expired" && (
          <>
            <div style={warnBox}>
              This recovery link is expired or invalid. Request a new
              one from the sign-in page.
            </div>
            <div>
              <Link to="/login" style={linkStyle}>Back to sign in</Link>
            </div>
          </>
        )}

        {phase.kind === "done" && (
          <>
            <div style={okBox}>
              Password updated. Sign in with your new password to continue.
            </div>
            <div>
              <Link to="/login" style={linkStyle}>Go to sign in</Link>
            </div>
          </>
        )}

        {(phase.kind === "ready" || phase.kind === "submitting") && (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={muted}>
              Pick a new password for your account. You'll be signed
              out and asked to sign in again with the new password.
            </div>
            <label style={fieldStyle}>
              <span style={fieldLabel}>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabel}>Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={inputStyle}
              />
            </label>
            {error && (
              <div style={{ fontSize: 12, color: "var(--warn)" }}>{error}</div>
            )}
            <div style={{ paddingTop: 4 }}>
              <Btn kind="primary" disabled={phase.kind === "submitting"}>
                {phase.kind === "submitting" ? "Updating…" : "Update password"}
              </Btn>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "var(--s-6)",
  background: "var(--canvas)",
};

const cardStyle: React.CSSProperties = {
  width: "100%", maxWidth: 380,
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  padding: "24px 24px 20px",
  display: "flex", flexDirection: "column", gap: 14,
};

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: "var(--t-l6)",
  fontFamily: "var(--ff-ui)",
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  color: "var(--ink)",
};

const fieldStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 4,
};

const fieldLabel: React.CSSProperties = {
  fontSize: "var(--t-l8)", color: "var(--ink-2)",
};

const muted: React.CSSProperties = {
  fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55,
};

const warnBox: React.CSSProperties = {
  background: "var(--warn-tint)", color: "var(--warn)",
  padding: "8px 12px", fontSize: 12, lineHeight: 1.55,
};

const okBox: React.CSSProperties = {
  background: "var(--pos-tint)", color: "var(--pos)",
  padding: "8px 12px", fontSize: 12, lineHeight: 1.55,
};

const linkStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--accent)",
  textDecoration: "underline",
};
