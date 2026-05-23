import type { ReactNode } from "react";
import { Btn } from "./Btn";
import { Icon } from "./Icon";

interface Props {
  /** One-line bold subtitle (e.g. "Town of Los Altos Hills · FY 2025-26
   *  fee study"). The eyebrow above it is always "Export · Print
   *  preview". */
  subtitle: ReactNode;
  /** Extra action buttons rendered between Close and Print/Save PDF.
   *  Use this for per-route exports (Excel, CSV, etc.). */
  extraActions?: ReactNode;
}

/** Sticky `.no-print` header rendered at the top of every /export
 *  print-preview route. Hidden in the actual printed PDF via the
 *  shared PrintStyles. Consolidates the four near-identical Toolbar
 *  components each export page used to roll inline. */
export function ExportToolbar({ subtitle, extraActions }: Props) {
  return (
    <div className="no-print" style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "var(--paper)",
      borderBottom: "1px solid var(--rule)",
      padding: "10px 24px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Export · Print preview</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{subtitle}</div>
      </div>
      <div style={{ flex: 1 }}/>
      <Btn kind="ghost" onClick={() => window.close()}>Close</Btn>
      {extraActions}
      <Btn kind="primary" onClick={() => window.print()}>
        <Icon name="download" size={13}/> Print / Save PDF
      </Btn>
    </div>
  );
}
