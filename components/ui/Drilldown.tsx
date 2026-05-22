import type { ReactNode } from "react";

interface ShellProps {
  children: ReactNode;
  isLast?: boolean;
}

/** Three-column drilldown panel used inside table-row expansions. Same shell
 *  across FBHR / Cost of Service / Fee Schedule for visual consistency. */
export function DrilldownShell({ children, isLast = false }: ShellProps) {
  return (
    <div style={{
      padding: "20px 24px 22px",
      background: "var(--paper-2)",
      borderBottom: isLast ? "none" : "1px solid var(--rule)",
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 24,
    }}>
      {children}
    </div>
  );
}

interface ColProps {
  marker?: ReactNode;
  title: string;
  children: ReactNode;
}

export function DrilldownColumn({ marker, title, children }: ColProps) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
        marginBottom: 10,
      }}>
        {marker && <span style={{ marginRight: 6 }}>{marker}</span>}
        {title}
      </div>
      {children}
    </div>
  );
}

