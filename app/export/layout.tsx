import type { ReactNode } from "react";

/** Minimal shell for /export/* routes. No TopBar (that's suppressed at the
 *  TopBar level), no SubNav, no page chrome — just the report. */
export default function ExportLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
