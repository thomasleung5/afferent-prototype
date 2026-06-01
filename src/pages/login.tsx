import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Btn } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";

type Mode = "signin" | "recover";

/** Email + password sign-in plus a "Forgot password?" affordance.
 *  The recovery toggle swaps the form into a single-field email
 *  capture; submit hits Supabase's resetPasswordForEmail with a
 *  redirectTo pointing at /reset-password. The success state stays
 *  on this page so the user can re-try with a different email if
 *  they typed it wrong. */
export function LoginPage() {
  const { session, loading, configured, signInWithPassword, requestPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverySent, setRecoverySent] = useState(false);

  // Already signed in — bounce to the app. Skipped when we're in
  // recovery mode so a logged-in user can still trigger a reset
  // email for their own address.
  useEffect(() => {
    if (!loading && session && mode === "signin") {
      navigate({ to: "/", replace: true });
    }
  }, [session, loading, navigate, mode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const result = await signInWithPassword(email, password);
        if (!result.ok) setError(result.message ?? "Sign-in failed.");
      } else {
        const redirectTo = `${window.location.origin}/reset-password`;
        const result = await requestPasswordRecovery(email, redirectTo);
        if (!result.ok) {
          setError(result.message ?? "Could not send recovery email.");
        } else {
          setRecoverySent(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setRecoverySent(false);
    setPassword("");
  };

  /** Clear the "recovery sent" lock as soon as the user edits the
   *  email field — otherwise a single typo'd send leaves the Submit
   *  button disabled and the user has to toggle modes to recover.
   *  Also clears any inline error so the form stays scannable. */
  const onEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (recoverySent) setRecoverySent(false);
    if (error) setError(null);
  };

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div className="display" style={{ fontSize: 20, fontWeight: 600 }}>
          {mode === "signin" ? "Sign in" : "Reset password"}
        </div>
        <div style={muted}>
          {mode === "signin"
            ? "Use the email and password associated with your account."
            : "We'll email you a link to set a new password."}
        </div>

        {!configured && (
          <div style={warnBox}>
            Authentication isn't configured for this build —
            set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in your environment.
          </div>
        )}

        {mode === "recover" && recoverySent && (
          <div style={okBox}>
            If an account exists for that email, we just sent a
            recovery link. Check your inbox.
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={fieldStyle}>
            <span style={fieldLabel}>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={onEmailChange}
              style={inputStyle}
            />
          </label>
          {mode === "signin" && (
            <label style={fieldStyle}>
              <span style={fieldLabel}>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </label>
          )}
          {error && (
            <div style={{ fontSize: 12, color: "var(--warn)" }}>{error}</div>
          )}
          <div style={{ paddingTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Btn kind="primary" disabled={submitting || !configured || (mode === "recover" && recoverySent)}>
              {submitting
                ? (mode === "signin" ? "Signing in…" : "Sending…")
                : mode === "signin" ? "Sign in" : "Send recovery email"}
            </Btn>
            <button
              type="button"
              onClick={() => switchTo(mode === "signin" ? "recover" : "signin")}
              style={linkBtn}
            >
              {mode === "signin" ? "Forgot password?" : "Back to sign in"}
            </button>
          </div>
        </form>
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
  width: "100%", maxWidth: 360,
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

const linkBtn: React.CSSProperties = {
  all: "unset",
  cursor: "pointer",
  fontSize: 12,
  color: "var(--accent)",
  textDecoration: "underline",
};
