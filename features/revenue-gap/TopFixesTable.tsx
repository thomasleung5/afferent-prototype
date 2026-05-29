
import { useMemo, useState } from "react";
import { DataTable, deriveDeptFilter, applyFilter, type Column, type FilterGroup } from "@/components/table";
import { DeptChip, RecoveryMeter, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { useBuildState } from "@/lib/store";
import type { FeeComparison } from "@/lib/calc";

interface Props {
  limit?: number;
}

interface TopFix extends FeeComparison {
  recovery: number;
}

/** Top revenue opportunities: fees ranked by annual uplift available at
 *  the recommended rate. Pulls from the live comparisons in BuildState —
 *  reflects seed data + imports + edits. Filters to c.recoverable so the
 *  list is consistent with the Revenue Opportunity headline aggregate
 *  (policyImpact applies the same gate). */
export function TopFixesTable({ limit = 12 }: Props) {
  const { derived } = useBuildState();
  const [dept, setDept] = useState("ALL");

  const allRows: TopFix[] = useMemo(() => {
    return derived.comparisons
      .filter((c) => c.recoverable && c.annualUplift > 0)
      .map((c) => ({ ...c, recovery: c.recoveryPct }))
      .sort((a, b) => b.annualUplift - a.annualUplift)
      .slice(0, limit);
  }, [derived.comparisons, limit]);

  const rows = useMemo(() => applyFilter(allRows, "dept", dept), [allRows, dept]);

  const filters: FilterGroup[] = [{
    id: "dept",
    label: "Dept",
    options: deriveDeptFilter(allRows),
    value: dept,
    onChange: setDept,
  }];

  const cols: Column<TopFix>[] = [
    {
      key: "name",
      label: "Service",
      width: "minmax(280px, 2fr)",
      sortable: true,
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "var(--ink)" }}>{r.name}</span>
          <span className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)", letterSpacing: "0.05em" }}>
            {r.id}
          </span>
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "70px",
      align: "center",
      sortable: true,
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "volume",
      label: "Vol/yr",
      width: "70px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.int(r.volume)}</span>,
    },
    {
      key: "fee",
      label: "Current fee",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollars(r.fee)}</span>,
    },
    {
      key: "recommended",
      label: "Recommended",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num" style={{ color: "var(--ink)" }}>{fmt.dollars(r.recommended)}</span>,
    },
    {
      key: "recovery",
      label: "Recovery",
      width: "200px",
      align: "right",
      sortable: true,
      render: (r) => <RecoveryMeter pct={r.recovery} target={r.target} width={130} compact/>,
    },
    {
      key: "annualUplift",
      label: "Annual uplift",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{ color: "var(--pos)", fontWeight: 600 }}>
          {fmt.dollarsK(r.annualUplift)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${allRows.length} service${allRows.length === 1 ? "" : "s"}`}>
        Top revenue opportunities
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        filters={filters}
        defaultSort={{ key: "annualUplift", dir: "desc" }}
      />
    </div>
  );
}
