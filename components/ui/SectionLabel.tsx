import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  right?: ReactNode;
}

export function SectionLabel({ children, right }: Props) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "0 0 8px 0",
      borderBottom: "1px solid var(--rule)",
      marginBottom: 12,
    }}>
      <div className="mono" style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-2)", textTransform: "uppercase",
      }}>
        {children}
      </div>
      {right && <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{right}</div>}
    </div>
  );
}
