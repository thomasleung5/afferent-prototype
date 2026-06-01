/* Top-level error boundary for the SPA.
 *
 * Wraps the RouterProvider so a render-time or hook-time exception
 * in any route can't take down the whole app with a blank page.
 * Shows a calm fallback ("Something went wrong — Reload"), logs the
 * actual error to `console.error` (visible in the browser dev tools
 * + any client-side log collector we hook up later), and intentionally
 * does NOT surface a stack trace to the user.
 *
 * React still requires class components for componentDidCatch. */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  hasError: boolean;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Browser-side breadcrumb. Production deployments that hook up a
    // client log collector (Sentry, Datadog RUM, etc.) can subscribe
    // to console events or wrap this method directly.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] render error", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      componentStack: info.componentStack,
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) return <FallbackUI/>;
    return this.props.children;
  }
}

function FallbackUI() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
      background: "var(--canvas, #f5f5f4)",
      color: "var(--ink, #1c1917)",
    }}>
      <div style={{
        maxWidth: 420,
        background: "var(--paper, #fff)",
        border: "1px solid var(--rule, #e7e5e4)",
        padding: "24px 24px 20px",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div className="display" style={{ fontSize: 20, fontWeight: 600 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2, #57534e)" }}>
          The app hit an unexpected error. Reloading usually clears it.
          If it keeps happening, share the time you saw this so we can
          look up the request in our logs.
        </div>
        <div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "6px 12px",
              border: "1px solid var(--ink, #1c1917)",
              background: "var(--ink, #1c1917)",
              color: "var(--paper, #fff)",
              fontFamily: "inherit",
              fontSize: 13, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
