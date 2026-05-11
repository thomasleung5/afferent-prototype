
import { Drawer, EditableNumber, DeptChip, RecoveryMeter } from "@/components/ui";
import { fmt } from "@/lib/format";
import { CITY } from "@/lib/data/city";
import type { Service } from "@/lib/types";
import type { FeeComparison } from "@/lib/calc";
import { useBuildState } from "@/lib/store";
import { Section, Row, Field, Formula } from "./ServiceDetail";

interface Props {
  service: Service | null;
  comparison: FeeComparison | null;
  onClose: () => void;
}

/** Stable jitter per id so peer values don't reshuffle between renders. */
function peerOffsets(id: string, median: number): { city: string; value: number }[] {
  if (!median) return [];
  const seed = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const offsets = [-0.18, -0.07, 0.04, 0.12, 0.22];
  const rounded = (v: number) => Math.round(v / 5) * 5;
  return CITY.peers.slice(0, 5).map((city, i) => ({
    city,
    value: rounded(median * (1 + offsets[(seed + i) % offsets.length])),
  }));
}

export function FeeDetail({ service, comparison, onClose }: Props) {
  const { updateService } = useBuildState();
  if (!service || !comparison) return null;
  const set = (patch: Partial<Service>) => updateService(service.id, patch);
  const peers = peerOffsets(service.id, service.peer);
  const delta = comparison.recommended - service.fee;
  const deltaPct = service.fee > 0 ? (delta / service.fee) * 100 : 100;

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

      {peers.length > 0 && (
        <Section title="Comparable cities">
          <div style={{
            background: "var(--paper)", border: "1px solid var(--rule)",
            fontFamily: "var(--ff-mono)", fontSize: 11.5, lineHeight: 1.5,
          }}>
            {peers.map((p, i) => (
              <div key={p.city} style={{
                display: "flex", justifyContent: "space-between",
                gap: 10, padding: "7px 12px",
                borderBottom: i < peers.length - 1 ? "1px solid var(--rule)" : "none",
              }}>
                <span style={{ color: "var(--ink-2)" }}>{p.city}</span>
                <span style={{ fontWeight: 500 }}>${p.value.toLocaleString()}</span>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "8px 12px",
              borderTop: "2px solid var(--ink)",
              background: "var(--paper-2)",
              fontWeight: 700,
            }}>
              <span>Peer median</span>
              <span>${service.peer.toLocaleString()}</span>
            </div>
          </div>
        </Section>
      )}
    </Drawer>
  );
}
