import {
  createRootRoute, Outlet, useLocation, Navigate,
} from "@tanstack/react-router";
import { TopBar } from "@/components/layout";
import { useAuth } from "@/lib/auth/AuthContext";

export const Route = createRootRoute({
  component: RootComponent,
});

/** Auth gate. /login is always reachable so unauthenticated users
 *  can sign in. Every other route requires a Supabase session. While
 *  the initial getSession() is in flight we show a tiny loading state
 *  so the app doesn't flash redirect → login → home. */
function RootComponent() {
  const { session, loading, configured } = useAuth();
  const { pathname } = useLocation();

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

  // Unauthenticated and not on /login → redirect.
  if (!session && pathname !== "/login") {
    return <Navigate to="/login" replace/>;
  }
  // Authenticated and viewing /login → bounce to home.
  if (session && pathname === "/login") {
    return <Navigate to="/" replace/>;
  }

  // /login renders its own full-page shell, no TopBar.
  if (pathname === "/login") {
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
