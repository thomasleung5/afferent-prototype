
import { useMemo } from "react";
import { DataTable, type Column } from "@/components/table";
import { CellInput, RemoveIconButton, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { PolicyException } from "@/lib/types";
import { useBuildState } from "@/lib/store";

export function PolicyExceptions() {
  const {
    policyExceptions, updatePolicyException, addPolicyException,
    removePolicyException, derived,
  } = useBuildState();

  // Match each exception to its underlying fee row(s) by case-insensitive
  // name (same rule targetFor uses), then sum annual subsidy across the
  // matches: annualCost × (1 − target/100). For typical exceptions there's
  // one match; sum guards against duplicate-named fees.
  const subsidyByExceptionId = useMemo(() => {
    const out: Record<string, number> = {};
    for (const exc of policyExceptions) {
      const key = exc.fee.toLowerCase();
      let sub = 0;
      for (const c of derived.comparisons) {
        if (!c.recoverable) continue;
        if (c.name.toLowerCase() !== key) continue;
        sub += Math.max(0, c.annualCost * (1 - c.target / 100));
      }
      out[exc.id] = sub;
    }
    return out;
  }, [policyExceptions, derived.comparisons]);

  const cols: Column<PolicyException>[] = [
    {
      key: "fee",
      label: "Fee",
      width: "minmax(220px, 1.4fr)",
      sortable: true,
      render: (r) => (
        <CellInput
          value={r.fee}
          onChange={(v) => updatePolicyException(r.id, { fee: String(v) })}
          placeholder="Fee name"
        />
      ),
    },
    {
      key: "target",
      label: "Target",
      width: "120px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.target,
      render: (r) => (
        <CellInput
          type="number"
          value={r.target}
          onChange={(v) => updatePolicyException(r.id, { target: Number(v) || 0 })}
          suffix="%"
          min={0}
          max={200}
          align="right"
        />
      ),
    },
    {
      key: "subsidy",
      label: "Annual Subsidy",
      width: "140px",
      align: "right",
      sortable: true,
      sortKey: (r) => subsidyByExceptionId[r.id] ?? 0,
      render: (r) => {
        const sub = subsidyByExceptionId[r.id] ?? 0;
        return (
          <span
            className="num"
            title="Annual cost intentionally funded by the General Fund under this exception."
            style={{ color: sub > 0 ? "var(--ink)" : "var(--ink-4)" }}
          >
            {sub > 0 ? `${fmt.dollarsK(sub)}/yr` : "—"}
          </span>
        );
      },
    },
    {
      key: "note",
      label: "Policy note",
      width: "minmax(220px, 2fr)",
      sortable: true,
      render: (r) => (
        <CellInput
          value={r.note}
          onChange={(v) => updatePolicyException(r.id, { note: String(v) })}
          placeholder="Optional policy note"
        />
      ),
    },
    {
      key: "remove",
      label: "",
      width: "44px",
      align: "center",
      render: (r) => (
        <RemoveIconButton
          title="Remove exception"
          aria-label="Remove exception"
          onClick={() => removePolicyException(r.id)}
        />
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${policyExceptions.length} exceptions`}>
        Fee exceptions
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={policyExceptions}
        onAdd={addPolicyException}
        addLabel="Add fee exception"
        emptyState="No exceptions yet. Department targets apply to every fee."
      />
    </div>
  );
}
