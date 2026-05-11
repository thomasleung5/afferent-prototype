import type { ReactNode } from "react";
import { SourcePill } from "./Formula";

type Tone = "info" | "pos" | "neg" | "warn";
type Tier = 1 | 2 | 3;

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  source?: string;
  tier?: Tier;
}

const TONE_COLOR: Record<Tone, string> = {
  info: "var(--ink)",
  pos:  "var(--pos)",
  neg:  "var(--neg)",
  warn: "var(--warn)",
};

/** Labelled value tile used on Cost Allocation, Cost of Service, and a few
 *  other rollup screens. Tier sets the size: 1 = primary $ (30px), 2 = default
 *  (22px), 3 = secondary (17px). */
export function KpiTile({ label, value, sub, tone = "info", source, tier = 2 }: Props) {
  const valueSize = tier === 1 ? 30 : tier === 3 ? 17 : 22;
  const valueWeight = tier === 1 ? 700 : 600;
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 4, minHeight: 96,
    }}>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="display num" style={{
        fontSize: valueSize, fontWeight: valueWeight,
        letterSpacing: "-0.02em", color: TONE_COLOR[tone], lineHeight: 1, marginTop: 4,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{sub}</div>}
      {source && (
        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          <SourcePill>{source}</SourcePill>
        </div>
      )}
    </div>
  );
}
