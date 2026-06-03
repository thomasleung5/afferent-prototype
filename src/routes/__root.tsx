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

  // Auth isn't configured at all → fall through to the app. The server
  // middleware's dev-bypass / 401 behavior is the real gate; this lets
  // unconfigured local dev environments still mount the SPA.
  if (!configured) {
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
