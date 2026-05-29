import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Type-scale token. Defaults to "l9" (10px) for compact eyebrows;
   *  use "l8" (11px) for slightly weightier labels and "l4" (10.5px,
   *  but heavier letter-spacing rhythm) for header-like callouts. */
  size?: "l4" | "l8" | "l9";
  /** Optional style overrides merged on top of the defaults
   *  (`className="mono"`, ink-3, uppercase, 600 weight, 0.1em letter
   *  spacing). */
  style?: CSSProperties;
  /** Optional title attribute for tooltip on hover. */
  title?: string;
}

/** Shared mono-uppercase caption used for mini-table headers, drilldown
 *  sub-labels, and small section eyebrows that don't fit the page-level
 *  SectionEyebrow / NodeEyebrow / TotalEyebrow / KpiEyebrow primitives.
 *  Captures the repeated `className="mono"` + ink-3 + uppercase + 600
 *  pattern in one place. */
export function MonoLabel({
  children, size = "l9", style, title,
}: Props) {
  return (
    <span className="mono" title={title} style={{
      fontSize: `var(--t-${size})`,
      fontWeight: 600,
      letterSpacing: "0.1em",
      color: "var(--ink-3)",
      textTransform: "uppercase",
      ...style,
    }}>
      {children}
    </span>
  );
}
