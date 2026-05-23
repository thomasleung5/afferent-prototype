import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Cell alignment inside its grid track. */
  align?: "left" | "right" | "center";
  /** Pass-through style overrides (e.g. column-specific grid placement). */
  style?: CSSProperties;
}

/** Mono / uppercase / ink-3 eyebrow used as a column header inside
 *  drilldown sub-tables that render as a custom grid (not via the
 *  shared `<Ledger>`). Centralizes the fontSize / fontWeight /
 *  letterSpacing tuple that was hand-rolled across several files. */
export function DrilldownLabel({ children, align = "left", style }: Props) {
  return (
    <div className="mono" style={{
      fontSize: "var(--t-l9)",
      fontWeight: 600,
      letterSpacing: "0.1em",
      color: "var(--ink-3)",
      textTransform: "uppercase",
      textAlign: align,
      ...style,
    }}>{children}</div>
  );
}
