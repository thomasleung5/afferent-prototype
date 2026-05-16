
import { useMemo, useState } from "react";
import { DataTable, deriveDeptFilter, applyFilter, type Column, type FilterGroup } from "@/components/table";
import { DeptChip, RecoveryMeter, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { topFixes, type TopFix } from "@/lib/calc";
import { SERVICES } from "@/lib/data/services";

interface Props {
  limit?: number;
}

/** Top fees by largest cost-recovery shortfall. Exercise of the shared DataTable. */
export function TopFixesTable({ limit = 12 }: Props) {
  const [dept, setDept] = useState("ALL");

  const allRows = useMemo(() => topFixes(SERVICES, limit), [limit]);
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
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: "0.05em" }}>
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
      <SectionLabel right={`${allRows.length} services`}>
        Fees with the largest cost-recovery shortfall
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
