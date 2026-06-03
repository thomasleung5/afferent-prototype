import {
  createRootRoute, Outlet, useLocation, Navigate,
} from "@tanstack/react-router";
import { TopBar } from "@/components/layout";
import { useAuth } from "@/lib/auth/AuthContext";
import { useActiveStudy } from "@/lib/studies/activeStudy";
import { useSandboxMode } from "@/lib/studies/sandboxMode";
import { StudySelectionGate } from "@/features/studies/StudySelectionGate";

export const Route = createRootRoute({
  component: RootComponent,
});

/** Auth gate. `/login` and `/reset-password` are always reachable so
 *  unauthenticated users can sign in or finish a password-recovery
 *  flow. Every other route requires a Supabase session. While the
 *  initial getSession() is in flight we show a tiny loading state so
 *  the app doesn't flash redirect → login → home.
 *
 *  Study gate. On top of the auth gate, authenticated users without
 *  an active server study see the StudySelectionGate panel rather
 *  than the editing pages. Bypasses: print/export routes
 *  (`/export/*`) stay reachable for already-loaded models, and the
 *  user can opt into ephemeral "sandbox" mode (the demo workspace
 *  switch in ModelSettingsMenu also takes this path automatically).
 *  Local-only browsing remains the legitimate path when auth is not
 *  configured at all. */
const PUBLIC_PATHS = new Set(["/login", "/reset-password"]);

function RootComponent() {
  const { session, loading, configured } = useAuth();
  const activeStudy = useActiveStudy();
  const isSandbox = useSandboxMode();
  const { pathname } = useLocation();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isExport = pathname.startsWith("/export");

  if (loading) {
    return <LoadingScreen/>;
  }

  // Auth isn't configured at all. Two paths:
  //
  //   - In a development build (Vite dev server, Playwright smoke
  //     project, etc.) we fall through to the app. The server's
  //     dev-bypass / 401 behavior is still the real gate; this lets
  //     contributors run `npm run dev` without provisioning a
  //     Supabase project.
  //
  //   - In a production build this is a misconfiguration (the
  //     STRICT_BUILD=1 check in scripts/checkBuildEnv.mjs should
  //     have caught it earlier). Refuse to mount the app so users
  //     can't be silently dropped into localStorage-only editing.
  //     Defense-in-depth against any future path that bypasses the
  //     build-time guard.
  if (!configured) {
    if (import.meta.env.PROD) {
      return <ConfigurationErrorScreen/>;
    }
    return (
      <>
        <TopBar/>
        <Outlet/>
      </>
    );
  }

  // Unauthenticated and on a protected route → redirect to /login.
  if (!session && !isPublic) {
    return <Navigate to="/login" replace/>;
  }
  // Authenticated and on /login → bounce to home. `/reset-password`
  // intentionally stays reachable for signed-in users (Supabase auto-
  // signs the user in via the recovery hash, so the page MUST be
  // reachable in that state).
  if (session && pathname === "/login") {
    return <Navigate to="/" replace/>;
  }

  // Public pages render their own full-page shell, no TopBar.
  if (isPublic) {
    return <Outlet/>;
  }

  // Authenticated + no active study + not sandboxing + not on a
  // print/export route → show the study-selection gate so the user
  // doesn't quietly build a model in browser localStorage.
  if (session && !activeStudy && !isSandbox && !isExport) {
    return (
      <>
        <TopBar/>
        <StudySelectionGate/>
      </>
    );
  }

  return (
    <>
      <TopBar/>
      <Outlet/>
    </>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--canvas)",
      fontSize: 12, color: "var(--ink-3)",
    }}>
      Loading…
    </div>
  );
}

/** Production-build fail-loud screen when the SPA was shipped without
 *  client-side Supabase env vars. The STRICT_BUILD=1 guard in
 *  scripts/checkBuildEnv.mjs should have stopped the build before it
 *  got here; this is the runtime backstop. */
function ConfigurationErrorScreen() {
  return (
    <div
      data-testid="configuration-error-screen"
      style={{
        minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        background: "var(--canvas)",
      }}
    >
      <div style={{
        maxWidth: 520,
        background: "var(--paper)",
        border: "1px solid var(--rule-strong)",
        padding: "22px 24px",
      }}>
        <div className="mono" style={{
          fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.14em",
          color: "var(--neg)", textTransform: "uppercase", marginBottom: 8,
        }}>Configuration error</div>
        <div className="display" style={{
          fontSize: 18, fontWeight: 600, color: "var(--ink)",
          letterSpacing: "-0.01em", marginBottom: 8,
        }}>This build is missing client auth configuration</div>
        <div style={{
          fontSize: "var(--t-l7)", color: "var(--ink-2)", lineHeight: 1.5,
        }}>
          The SPA bundle was shipped without <code>VITE_SUPABASE_URL</code>
          {" "}or <code>VITE_SUPABASE_ANON_KEY</code>, so the app cannot
          talk to Supabase auth. Rebuild with both variables set
          (Dockerfile <code>--build-arg</code>, CI build step, or your
          deploy platform's env settings) and redeploy. See
          {" "}<code>scripts/checkBuildEnv.mjs</code>.
        </div>
      </div>
    </div>
  );
}
