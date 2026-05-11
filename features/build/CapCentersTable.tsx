
import { DataTable, type Column } from "@/components/table";
import { fmt } from "@/lib/format";
import { CITY } from "@/lib/data/city";
import { useBuildState } from "./BuildContext";
import { deriveCenters } from "./CapKpiRail";

interface Row {
  id: string;
  idx: number;
  code: string;
  name: string;
  fy: string;
  totalCost: number;
  poolCount: number;
}

/** Cost centers summary derived from CapPools, grouped by center name.
 *  Mirrors the legacy CapCentersTable shape so the screen reads as a faithful
 *  port of the original Claude Design CAP Step-1 view. */
export function CapCentersTable() {
  const { capPools, capCenterOrder } = useBuildState();
  const centers = deriveCenters(capPools, capCenterOrder);
  const rows: Row[] = centers.map((c, i) => {
    // Synthesize a fund-program code from the first pool that belongs to
    // this center, so the column has something useful even though our data
    // model doesn't track Fund-Program at the center level.
    const samplePool = capPools.find((p) => p.center === c.name);
    return {
      id: `center-${i}`,
      idx: i + 1,
      code: samplePool?.id.replace(/^cap-/, "").split("-")[0] ?? "—",
      name: c.name,
      fy: CITY.fiscal,
      totalCost: c.total,
      poolCount: c.pools,
    };
  });

  const cols: Column<Row>[] = [
    {
      key: "idx",
      label: "#",
      width: "44px",
      render: (r) => (
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {r.idx.toString().padStart(2, "0")}
        </span>
      ),
    },
    {
      key: "code",
      label: "Fund-Program",
      width: "120px",
      sortable: true,
      render: (r) => (
        <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
          {r.code}
        </span>
      ),
    },
    {
      key: "name",
      label: "Center",
      width: "minmax(220px, 2fr)",
      sortable: true,
      render: (r) => <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>,
    },
    {
      key: "fy",
      label: "Fiscal year",
      width: "130px",
      sortable: true,
      render: (r) => <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{r.fy}</span>,
    },
    {
      key: "totalCost",
      label: "Total cost",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollarsK(r.totalCost)}</span>,
    },
    {
      key: "poolCount",
      label: "# pools",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.poolCount}</span>,
    },
  ];

  return (
    <DataTable
      title="Cost centers"
      eyebrow="Inputs · Each center groups one or more cost pools below"
      cols={cols}
      rows={rows}
      defaultSort={{ key: "totalCost", dir: "desc" }}
      footerNote={`${rows.length} centers · derived from the cost pools below`}
    />
  );
}
