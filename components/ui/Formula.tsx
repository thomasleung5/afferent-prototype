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

interface FactPolicyTagProps {
  kind?: "fact" | "policy";
  size?: "sm" | "md";
}

/** Visual distinction between computed values and editable policy decisions. */
export function FactPolicyTag({ kind = "fact", size = "sm" }: FactPolicyTagProps) {
  const isFact = kind === "fact";
  const label = isFact ? "Fact" : "Policy";
  const small = size === "sm";
  return (
    <span
      title={isFact ? "Computed from inputs · read-only" : "Editable policy decision"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: small ? "1px 5px" : "2px 7px",
        fontSize: small ? 9 : 10, fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase",
        fontFamily: "var(--ff-mono)",
        color: isFact ? "var(--ink-3)" : "var(--accent)",
        background: isFact ? "var(--paper-2)" : "var(--accent-tint)",
        border: `1px solid ${isFact ? "var(--rule)" : "var(--accent)"}`,
      }}
    >
      <span style={{
        width: small ? 4 : 5, height: small ? 4 : 5,
        background: isFact ? "var(--ink-3)" : "var(--accent)",
        borderRadius: "50%",
      }}/>
      {label}
    </span>
  );
}
