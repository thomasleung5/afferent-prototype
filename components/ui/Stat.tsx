import type { ReactNode } from "react";

export type StatSize = "sm" | "md" | "lg" | "xl";

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  size?: StatSize;
}

const SIZES: Record<StatSize, { value: number; label: number }> = {
  sm: { value: 22, label: 10.5 },
  md: { value: 28, label: 11 },
  lg: { value: 56, label: 11 },
  xl: { value: 88, label: 11 },
};

export function Stat({ label, value, sub, accent, size = "md" }: Props) {
  const s = SIZES[size];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="mono" style={{
        fontSize: s.label, fontWeight: 500, letterSpacing: "0.08em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div className="display num" style={{
        fontSize: s.value, fontWeight: 600, lineHeight: 1,
        color: accent ?? "var(--ink)",
        letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}
