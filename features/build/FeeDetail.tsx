
import { Link } from "@tanstack/react-router";
import { Drawer, EditableNumber, DeptChip, RecoveryMeter } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { Service } from "@/lib/types";
import type { FeeComparison } from "@/lib/calc";
import { useBuildState } from "@/lib/store";
import { Section, Row, Field, Formula } from "./ServiceDetail";

interface Props {
  service: Service | null;
  comparison: FeeComparison | null;
  onClose: () => void;
}

export function FeeDetail({ service, comparison, onClose }: Props) {
  const { updateService } = useBuildState();
  if (!service || !comparison) return null;
  const set = (patch: Partial<Service>) => updateService(service.id, patch);
  const delta = comparison.recommended - service.fee;
  const deltaPct = service.fee > 0 ? (delta / service.fee) * 100 : 100;
  const peerVariance = service.peer > 0 ? ((service.fee - service.peer) / service.peer) * 100 : 0;
  const peerLabel =
    peerVariance >  5 ? "above median"
  : peerVariance < -5 ? "below median"
  :                     "near median";
  const peerColor =
    peerVariance >  5 ? "var(--neg)"
  : peerVariance < -5 ? "var(--warn)"
  :                     "var(--pos)";

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Fee item"
      title={service.name}
      subtitle={<span><DeptChip code={service.dept}/> <span className="mono" style={{ marginLeft: 6 }}>{service.id}</span></span>}
      width={580}
    >
      <Section title="Today vs. recommended">
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          background: "var(--paper-2)", border: "1px solid var(--rule)",
        }}>
          <div style={{ padding: "12px 14px", borderRight: "1px solid var(--rule)" }}>
            <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>Now</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>{fmt.dollars(service.fee)}</div>
          </div>
          <div style={{ padding: "12px 14px", borderRight: "1px solid var(--rule)" }}>
            <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>Recommended</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 600, color: "var(--accent)" }}>{fmt.dollars(comparison.recommended)}</div>
          </div>
          <div style={{ padding: "12px 14px" }}>
            <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>Annual uplift</div>
            <div className="num" style={{
              fontSize: 18, fontWeight: 600,
              color: comparison.annualUplift > 0 ? "var(--pos)" : comparison.annualUplift < 0 ? "var(--neg)" : "var(--ink-3)",
            }}>
              {comparison.annualUplift > 0 ? "+" : ""}{fmt.dollarsK(comparison.annualUplift)}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Recovery">
        <div style={{ padding: "8px 0" }}>
          <RecoveryMeter pct={comparison.recoveryPct} target={comparison.target} width={300}/>
        </div>
        <Row label="Current recovery">{comparison.recoveryPct.toFixed(0)}% of unit cost</Row>
        <Row label="Target">{comparison.target}% (from Recovery Policy)</Row>
        <Row label="Unit cost">{fmt.dollars(comparison.unitCost)} = {service.hours} h × ${Math.round(comparison.unitCost / Math.max(service.hours, 1))}/hr</Row>
      </Section>

      <Section title="Editable inputs">
        <Field label="Current fee">
          <EditableNumber
            value={service.fee}
            onChange={(v) => set({ fee: v })}
            prefix="$"
            min={0}
            step={5}
            align="left"
          />
        </Field>
        <Field label="Service target">
          <EditableNumber
            value={service.target}
            onChange={(v) => set({ target: v })}
            suffix="%"
            min={0}
            max={200}
            align="left"
          />
        </Field>
        <Field label="Peer median">
          <EditableNumber
            value={service.peer}
            onChange={(v) => set({ peer: v })}
            prefix="$"
            min={0}
            align="left"
          />
        </Field>
      </Section>

      <Section title="Why this changed">
        <Formula
          parts={[
            { l: "Hours × FBHR",       v: fmt.dollars(comparison.unitCost) },
            { l: "× Recovery target",  v: `${comparison.target}%` },
            { l: "Rounded to $5",      v: fmt.dollars(comparison.recommended), bold: true },
            { l: "Δ vs. current fee",  v: `${delta > 0 ? "+" : ""}${fmt.dollars(delta)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}%)` },
            { l: "× Volume / yr",      v: service.volume.toLocaleString() },
            { l: "= Annual uplift",    v: fmt.dollarsK(comparison.annualUplift), bold: true },
          ]}
        />
      </Section>

      {service.peer > 0 && (
        <Section title="Peer median">
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>
              {fmt.dollars(service.peer)}
            </span>
            <span className="num" style={{ fontSize: 12, color: peerColor, fontWeight: 500 }}>
              {peerVariance > 0 ? "+" : ""}{Math.round(peerVariance)}% {peerLabel}
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Link to="/build/benchmark" style={{
              fontSize: 11.5, color: "var(--accent)",
              textDecoration: "underline", textUnderlineOffset: 3,
            }}>
              View fee benchmark →
            </Link>
          </div>
        </Section>
      )}
    </Drawer>
  );
}
