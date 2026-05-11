
import { Drawer, EditableNumber, EditableText, DeptChip } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { Service } from "@/lib/types";
import type { FBHR } from "@/lib/calc";
import { useBuildState } from "./BuildContext";

interface Props {
  service: Service | null;
  onClose: () => void;
  fbhr: FBHR | null;
}

const TYPE_FOR = (id: string): string => {
  if (id.startsWith("plan-")) return "Application";
  if (id.startsWith("bldg-")) return "Permit";
  if (id.startsWith("eng-"))  return "Review";
  return "Other";
};

/** Side drawer detail for a Service row. Shows source + formula trace and lets
 *  the user edit hours-per-instance, current fee, peer median, and target. */
export function ServiceDetail({ service, onClose, fbhr }: Props) {
  const { updateService } = useBuildState();
  if (!service) return null;
  const rate = fbhr?.fbhr ?? 0;
  const unitCost = service.hours * rate;
  const annualCost = unitCost * service.volume;
  const recoveryPct = unitCost > 0 ? (service.fee / unitCost) * 100 : 0;

  const set = (patch: Partial<Service>) => updateService(service.id, patch);

  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`Service · ${TYPE_FOR(service.id)}`}
      title={service.name}
      subtitle={<span><DeptChip code={service.dept}/> <span className="mono" style={{ marginLeft: 6 }}>{service.id}</span></span>}
    >
      <Section title="Source">
        <Row label="Catalog">Service definition · prior fee study Appendix A</Row>
        <Row label="Hours basis">Time-study estimate, validated by department staff</Row>
        <Row label="Volume basis">Permit-system count, FY 24/25 actuals</Row>
      </Section>

      <Section title="Editable inputs">
        <Field label="Hours per instance">
          <EditableNumber
            value={service.hours}
            onChange={(v) => set({ hours: v })}
            step={0.5}
            min={0}
            suffix="h"
            align="left"
          />
        </Field>
        <Field label="Current fee">
          <EditableNumber
            value={service.fee}
            onChange={(v) => set({ fee: v })}
            prefix="$"
            min={0}
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
        <Field label="Recovery target">
          <EditableNumber
            value={service.target}
            onChange={(v) => set({ target: v })}
            suffix="%"
            min={0}
            max={200}
            align="left"
          />
        </Field>
        <Field label="Service name">
          <EditableText value={service.name} onChange={(v) => set({ name: v })}/>
        </Field>
      </Section>

      <Section title="Live computation">
        <Formula
          parts={[
            { l: "Hours / instance",  v: `${service.hours}` },
            { l: "× FBHR (dept)",     v: `$${Math.round(rate)}/hr` },
            { l: "= Unit cost",       v: fmt.dollars(unitCost), bold: true },
            { l: "× Volume / yr",     v: fmt.int(service.volume) },
            { l: "= Annual cost",     v: fmt.dollarsK(annualCost), bold: true },
          ]}
        />
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
          Current recovery: <b style={{ color: recoveryPct >= 80 ? "var(--pos)" : recoveryPct >= 50 ? "var(--warn)" : "var(--neg)" }}>{recoveryPct.toFixed(0)}%</b>
          {" · "}target <b>{service.target}%</b>
        </div>
      </Section>
    </Drawer>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-2)", textTransform: "uppercase",
      }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "140px 1fr", gap: 12,
      fontSize: 12.5, lineHeight: 1.55,
      padding: "4px 0",
    }}>
      <div className="mono" style={{
        fontSize: 10, color: "var(--ink-3)", fontWeight: 600,
        letterSpacing: "0.08em", textTransform: "uppercase", paddingTop: 2,
      }}>{label}</div>
      <div style={{ color: "var(--ink-2)" }}>{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "140px 1fr", gap: 12,
      fontSize: 12.5, alignItems: "center",
      padding: "5px 0",
      borderBottom: "1px dashed var(--rule)",
    }}>
      <div className="mono" style={{
        fontSize: 10, color: "var(--ink-3)", fontWeight: 600,
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

export function Formula({
  parts,
}: {
  parts: { l: string; v: string; bold?: boolean }[];
}) {
  return (
    <div style={{
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      padding: "10px 14px",
      fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
    }}>
      {parts.map((p, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", gap: 10,
          color: p.bold ? "var(--ink)" : "var(--ink-2)",
          fontWeight: p.bold ? 600 : 400,
          borderTop: i > 0 && p.bold ? "1px solid var(--rule)" : "none",
          paddingTop: i > 0 && p.bold ? 4 : 0,
          marginTop: i > 0 && p.bold ? 4 : 0,
        }}>
          <span style={{ color: p.bold ? "var(--ink-2)" : "var(--ink-3)" }}>{p.l}</span>
          <span>{p.v}</span>
        </div>
      ))}
    </div>
  );
}
