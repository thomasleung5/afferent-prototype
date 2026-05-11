
import { Drawer, EditableNumber, EditableText, DeptChip } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode, Position } from "@/lib/types";
import { useBuildState } from "./BuildContext";
import { Section, Row, Field, Formula } from "./ServiceDetail";

const DEPT_OPTIONS: DeptCode[] = ["PLAN", "BLDG", "ENG"];

interface Props {
  position: Position | null;
  onClose: () => void;
}

export function PositionDetail({ position, onClose }: Props) {
  const { updatePosition } = useBuildState();
  if (!position) return null;
  const comp = (position.salary + position.benefits) * position.fte;
  const hrs = position.hours * position.fte;
  const hourly = position.hours > 0 ? (position.salary + position.benefits) / position.hours : 0;
  const set = (patch: Partial<Position>) => updatePosition(position.id, patch);

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Position"
      title={position.title}
      subtitle={<span><DeptChip code={position.dept}/> <span className="mono" style={{ marginLeft: 6 }}>{position.id}</span></span>}
    >
      {position.flag && (
        <div style={{
          padding: "8px 12px", marginBottom: 16,
          background: "var(--warn-tint)", border: "1px solid var(--warn)",
          fontSize: 12, color: "var(--ink-2)",
        }}>
          ⚠ {position.flag === "title-changed" ? "Title changed since prior study — confirm mapping." : "Missing productive hours — needs staff input."}
        </div>
      )}

      <Section title="Source">
        <Row label="Roster">FY 26-27 Salary Table.xlsx · imported Apr 18, 2026</Row>
        <Row label="Benefits basis">Position-level loaded rate, employer share only</Row>
        <Row label="Productive hrs">Paid hrs less PTO, holiday, training · 1,720 default</Row>
      </Section>

      <Section title="Editable inputs">
        <Field label="Title">
          <EditableText value={position.title} onChange={(v) => set({ title: v })}/>
        </Field>
        <Field label="Department">
          <select
            value={position.dept}
            onChange={(e) => set({ dept: e.target.value as DeptCode })}
            style={{
              fontSize: 13, padding: "4px 8px",
              border: "1px solid var(--rule)", background: "var(--paper)",
            }}
          >
            {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="FTE">
          <EditableNumber value={position.fte} onChange={(v) => set({ fte: v })} step={0.05} min={0} max={2} align="left"/>
        </Field>
        <Field label="Salary">
          <EditableNumber value={position.salary} onChange={(v) => set({ salary: v })} prefix="$" min={0} step={1000} align="left"/>
        </Field>
        <Field label="Benefits">
          <EditableNumber value={position.benefits} onChange={(v) => set({ benefits: v })} prefix="$" min={0} step={1000} align="left"/>
        </Field>
        <Field label="Productive hrs">
          <EditableNumber value={position.hours} onChange={(v) => set({ hours: v })} min={0} step={20} align="left"/>
        </Field>
      </Section>

      <Section title="Live computation">
        <Formula
          parts={[
            { l: "Salary + benefits",  v: fmt.dollars(position.salary + position.benefits) },
            { l: "× FTE",              v: position.fte.toFixed(2) },
            { l: "= Total comp",       v: fmt.dollars(comp), bold: true },
            { l: "÷ Productive hrs",   v: position.hours.toLocaleString() },
            { l: "= Direct $/hr",      v: `$${Math.round(hourly)}`, bold: true },
            { l: "FTE-weighted hrs",   v: Math.round(hrs).toLocaleString() },
          ]}
        />
      </Section>
    </Drawer>
  );
}
