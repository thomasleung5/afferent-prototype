
import { useSearch } from "@tanstack/react-router";
import { DeptSummaryTable, Ledger, MetaGrid, type DeptSummaryRow } from "@/components/table";
import { DeptCellHeader, RateFormula, SectionLabel, TotalEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import { poolToFeeDept } from "@/lib/data/capStepDownGl";
import { useBuildState } from "@/lib/store";

const ORDER: DeptCode[] = FEE_DEPTS;
const labelOf = deptName;

/** Per-dept CAP rollup. Each row expands to a pool ledger + method/formula/source.
 *  Allocated $ is read-only here — it's an output of the step-down engine over
 *  the cost pools, not a manually-entered override. */
export function CapSummary() {
  const { capPools, derived } = useBuildState();
  const { dept: searchDept } = useSearch({ from: "/build/cap" });
  const totalAllocated = ORDER.reduce((a, d) => a + derived.capAllocated[d], 0);
  const poolTotal = capPools.reduce((a, p) => a + p.amount, 0);

  // Pre-computed in useBuildState. Used here for the per-pool drilldown
  // breakdown (model.alloc2[poolId][deptCode]).
  const model = derived.capStepDown;

  // Only render depts that actually receive CAP allocation in the
  // active jurisdiction. Other depts get hidden rather than emit a
  // zero-data row.
  const activeDepts = ORDER.filter((d) => derived.capAllocated[d] > 0);
  const rows: DeptSummaryRow[] = activeDepts.map((d) => {
    const allocated = derived.capAllocated[d];
    const rate = derived.fbhr[d].capRate;
    const sorted = capPools
      .map((p) => ({ poolId: p.id, allocated: poolToFeeDept(model, p.id, d) }))
      .filter((p) => p.allocated > 0.5)
      .sort((a, b) => b.allocated - a.allocated);
    const top = sorted[0];
    const topPool = top ? capPools.find((p) => p.id === top.poolId) : null;
    const topPct = top && allocated > 0 ? Math.round((top.allocated / allocated) * 100) : 0;

    return {
      key: d,
      cells: {
        dept: <DeptCellHeader code={d}/>,
        alloc: <span className="num">{fmt.dollars(allocated)}</span>,
        perHr: rate > 0 ? `$${Math.round(rate)}` : "—",
        pools: sorted.length,
        top: topPool ? (
          <span>
            <span style={{ color: "var(--ink)" }}>{topPool.pool}</span>
            <span style={{ color: "var(--ink-3)", marginLeft: 8 }}>({topPct}%)</span>
          </span>
        ) : <span style={{ color: "var(--ink-3)" }}>—</span>,
      },
      drilldown: (
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 12 }}>
          <Ledger
            cols={[
              { key: "pool",  label: "Pool",  width: "1fr" },
              { key: "basis", label: "Basis", width: "160px" },
              { key: "share", label: "Share", width: "80px",  align: "right" },
              { key: "alloc", label: "Allocated", width: "110px", align: "right" },
            ]}
            rows={sorted.filter((p) => p.allocated > 0).slice(0, 8).map((p) => {
              const pool = capPools.find((x) => x.id === p.poolId);
              const pct = allocated > 0 ? Math.round((p.allocated / allocated) * 100) : 0;
              return {
                key: p.poolId,
                cells: {
                  pool:  <span style={{ color: "var(--ink-2)" }}>{pool?.pool ?? p.poolId}</span>,
                  basis: <span className="mono" style={{ color: "var(--ink-3)", fontSize: "var(--t-l8)" }}>{pool?.basis ?? "—"}</span>,
                  share: <span className="num" style={{ color: "var(--ink-3)" }}>{pct}%</span>,
                  alloc: <span className="num" style={{ fontWeight: 600 }}>{fmt.dollars(p.allocated)}</span>,
                },
              };
            })}
            total={{
              pool: <TotalEyebrow>Total to {labelOf(d)}</TotalEyebrow>,
              basis: "",
              share: <span className="num">100%</span>,
              alloc: <span className="num">{fmt.dollars(allocated)}</span>,
            }}
          />
          <MetaGrid
            rows={[
              { label: "Formula", value: (
                <RateFormula
                  formula="$/hr = allocated $ ÷ productive hrs"
                  numerator={allocated}
                  hours={derived.fbhr[d].productiveHours}
                  rate={rate}
                />
              )},
            ]}
          />
        </div>
      ),
    };
  });

  return (
    <div>
      <SectionLabel right={`${rows.length} departments · ${capPools.length} pools`}>
        Allocated overhead by department
      </SectionLabel>
      <DeptSummaryTable
        autoOpenKey={searchDept}
        cols={[
        { key: "dept",  label: "Department",          width: "1.4fr" },
        { key: "alloc", label: "Allocated overhead",  width: "160px", align: "right", mono: true },
        { key: "perHr", label: "$/hr",                width: "100px", align: "right", mono: true },
        { key: "pools", label: "Pools",               width: "70px",  align: "right", mono: true },
        { key: "top",   label: "Largest contributor", width: "1.4fr" },
      ]}
      rows={rows}
      footer={{
        dept: <TotalEyebrow size="l8">Total</TotalEyebrow>,
        alloc: fmt.dollarsK(totalAllocated),
        perHr: "—",
        pools: capPools.length,
        top: (
          <span style={{ color: "var(--ink-3)" }}>
            {fmt.dollarsK(poolTotal)} net allocable across pools
          </span>
        ),
      }}
      />
    </div>
  );
}
