import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/** Inline mono chip for showing a computation snippet. */
export function Formula({ children }: Props) {
  return (
    <span className="mono" style={{
      fontSize: 11.5, color: "var(--ink-2)",
      background: "var(--paper)",
      padding: "2px 6px",
      border: "1px solid var(--rule)",
    }}>{children}</span>
  );
}

interface SourcePillProps {
  children: ReactNode;
  tone?: "default" | "cap" | "salary" | "fact" | "policy";
}

/** Small mono pill used inline for source attribution. */
export function SourcePill({ children, tone = "default" }: SourcePillProps) {
  const palette: Record<string, { bg: string; fg: string; bd: string }> = {
    default: { bg: "var(--paper-2)", fg: "var(--ink-3)", bd: "var(--rule)" },
    cap:     { bg: "var(--paper-2)", fg: "var(--accent)", bd: "var(--rule)" },
    salary:  { bg: "var(--paper-2)", fg: "var(--ink-2)", bd: "var(--rule)" },
    fact:    { bg: "var(--paper-2)", fg: "var(--ink-3)", bd: "var(--rule)" },
    policy:  { bg: "var(--accent-tint)", fg: "var(--accent)", bd: "var(--accent)" },
  };
  const p = palette[tone];
  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 6px",
      fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
      color: p.fg, background: p.bg, border: `1px solid ${p.bd}`,
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

