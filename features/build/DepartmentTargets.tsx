
import { useEffect, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/table";
import { CellInput, DeptChip, SectionLabel } from "@/components/ui";
import { DEPTS } from "@/lib/data/departments";
import { fmt } from "@/lib/format";
import type { DeptCode, PolicyTarget } from "@/lib/types";
import { useBuildState } from "@/lib/store";

export function DepartmentTargets() {
  const { policyTargets, updatePolicyTarget, derived } = useBuildState();
  const { dept: searchDept } = useSearch({ from: "/build/policy" });
  const activeTargets = useMemo(
    () => policyTargets.filter((t) => derived.activeFeeDepts.includes(t.dept)),
    [policyTargets, derived.activeFeeDepts],
  );

  // Annual subsidy per dept: Σ annualCost × (1 − effectiveTarget/100) across
  // recoverable fees in the dept, using each fee's effective target (so any
  // exception override is reflected). The dept-level subsidy is what the
  // General Fund covers under the currently-saved policy.
  const subsidyByDept = useMemo(() => {
    const out: Partial<Record<DeptCode, number>> = {};
    for (const c of derived.comparisons) {
      if (!c.recoverable) continue;
      const sub = c.annualCost * (1 - c.target / 100);
      out[c.dept] = (out[c.dept] ?? 0) + Math.max(0, sub);
    }
    return out;
  }, [derived.comparisons]);

  // ?dept=... cross-nav from Functional Allocation: scroll the matching
  // dept row into view and flash it briefly. Same row-flash pattern as
  // BenchmarksTable / CostOfServiceTable / FeeScheduleTable.
  useEffect(() => {
    if (!searchDept) return;
    const row = activeTargets.find((t) => t.dept === searchDept);
    if (!row) return;
    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(row.id)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("row-flash");
      window.setTimeout(() => el.classList.remove("row-flash"), 1700);
    }, 30);
    return () => window.clearTimeout(handle);
  }, [searchDept, activeTargets]);

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
      width: "150px",
      align: "right",
      sortable: true,
      sortKey: (r) => r.target,
      render: (r) => (
        <CellInput
          type="number"
          value={r.target}
          onChange={(v) => updatePolicyTarget(r.id, { target: Number(v) || 0 })}
          suffix="%"
          min={0}
          max={100}
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
      sortKey: (r) => subsidyByDept[r.dept] ?? 0,
      render: (r) => {
        const sub = subsidyByDept[r.dept] ?? 0;
        return (
          <span
            className="num"
            title="Annual cost intentionally funded by the General Fund under this target."
            style={{ color: sub > 0 ? "var(--ink)" : "var(--ink-4)" }}
          >
            {sub > 0 ? `${fmt.dollarsK(sub)}/yr` : "—"}
          </span>
        );
      },
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
      <SectionLabel right={`${activeTargets.length} departments`}>
        Department targets
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={activeTargets}
        defaultSort={{ key: "dept", dir: "asc" }}
      />
    </div>
  );
}
