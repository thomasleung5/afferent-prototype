
import { DataTable, type Column } from "@/components/table";
import { CellInput, DeptChip, SectionLabel } from "@/components/ui";
import { DEPTS } from "@/lib/data/departments";
import type { PolicyTarget } from "@/lib/types";
import { useBuildState } from "@/lib/store";

function Bar({ pct }: { pct: number }) {
  return (
    <div style={{
      width: 110, height: 4,
      background: "var(--paper-3)",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${Math.max(0, Math.min(100, pct))}%`,
        background: "var(--ink-2)",
      }}/>
    </div>
  );
}

export function DepartmentTargets() {
  const { policyTargets, updatePolicyTarget } = useBuildState();

  const cols: Column<PolicyTarget>[] = [
    {
      key: "dept",
      label: "Department",
      width: "minmax(200px, 1.4fr)",
      sortable: true,
      sortKey: (r) => DEPTS[r.dept].name,
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <DeptChip code={r.dept}/>
          <span style={{ fontWeight: 500 }}>
            {DEPTS[r.dept].name.replace(" Administration", "")}
          </span>
        </span>
      ),
    },
    {
      key: "target",
      label: "Target Recovery",
      width: "240px",
      sortable: true,
      sortKey: (r) => r.target,
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Bar pct={r.target}/>
          <div style={{ width: 70 }}>
            <CellInput
              type="number"
              value={r.target}
              onChange={(v) => updatePolicyTarget(r.id, { target: Number(v) || 0 })}
              suffix="%"
              min={0}
              max={100}
              align="right"
            />
          </div>
        </div>
      ),
    },
    {
      key: "note",
      label: "Notes",
      width: "minmax(200px, 2fr)",
      sortable: true,
      render: (r) => (
        <CellInput
          value={r.note}
          onChange={(v) => updatePolicyTarget(r.id, { note: String(v) })}
          placeholder="Optional policy note"
        />
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${policyTargets.length} departments`}>
        Department targets
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={policyTargets}
        defaultSort={{ key: "dept", dir: "asc" }}
      />
    </div>
  );
}
