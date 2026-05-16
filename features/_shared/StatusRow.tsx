import type { ReactNode } from "react";

type Tone = "info" | "pos" | "warn" | "neg";

export type StatusItem =
  | string
  | { value: ReactNode; tone?: Tone; label?: string };

interface Props {
  items: StatusItem[];
}

const TONE_COLOR: Record<Tone, string> = {
  info: "var(--ink-2)",
  pos:  "var(--pos)",
  warn: "var(--warn)",
  neg:  "var(--neg)",
};

const TONE_EMPHASIS: Record<Tone, { size: number; weight: number }> = {
  info: { size: 13,   weight: 500 },
  pos:  { size: 16,   weight: 600 },
  warn: { size: 16,   weight: 600 },
  neg:  { size: 16,   weight: 600 },
};

/** Compact horizontal status strip used at the top of every Build Model screen.
 *  Mirrors the legacy `StatusRow` pattern: governance facts, not KPI tiles. */
export function StatusRow({ items }: Props) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 0,
      background: "var(--paper)", border: "1px solid var(--rule)",
    }}>
      {items.map((item, i) => {
        const isObj = typeof item === "object" && item !== null;
        const value = isObj ? item.value : item;
        const tone = isObj ? item.tone ?? "info" : "info";
        const label = isObj ? item.label : undefined;
        return (
          <div key={i} style={{
            padding: "14px 22px",
            borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
            display: "flex", flexDirection: "column", gap: 5,
            minWidth: 0,
          }}>
            {label && (
              <div className="mono" style={{
                fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>{label}</div>
            )}
            <div className={tone === "info" ? undefined : "num"} style={{
              fontSize: TONE_EMPHASIS[tone].size,
              color: TONE_COLOR[tone],
              fontWeight: TONE_EMPHASIS[tone].weight,
              letterSpacing: tone === "info" ? "normal" : "-0.005em",
              whiteSpace: "nowrap",
            }}>
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
