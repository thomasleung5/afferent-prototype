
import { DataTable, type Column } from "@/components/table";
import { CellInput, Icon, SectionLabel } from "@/components/ui";
import type { PolicyException } from "@/lib/types";
import { useBuildState } from "@/lib/store";

export function PolicyExceptions() {
  const { policyExceptions, updatePolicyException, addPolicyException, removePolicyException } = useBuildState();

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
        <button
          onClick={() => removePolicyException(r.id)}
          title="Remove exception"
          aria-label="Remove exception"
          style={{
            width: 24, height: 24,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--ink-4)", background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Icon name="close" size={11}/>
        </button>
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
