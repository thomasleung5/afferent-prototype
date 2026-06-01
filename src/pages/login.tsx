import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Btn } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";

/** Email + password sign-in. Magic links / OAuth providers can be
 *  added later — Supabase supports both — but password auth covers
 *  the standard analyst workflow and is the simplest to wire. */
export function LoginPage() {
  const { session, loading, configured, signInWithPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in — bounce to the app.
  useEffect(() => {
    if (!loading && session) {
      navigate({ to: "/", replace: true });
    }
  }, [session, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signInWithPassword(email, password);
      if (!result.ok) {
        setError(result.message ?? "Sign-in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "var(--s-6)",
      background: "var(--canvas)",
    }}>
      <div style={{
        width: "100%", maxWidth: 360,
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        padding: "24px 24px 20px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div className="display" style={{ fontSize: 20, fontWeight: 600 }}>
          Sign in
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55 }}>
          Use the email and password associated with your account.
        </div>

        {!configured && (
          <div style={{
            background: "var(--warn-tint)", color: "var(--warn)",
            padding: "8px 12px", fontSize: 12, lineHeight: 1.55,
          }}>
            Authentication isn't configured for this build —
            set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in your environment.
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-2)" }}>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-2)" }}>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </label>
          {error && (
            <div style={{ fontSize: 12, color: "var(--warn)" }}>{error}</div>
          )}
          <div style={{ paddingTop: 4 }}>
            <Btn kind="primary" disabled={submitting || !configured}>
              {submitting ? "Signing in…" : "Sign in"}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: "var(--t-l6)",
  fontFamily: "var(--ff-ui)",
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  color: "var(--ink)",
};
