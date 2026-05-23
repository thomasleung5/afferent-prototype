import type { ReactNode } from "react";

type Tone = "neg" | "warn" | "pos" | "info";

interface AnswerStat {
  label: string;
  value: ReactNode;
  tone?: Tone;
  sub?: string;
}

interface Props {
  question: string;
  answer: string;
  tone?: Tone;
  sub?: string;
  stats: AnswerStat[];
  actions?: ReactNode;
}

const TONE_COLOR: Record<Tone, string> = {
  neg: "var(--neg)",
  warn: "var(--warn)",
  pos: "var(--pos)",
  info: "var(--ink)",
};

/** "Decision screen" header: question → headline answer → supporting stats → actions. */
export function AnswerHeader({ question, answer, tone = "info", sub, stats, actions }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="mono" style={{
        fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--ink-3)",
      }}>{question}</div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 24,
        alignItems: "flex-end", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div className="display num" style={{
            fontSize: 56, fontWeight: 600,
            letterSpacing: "-0.02em", lineHeight: 0.95,
            color: TONE_COLOR[tone],
          }}>{answer}</div>
          {sub && (
            <div style={{ fontSize: "var(--fs-ui)", color: "var(--ink-3)", maxWidth: 640, lineHeight: 1.5 }}>
              {sub}
            </div>
          )}
        </div>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 0,
        borderTop: "1px solid var(--rule)",
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column", gap: 4,
            padding: "16px 18px",
            borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
          }}>
            <div className="mono" style={{
              fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--ink-3)",
            }}>{s.label}</div>
            <div className="display num" style={{
              fontSize: 22, fontWeight: 600,
              color: TONE_COLOR[s.tone ?? "info"],
              letterSpacing: "-0.015em",
            }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{s.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
