/* Inline warning banner for "active study went stale".
 *
 * Renders directly below the TopBar's primary row (above the SubNav)
 * when `lib/studies/staleStudyNotice.ts` has emitted a notice. Auto-
 * dismisses after AUTO_DISMISS_MS so the user isn't left with a
 * lingering warning they've already noticed; an explicit Dismiss
 * button is available for sooner.
 *
 * Styled with the project's tokens; no toast framework — the banner
 * occupies layout space (vs. an overlay) so it can't obscure data
 * tables behind it. */

import { useEffect } from "react";
import {
  dismissStaleStudyNotice, useStaleStudyNotice,
} from "@/lib/studies/staleStudyNotice";

const AUTO_DISMISS_MS = 10_000;

export function StaleStudyBanner() {
  const notice = useStaleStudyNotice();

  // Auto-dismiss timer tied to the notice's emittedAt so a fresh
  // notice (re-emit while one is already shown) restarts the clock.
  useEffect(() => {
    if (!notice) return;
    const handle = setTimeout(() => {
      dismissStaleStudyNotice();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(handle);
  }, [notice]);

  if (!notice) return null;

  return (
    <div
      role="status"
      style={{
        borderTop: "1px solid var(--rule)",
        borderBottom: "1px solid var(--rule)",
        background: "var(--warn-tint)",
        color: "var(--ink)",
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 28px",
        fontSize: "var(--t-l7)",
      }}
    >
      <span className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--warn)", textTransform: "uppercase",
      }}>
        Study
      </span>
      <span style={{ flex: 1 }}>{notice.message}</span>
      <button
        type="button"
        onClick={dismissStaleStudyNotice}
        style={{
          all: "unset",
          cursor: "pointer",
          fontSize: "var(--t-l8)",
          color: "var(--ink-3)",
          padding: "2px 6px",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
