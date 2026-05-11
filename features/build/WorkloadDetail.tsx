
import { Drawer, EditableNumber } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode, Service, WorkloadRow } from "@/lib/types";
import { useBuildState } from "./BuildContext";
import { Section, Row, Field, Formula } from "./ServiceDetail";

interface Props {
  row: (WorkloadRow & { name: string; dept: DeptCode }) | null;
  service: Service | null;
  onClose: () => void;
}

export function WorkloadDetail({ row, service, onClose }: Props) {
  const { updateWorkload, derived } = useBuildState();
  if (!row || !service) return null;
  const fbhr = derived.fbhr[row.dept]?.fbhr ?? 0;
  const unitCost = service.hours * fbhr;
  const annualCost = unitCost * (row.current ?? 0);

  const changeAbs =
    row.current == null || row.prior == null ? null : row.current - row.prior;
  const changePct =
    row.current == null || row.prior == null || row.prior === 0
      ? null
      : ((row.current - row.prior) / row.prior) * 100;

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={`Workload · ${row.unit}`}
      title={row.name}
      subtitle={<span className="mono" style={{ fontSize: 11 }}>{row.id} · {row.dept}</span>}
    >
      <Section title="Source">
        <Row label="Status">
          <span style={{ color: row.flag ? "var(--warn)" : "var(--ink-2)" }}>{row.status}</span>
        </Row>
        <Row label="Origin">
          {row.source === "carry-forward" ? "Reused from prior study — needs confirmation"
            : row.source === "missing" ? "No current-year volume available"
            : row.source === "manual" ? "Manually entered by analyst"
            : "Permit-system export"}
        </Row>
        {row.sourceFile && <Row label="File">{row.sourceFile}</Row>}
        <Row label="Prior volume">{row.prior?.toLocaleString() ?? "—"}</Row>
      </Section>

      <Section title="Editable inputs">
        <Field label="Current volume">
          <EditableNumber
            value={row.current ?? 0}
            onChange={(v) => updateWorkload(row.id, {
              current: v,
              status: "Manual",
              source: "manual",
              flag: undefined,
            })}
            min={0}
            step={1}
            align="left"
            placeholder="enter"
          />
        </Field>
        <Field label="Prior volume">
          <EditableNumber
            value={row.prior ?? 0}
            onChange={(v) => updateWorkload(row.id, { prior: v })}
            min={0}
            step={1}
            align="left"
          />
        </Field>
        <Field label="Unit">
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{row.unit}</span>
        </Field>
      </Section>

      <Section title="Live computation">
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          Change vs prior:{" "}
          {changePct == null ? <span>—</span> : (
            <b style={{ color: (changePct ?? 0) > 0 ? "var(--pos)" : (changePct ?? 0) < 0 ? "var(--neg)" : "var(--ink)" }}>
              {(changeAbs ?? 0) > 0 ? "+" : ""}{changeAbs} ({changePct.toFixed(0)}%)
            </b>
          )}
        </div>
        <Formula
          parts={[
            { l: "Service hours",      v: `${service.hours} h` },
            { l: "× FBHR (dept)",      v: `$${Math.round(fbhr)}/hr` },
            { l: "= Unit cost",        v: fmt.dollars(unitCost), bold: true },
            { l: "× Current volume",   v: (row.current ?? 0).toLocaleString() },
            { l: "= Annual cost",      v: fmt.dollarsK(annualCost), bold: true },
          ]}
        />
      </Section>
    </Drawer>
  );
}
