
import { DataTable, type Column } from "@/components/table";
import { CellInput, SectionLabel, SourcePill } from "@/components/ui";
import type { SourceTag } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { deriveCenters } from "./CapKpiRail";

interface Row {
  id: string;
  idx: number;
  code: string;
  name: string;
  totalCost: number;
  poolCount: number;
  source: SourceTag;
  sourceFile?: string;
}

/** Cost centers summary derived from CapPools, grouped by center name.
 *  Mirrors the legacy CapCentersTable shape so the screen reads as a faithful
 *  port of the original Claude Design CAP Step-1 view. */
export function CapCentersTable() {
  const {
    capPools, capCenterOrder, capCenterTotals, capCenterSources,
    addCapCenter, renameCapCenter, updateCenterTotal,
  } = useBuildState();
  const centers = deriveCenters(capPools, capCenterOrder);
  const rows: Row[] = centers.map((c, i) => {
    // Synthesize a fund-program code from the first pool that belongs to
    // this center, so the column has something useful even though our data
    // model doesn't track Fund-Program at the center level.
    const samplePool = capPools.find((p) => p.center === c.name);
    const provenance = capCenterSources[c.name];
    return {
      id: `center-${i}`,
      idx: i + 1,
      code: samplePool?.id.replace(/^cap-/, "").split("-")[0] ?? "—",
      name: c.name,
      // Source-department total cost — the 100% reference. Falls back to
      // the derived sum (Σ pool.amount) for centers whose totals haven't
      // been persisted yet.
      totalCost: capCenterTotals[c.name] ?? c.total,
      poolCount: c.pools,
      source: provenance?.source ?? "seed",
      sourceFile: provenance?.sourceFile,
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
      width: "minmax(260px, 2.4fr)",
      sortable: true,
      render: (r) => (
        <CellInput
          value={r.name}
          onChange={(v) => {
            const next = String(v).trim();
            if (next && next !== r.name) renameCapCenter(r.name, next);
          }}
        />
      ),
    },
    {
      key: "totalCost",
      label: "Total cost",
      width: "140px",
      align: "right",
      sortable: true,
      render: (r) => (
        <CellInput
          type="currency" value={Math.round(r.totalCost)} min={0}
          onChange={(v) => updateCenterTotal(r.name, Number(v) || 0)}
          align="right" prefix="$"
        />
      ),
    },
    {
      key: "poolCount",
      label: "# pools",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.poolCount}</span>,
    },
    {
      key: "source",
      label: "Source",
      width: "150px",
      align: "right",
      sortable: true,
      sortKey: (r: Row) => r.sourceFile ?? r.source,
      render: (r) => <SourcePill source={r.source} sourceFile={r.sourceFile}/>,
    },
  ];

  return (
    <div>
      <SectionLabel right={`${rows.length} centers`}>
        Cost centers
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        onAdd={addCapCenter}
        addLabel="Add cost center"
        defaultSort={{ key: "totalCost", dir: "desc" }}
      />
    </div>
  );
}
