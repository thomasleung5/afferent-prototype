
import { Drawer, EditableNumber, EditableText } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { OpCategory, OpDept, OperatingLine } from "@/lib/types";
import { useBuildState } from "./BuildContext";
import { Section, Row, Field, Formula } from "./ServiceDetail";

const DEPT_OPTIONS: OpDept[] = ["PLAN", "BLDG", "ENG", "SHARED:CDS"];
const CATEGORIES: OpCategory[] = [
  "Software & subscriptions",
  "Professional services",
  "Training & travel",
  "Office & supplies",
  "Memberships & dues",
  "Vehicles & equipment",
  "Legal noticing",
  "Capital outlay",
  "Other",
];

interface Props {
  line: OperatingLine | null;
  onClose: () => void;
}

export function OperatingDetail({ line, onClose }: Props) {
  const { updateOperating, derived } = useBuildState();
  if (!line) return null;
  const set = (patch: Partial<OperatingLine>) => updateOperating(line.id, patch);

  const isShared = line.dept === "SHARED:CDS";
  const deptRate = isShared || line.dept === "SHARED:CDS"
    ? null
    : derived.operatingByDept[line.dept].rate;

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={`Operating · ${line.category}`}
      title={line.line}
      subtitle={<span className="mono" style={{ fontSize: 11 }}>{line.code} · {line.dept}</span>}
    >
      <Section title="Source">
        <Row label="Code">{line.code}</Row>
        <Row label="Citation">{line.source}</Row>
        <Row label="Routing">
          {isShared
            ? "Shared CDS — split across PLAN / BLDG / ENG by productive-hours share"
            : "Department-direct line — flows into that dept's Operating $/hr"}
        </Row>
        {!line.include && line.excludeReason && (
          <Row label="Excluded">{line.excludeReason}</Row>
        )}
      </Section>

      <Section title="Editable inputs">
        <Field label="Line item">
          <EditableText value={line.line} onChange={(v) => set({ line: v })}/>
        </Field>
        <Field label="Amount">
          <EditableNumber value={line.amount} onChange={(v) => set({ amount: v })} prefix="$" min={0} step={100} align="left"/>
        </Field>
        <Field label="Department">
          <select
            value={line.dept}
            onChange={(e) => set({ dept: e.target.value as OpDept })}
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid var(--rule)", background: "var(--paper)" }}
          >
            {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select
            value={line.category}
            onChange={(e) => set({ category: e.target.value as OpCategory })}
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid var(--rule)", background: "var(--paper)" }}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Include in $/hr">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={line.include}
              onChange={(e) => set({ include: e.target.checked })}
            />
            <span style={{ color: "var(--ink-2)" }}>
              {line.include ? "Included in dept Operating $/hr" : "Excluded — visible for audit only"}
            </span>
          </label>
        </Field>
        {!line.include && (
          <Field label="Exclude reason">
            <EditableText
              value={line.excludeReason ?? ""}
              onChange={(v) => set({ excludeReason: v })}
              placeholder="e.g. One-time capital, reimbursed, pass-through"
            />
          </Field>
        )}
      </Section>

      <Section title="Live computation">
        {line.include ? (
          isShared ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
              Splits {fmt.dollars(line.amount)} across PLAN / BLDG / ENG by productive-hours share.
              See the per-dept rollup on the Operating screen for the resulting $/hr.
            </div>
          ) : (
            <Formula
              parts={[
                { l: "This line",         v: fmt.dollars(line.amount) },
                { l: "Dept operating $/hr (current)", v: deptRate != null ? `$${Math.round(deptRate)}` : "—", bold: true },
              ]}
            />
          )
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            Excluded — does not affect dept Operating $/hr.
          </div>
        )}
      </Section>
    </Drawer>
  );
}
