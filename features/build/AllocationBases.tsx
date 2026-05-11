
import { DataTable, type Column } from "@/components/table";
import { fmt } from "@/lib/format";
import {
  ALLOCATION_BASES, ALLOCATION_BASIS_ROWS,
  type AllocationBasisKey, type BasisRow,
} from "@/lib/data/allocationBases";
import { useBuildState } from "@/lib/store";

interface BasisSummaryRow {
  id: string;
  basis: string;
  pools: number;
  totalAllocated: number;
  examplePools: string[];
}

/** Step 3 of the CAP flow. Primary view is the department × basis denominator
 *  matrix — the table the city's CAP workbook is actually built around. The
 *  pool-roll-up summary below is supporting context so a reviewer can see
 *  which pools use which basis without leaving the page. */
export function AllocationBases() {
  const { capPools } = useBuildState();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Matrix/>
      <BasisSummary capPools={capPools}/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix (primary view)
// ---------------------------------------------------------------------------

function formatCell(value: number | undefined, fmtKind: string): string {
  if (value == null || value === 0) return "—";
  if (fmtKind === "k")        return fmt.dollarsK(value * 1000);
  if (fmtKind === "decimal")  return value.toFixed(2);
  return fmt.int(value);
}

function colTotal(key: AllocationBasisKey, rows: BasisRow[]): number {
  return rows.reduce((a, r) => a + (r.values[key] ?? 0), 0);
}

function Matrix() {
  const indirect = ALLOCATION_BASIS_ROWS.filter((r) => r.group === "indirect");
  const direct   = ALLOCATION_BASIS_ROWS.filter((r) => r.group === "direct");

  const labelCol = "minmax(220px, 1.8fr)";
  const grid = `40px ${labelCol} ${ALLOCATION_BASES.map(() => "minmax(76px, 1fr)").join(" ")}`;

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      overflow: "hidden",
    }}>
      {/* Title bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        padding: "12px 18px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--paper)",
      }}>
        <div>
          <div className="display" style={{ fontSize: 14.5, fontWeight: 600 }}>
            Department × allocation basis
          </div>
          <div className="mono" style={{
            fontSize: 10.5, color: "var(--ink-3)", marginTop: 3,
            letterSpacing: "0.04em",
          }}>
            {indirect.length} indirect · {direct.length} direct · {ALLOCATION_BASES.length} bases
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          Each column is the denominator for one or more pools
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1280 }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 10,
            padding: "10px 16px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule-strong)",
            fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
            letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            <div>#</div>
            <div>Department</div>
            {ALLOCATION_BASES.map((b) => (
              <div key={b.key} title={b.note} style={{ textAlign: "right" }}>{b.label}</div>
            ))}
          </div>

          {/* Indirect section label */}
          <GroupLabel cols={2 + ALLOCATION_BASES.length}>Indirect cost centers</GroupLabel>
          {indirect.map((r, i) => (
            <MatrixRow key={r.code} idx={i + 1} row={r} grid={grid}/>
          ))}

          {/* Direct section label */}
          <GroupLabel cols={2 + ALLOCATION_BASES.length}>Direct (fee-modeled) departments</GroupLabel>
          {direct.map((r, i) => (
            <MatrixRow key={r.code} idx={i + 1} row={r} grid={grid}/>
          ))}

          {/* Totals row */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 10,
            padding: "11px 16px",
            background: "var(--paper-2)",
            borderTop: "2px solid var(--ink)",
            fontFamily: "var(--ff-mono)",
            fontVariantNumeric: "tabular-nums",
            fontSize: 12, fontWeight: 600,
          }}>
            <div/>
            <div className="mono" style={{
              fontSize: 10.5, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--ink-2)",
            }}>Citywide total</div>
            {ALLOCATION_BASES.map((b) => {
              const t = colTotal(b.key, ALLOCATION_BASIS_ROWS);
              return (
                <div key={b.key} className="num" style={{
                  textAlign: "right", fontSize: 12,
                }}>{formatCell(t, b.fmt)}</div>
              );
            })}
          </div>

          {/* Unit row */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 10,
            padding: "7px 16px",
            background: "var(--paper-2)",
            borderTop: "1px solid var(--rule)",
            fontFamily: "var(--ff-mono)",
            fontSize: 10, color: "var(--ink-3)",
            letterSpacing: "0.04em",
          }}>
            <div/>
            <div style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Unit</div>
            {ALLOCATION_BASES.map((b) => (
              <div key={b.key} style={{ textAlign: "right" }}>{b.unit}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { cols: number; children: string }) {
  return (
    <div style={{
      padding: "8px 16px",
      background: "var(--paper-2)",
      borderBottom: "1px solid var(--rule)",
      fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.12em", color: "var(--ink-3)", textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

function MatrixRow({ idx, row, grid }: { idx: number; row: BasisRow; grid: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: grid, gap: 10,
      padding: "9px 16px",
      borderBottom: "1px solid var(--rule)",
      alignItems: "baseline",
      fontFamily: "var(--ff-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: 12,
    }}>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
        {idx.toString().padStart(2, "0")}
      </span>
      <div style={{ fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--ink)" }}>
        <span style={{ fontWeight: 500 }}>{row.name}</span>{" "}
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
          {row.code}
        </span>
      </div>
      {ALLOCATION_BASES.map((b) => {
        const v = row.values[b.key];
        const empty = v == null || v === 0;
        return (
          <div key={b.key} className="num" style={{
            textAlign: "right",
            color: empty ? "var(--ink-4)" : "var(--ink)",
            fontSize: 12,
          }}>
            {formatCell(v, b.fmt)}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supporting context — bases used by the current pool inventory
// ---------------------------------------------------------------------------

function BasisSummary({ capPools }: { capPools: ReturnType<typeof useBuildState>["capPools"] }) {
  const byBasis = new Map<string, { pools: number; total: number; examples: string[] }>();
  for (const p of capPools) {
    const key = p.basis || "—";
    const cur = byBasis.get(key) ?? { pools: 0, total: 0, examples: [] };
    cur.pools += 1;
    cur.total += p.amount;
    if (cur.examples.length < 3) cur.examples.push(p.pool);
    byBasis.set(key, cur);
  }

  const rows: BasisSummaryRow[] = [...byBasis.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([basis, v], i) => ({
      id: `basis-${i}`,
      basis,
      pools: v.pools,
      totalAllocated: v.total,
      examplePools: v.examples,
    }));

  const cols: Column<BasisSummaryRow>[] = [
    {
      key: "basis",
      label: "Allocation basis",
      width: "minmax(280px, 2fr)",
      sortable: true,
      render: (r) => <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{r.basis}</span>,
    },
    {
      key: "pools",
      label: "Used by",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num">
          {r.pools}<span style={{ color: "var(--ink-3)", fontWeight: 400 }}> pool{r.pools === 1 ? "" : "s"}</span>
        </span>
      ),
    },
    {
      key: "totalAllocated",
      label: "Pool dollars",
      width: "130px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollarsK(r.totalAllocated)}</span>,
    },
    {
      key: "examplePools",
      label: "Example pools",
      width: "minmax(240px, 2fr)",
      render: (r) => (
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {r.examplePools.join(" · ")}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      title="Bases used by current pool inventory"
      eyebrow={`Reference · ${rows.length} unique bases mapped to ${capPools.length} pools`}
      cols={cols}
      rows={rows}
      defaultSort={{ key: "totalAllocated", dir: "desc" }}
      footerNote="Each pool is allocated using exactly one basis. The matrix above is the denominator; the table is the numerator inventory."
    />
  );
}
