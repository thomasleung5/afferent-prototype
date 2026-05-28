import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Font size token. l4 = primary KPI/section labels, l9 = compact stat labels. */
  size?: "l4" | "l9";
}

export function KpiEyebrow({ children, size = "l4" }: Props) {
  return (
    <div className="mono" style={{
      fontSize: size === "l9" ? "var(--t-l9)" : "var(--t-l4)",
      fontWeight: 600,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "var(--ink-3)",
    }}>
      {children}
    </div>
  );
}
