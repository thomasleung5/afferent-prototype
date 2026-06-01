import {
  createRootRoute, Outlet, useLocation, Navigate,
} from "@tanstack/react-router";
import { TopBar } from "@/components/layout";
import { useAuth } from "@/lib/auth/AuthContext";

export const Route = createRootRoute({
  component: RootComponent,
});

/** Auth gate. `/login` and `/reset-password` are always reachable so
 *  unauthenticated users can sign in or finish a password-recovery
 *  flow. Every other route requires a Supabase session. While the
 *  initial getSession() is in flight we show a tiny loading state so
 *  the app doesn't flash redirect → login → home. */
const PUBLIC_PATHS = new Set(["/login", "/reset-password"]);

function RootComponent() {
  const { session, loading, configured } = useAuth();
  const { pathname } = useLocation();
  const isPublic = PUBLIC_PATHS.has(pathname);

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
