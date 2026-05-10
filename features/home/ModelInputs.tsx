import type { ReactNode } from "react";
import { SectionLabel } from "@/components/ui";
import { SERVICES } from "@/lib/data/services";

type Tone = "info" | "warn" | "pos" | "neg";

interface TileProps {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: Tone;
}

function Tile({ label, value, sub, tone = "info" }: TileProps) {
  const toneColor: Record<Tone, string> = {
    info: "var(--ink)",
    warn: "var(--warn)",
    pos: "var(--pos)",
    neg: "var(--neg)",
  };
  return (
    <div style={{
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="display num" style={{
        fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em",
        color: toneColor[tone],
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

/** Quick stats card on the Home screen. Static counts for now — wire to engine when migrated. */
export function ModelInputs() {
  const services = SERVICES.length;
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      padding: 20,
    }}>
      <SectionLabel>Model inputs</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        <Tile label="Cost allocation pool" value="$3.71M" sub="14 allocations · 2 warnings" tone="warn"/>
        <Tile label="Services modeled"     value={services}  sub="across PLAN · BLDG · ENG"/>
        <Tile label="Positions"             value="73"        sub="mapped to roles"/>
        <Tile label="Operating lines"       value="42"        sub="dept-direct non-labor"/>
      </div>
    </div>
  );
}
