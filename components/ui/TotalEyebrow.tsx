import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Font size token. l9 = ledger totals, l8 = table footers. */
  size?: "l8" | "l9";
}

export function TotalEyebrow({ children, size = "l9" }: Props) {
  return (
    <span style={{
      color: "var(--ink-3)",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      fontSize: size === "l8" ? "var(--t-l8)" : "var(--t-l9)",
    }}>
      {children}
    </span>
  );
}
