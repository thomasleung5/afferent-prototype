import type { ReactNode } from "react";

type Tone = "info" | "pos" | "warn" | "neg";

export type StatusItem =
  | string
  | { value: ReactNode; tone?: Tone; label?: string; tooltip?: string };

interface Props {
  items: StatusItem[];
}

const TONE_COLOR: Record<Tone, string> = {
  info: "var(--ink-2)",
  pos:  "var(--pos)",
  warn: "var(--warn)",
  neg:  "var(--neg)",
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
        const tooltip = isObj ? item.tooltip : undefined;
        return (
          <div key={i} title={tooltip} style={{
            padding: "14px 22px",
            borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
            display: "flex", flexDirection: "column", gap: 5,
            minWidth: 0,
            cursor: tooltip ? "help" : undefined,
          }}>
            {label && (
              <div className="mono" style={{
                fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>{label}</div>
            )}
            <div style={{
              fontSize: 14,
              fontWeight: 500,
              color: TONE_COLOR[tone],
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
