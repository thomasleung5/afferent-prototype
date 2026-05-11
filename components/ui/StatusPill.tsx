export type PillKind = "ok" | "warn" | "bad" | "review" | "info" | "locked";

interface Props {
  kind?: PillKind;
  children: React.ReactNode;
}

const PILL: Record<PillKind, { bg: string; fg: string; dot: string }> = {
  ok:     { bg: "var(--pos-tint)",  fg: "var(--pos)",   dot: "var(--pos)" },
  warn:   { bg: "var(--warn-tint)", fg: "var(--warn)",  dot: "var(--warn)" },
  bad:    { bg: "var(--neg-tint)",  fg: "var(--neg)",   dot: "var(--neg)" },
  review: { bg: "var(--warn-tint)", fg: "var(--warn)",  dot: "var(--warn)" },
  info:   { bg: "var(--paper-2)",   fg: "var(--ink-2)", dot: "var(--ink)" },
  locked: { bg: "var(--paper-2)",   fg: "var(--ink-2)", dot: "var(--ink-2)" },
};

export function StatusPill({ kind = "info", children }: Props) {
  const p = PILL[kind];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 500,
      padding: "2px 8px", border: `1px solid ${p.dot}`,
      background: p.bg, color: p.fg,
      borderRadius: 999,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: p.dot, flexShrink: 0 }}/>
      {children}
    </span>
  );
}
