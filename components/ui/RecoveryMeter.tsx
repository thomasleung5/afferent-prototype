import { signalFor } from "@/lib/signals";

interface Props {
  pct: number;
  target?: number;
  width?: number;
  compact?: boolean;
}

export function RecoveryMeter({ pct, target = 100, width = 140, compact = false }: Props) {
  const sig = signalFor(pct);
  const fill = Math.max(0, Math.min(pct, 130));
  const h = compact ? 6 : 8;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{
        position: "relative",
        width, height: h,
        background: "var(--paper-3)",
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px var(--rule)",
      }}>
        <div style={{
          position: "absolute", left: `${(target / 130) * 100}%`,
          top: -2, bottom: -2, width: 1, background: "var(--ink-3)",
        }}/>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${(fill / 130) * 100}%`,
          background: sig.color,
        }}/>
      </div>
      <span className="num" style={{
        minWidth: 44, textAlign: "right",
        color: sig.color, fontWeight: 600, fontSize: compact ? 12 : 13,
      }}>{Math.round(pct)}%</span>
    </div>
  );
}
