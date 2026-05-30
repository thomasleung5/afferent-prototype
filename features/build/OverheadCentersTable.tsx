
import { DataTable, type Column } from "@/components/table";
import { CellInput, SectionLabel, SourcePill } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { SourceTag } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { deriveCenters } from "./OverheadKpiRail";

interface Row {
  id: string;
  idx: number;
  code: string;
  name: string;
  totalCost: number;
  disallowed: number;
  netAllocable: number;
  source: SourceTag;
  sourceFile?: string;
}

/** Cost centers summary derived from CapPools, grouped by center name.
 *  Three editable money columns: Total Expenses (gross/source), Disallowed
 *  Expenses (the carve-out before allocation), and Net Allocable Expenses
 *  (= Total − Disallowed, read-only). All downstream math reads pool.amount,
 *  which is derived from the NET — toggling Disallowed propagates through
 *  the engine, CAP rates, FBHR, and the fee study automatically. */
interface CenterRowAug extends Row {
  key: string;
}

export function OverheadCentersTable() {
  const {
    capPools, capCenterOrder, capCenterTotals, capCenterDisallowed, capCenterSources,
    addCapCenter, renameCapCenter, updateCenterTotal, updateCenterDisallowed,
    setCapCenterOrder,
  } = useBuildState();
  const centers = deriveCenters(capPools, capCenterOrder, capCenterSources);
  const rows: CenterRowAug[] = centers.map((c, i) => {
    const provenance = capCenterSources[c.key];
    // Total Expenses (gross). Falls back to derived Σ pool.amount only when
    // no stored total exists — that path treats the imported pool sum as
    // the gross figure (net = gross since disallowed is 0 by default).
    const totalCost = capCenterTotals[c.key] ?? c.total;
    const disallowed = capCenterDisallowed[c.key] ?? 0;
    const netAllocable = Math.max(0, totalCost - disallowed);
    // The center's identity key IS its glCode for imported centers
    // ("011-1100", "BLDG", etc.). Synth `seed:center:*` keys show "—" since
    // those have no published code.
    const code = c.key.startsWith("seed:center:") ? "—" : c.key;
    return {
      key: c.key,
      id: `center-${i}`,
      idx: i + 1,
      code,
      name: c.name,
      totalCost,
      disallowed,
      netAllocable,
      source: provenance?.source ?? "seed",
      sourceFile: provenance?.sourceFile,
    };
  });

  const cols: Column<Row>[] = [
    {
      key: "idx",
      label: "#",
      width: "44px",
      sortable: true,
      render: (r) => (
        <span className="mono" style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>
          {r.idx.toString().padStart(2, "0")}
        </span>
      ),
    },
    {
      key: "code",
      label: "Code",
      width: "110px",
      sortable: true,
      render: (r) => (
        <span className="mono" style={{
          fontSize: "var(--t-l4)",
          color: r.code === "—" ? "var(--ink-4)" : "var(--ink-3)",
          letterSpacing: "0.02em", fontWeight: 400,
        }}>{r.code}</span>
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
            if (next && next !== r.name) renameCapCenter((r as CenterRowAug).key, next);
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
          onChange={(v) => updateCenterTotal((r as CenterRowAug).key, Number(v) || 0)}
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
          onChange={(v) => updateCenterDisallowed((r as CenterRowAug).key, Number(v) || 0)}
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
            color: r.disallowed > 0 ? "var(--ink)" : "var(--ink-2)",
          }}
        >{fmt.dollars(r.netAllocable)}</span>
      ),
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
      <div style={{
        fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5,
        marginBottom: 8,
      }}>
        Allocation sequence affects downstream cost allocations.
      </div>
      <DataTable
        cols={cols}
        rows={rows}
        onAdd={addCapCenter}
        addLabel="Add cost center"
        defaultSort={{ key: "idx", dir: "asc" }}
        onReorderRow={(fromIdx, toIdx) => {
          // Translate the displayed (sortedRows) positions back into a new
          // capCenterOrder. With defaultSort=idx asc, the displayed order
          // matches centers[], so we can splice directly on center keys.
          const order = centers.map((c) => c.key);
          if (fromIdx < 0 || fromIdx >= order.length) return;
          if (toIdx < 0 || toIdx >= order.length) return;
          const [moved] = order.splice(fromIdx, 1);
          order.splice(toIdx, 0, moved);
          setCapCenterOrder(order);
        }}
      />
    </div>
  );
}
