
import { DataTable, type Column } from "@/components/table";
import { CellInput, SectionLabel, SourcePill } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { SourceTag } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { deriveCenters } from "./CapKpiRail";

interface Row {
  id: string;
  idx: number;
  code: string;
  name: string;
  totalCost: number;
  disallowed: number;
  netAllocable: number;
  poolCount: number;
  source: SourceTag;
  sourceFile?: string;
}

/** Cost centers summary derived from CapPools, grouped by center name.
 *  Three editable money columns: Total Expenses (gross/source), Disallowed
 *  Expenses (the carve-out before allocation), and Net Allocable Expenses
 *  (= Total − Disallowed, read-only). All downstream math reads pool.amount,
 *  which is derived from the NET — toggling Disallowed propagates through
 *  the engine, CAP rates, FBHR, and the fee study automatically. */
export function CapCentersTable() {
  const {
    capPools, capCenterOrder, capCenterTotals, capCenterDisallowed, capCenterSources,
    addCapCenter, renameCapCenter, updateCenterTotal, updateCenterDisallowed,
  } = useBuildState();
  const centers = deriveCenters(capPools, capCenterOrder);
  const rows: Row[] = centers.map((c, i) => {
    // Synthesize a fund-program code from the first pool that belongs to
    // this center, so the column has something useful even though our data
    // model doesn't track Fund-Program at the center level.
    const samplePool = capPools.find((p) => p.center === c.name);
    const provenance = capCenterSources[c.name];
    // Total Expenses (gross). Falls back to derived Σ pool.amount only when
    // no stored total exists — that path treats the imported pool sum as
    // the gross figure (net = gross since disallowed is 0 by default).
    const totalCost = capCenterTotals[c.name] ?? c.total;
    const disallowed = capCenterDisallowed[c.name] ?? 0;
    const netAllocable = Math.max(0, totalCost - disallowed);
    return {
      id: `center-${i}`,
      idx: i + 1,
      code: samplePool?.id.replace(/^cap-/, "").split("-")[0] ?? "—",
      name: c.name,
      totalCost,
      disallowed,
      netAllocable,
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
      width: "110px",
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
      label: "Total Expenses",
      width: "150px",
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
      key: "disallowed",
      label: "Disallowed",
      width: "150px",
      align: "right",
      sortable: true,
      render: (r) => (
        <CellInput
          type="currency"
          value={Math.round(r.disallowed)}
          min={0}
          max={Math.round(r.totalCost)}
          onChange={(v) => updateCenterDisallowed(r.name, Number(v) || 0)}
          align="right" prefix="$"
        />
      ),
    },
    {
      key: "netAllocable",
      label: "Net Allocable",
      width: "150px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span
          className="num"
          title={r.disallowed > 0
            ? `${fmt.dollars(r.totalCost)} − ${fmt.dollars(r.disallowed)} = ${fmt.dollars(r.netAllocable)}`
            : "All expenses are allocable"}
          style={{
            fontWeight: 500,
            color: r.disallowed > 0 ? "var(--ink)" : "var(--ink-2)",
          }}
        >{fmt.dollars(r.netAllocable)}</span>
      ),
    },
    {
      key: "poolCount",
      label: "# pools",
      width: "70px",
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
        defaultSort={{ key: "netAllocable", dir: "desc" }}
      />
    </div>
  );
}
