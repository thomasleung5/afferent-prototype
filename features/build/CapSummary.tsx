
import { useMemo } from "react";
import { DeptSummaryTable, Ledger, MetaGrid, type DeptSummaryRow } from "@/components/table";
import { DeptChip, Formula } from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { computeStepDown, type MatrixDeptCode } from "@/lib/data/capStepDown";
import { useBuildState } from "@/lib/store";

const ORDER: DeptCode[] = ["PLAN", "BLDG", "ENG"];
const labelOf = (d: DeptCode) => d === "PLAN" ? "Planning" : d === "BLDG" ? "Building" : "Engineering";

/** Per-dept CAP rollup. Each row expands to a pool ledger + method/formula/source.
 *  Allocated $ is read-only here — it's an output of the step-down engine over
 *  the cost pools, not a manually-entered override. */
export function CapSummary() {
  const { capAllocation, capPools, capCenterOrder, derived } = useBuildState();
  const totalAllocated = ORDER.reduce((a, d) => a + capAllocation[d].allocated, 0);
  const poolTotal = capPools.reduce((a, p) => a + p.amount, 0);

  const model = useMemo(
    () => computeStepDown(capPools, capCenterOrder),
    [capPools, capCenterOrder],
  );

  const rows: DeptSummaryRow[] = ORDER.map((d) => {
    const c = capAllocation[d];
    const rate = derived.fbhr[d].capRate;
    const sorted = capPools
      .map((p) => ({ poolId: p.id, allocated: model.alloc2[p.id]?.[d as MatrixDeptCode] ?? 0 }))
      .filter((p) => p.allocated > 0.5)
      .sort((a, b) => b.allocated - a.allocated);
    const top = sorted[0];
    const topPool = top ? capPools.find((p) => p.id === top.poolId) : null;
    const topPct = top && c.allocated > 0 ? Math.round((top.allocated / c.allocated) * 100) : 0;

    return {
      key: d,
      cells: {
        dept: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <DeptChip code={d}/>
            <span style={{ fontWeight: 500 }}>{labelOf(d)}</span>
          </span>
        ),
        alloc: <span className="num">{fmt.dollars(c.allocated)}</span>,
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
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 14 }}>
          <Ledger
            cols={[
              { key: "pool",  label: "Pool",  width: "1fr" },
              { key: "basis", label: "Basis", width: "160px" },
              { key: "share", label: "Share", width: "80px",  align: "right" },
              { key: "alloc", label: "Allocated", width: "110px", align: "right" },
            ]}
            rows={sorted.filter((p) => p.allocated > 0).slice(0, 8).map((p) => {
              const pool = capPools.find((x) => x.id === p.poolId);
              const pct = c.allocated > 0 ? Math.round((p.allocated / c.allocated) * 100) : 0;
              return {
                key: p.poolId,
                cells: {
                  pool:  <span style={{ color: "var(--ink-2)" }}>{pool?.pool ?? p.poolId}</span>,
                  basis: <span className="mono" style={{ color: "var(--ink-3)", fontSize: 11 }}>{pool?.basis ?? "—"}</span>,
                  share: <span className="num" style={{ color: "var(--ink-3)" }}>{pct}%</span>,
                  alloc: <span className="num" style={{ fontWeight: 600 }}>{fmt.dollars(p.allocated)}</span>,
                },
              };
            })}
            total={{
              pool: (
                <span style={{
                  color: "var(--ink-3)", textTransform: "uppercase",
                  letterSpacing: "0.06em", fontSize: 10,
                }}>Total to {labelOf(d)}</span>
              ),
              basis: "",
              share: <span className="num">100%</span>,
              alloc: <span className="num">{fmt.dollars(c.allocated)}</span>,
            }}
          />
          <MetaGrid
            rows={[
              { label: "Method",         value: `Step-down · ${labelOf(d)} is a receiver-only department` },
              { label: "Allocation basis", value: "Pool-specific drivers — FTE, sq ft, IT seats, payroll $" },
              { label: "Formula", value: (
                <>
                  <Formula>$/hr = allocated $ ÷ productive hrs</Formula>
                  <span style={{ marginLeft: 8, color: "var(--ink-3)" }}>
                    = {fmt.dollarsK(c.allocated)} ÷ {Math.round(derived.fbhr[d].productiveHours).toLocaleString()} hrs
                    {rate > 0 && (
                      <span style={{ marginLeft: 6, color: "var(--ink)", fontWeight: 600 }}>
                        = ${Math.round(rate)}/hr
                      </span>
                    )}
                  </span>
                </>
              )},
              { label: "Pool source",   value: "FY 26-27 Adopted Budget · by cost center" },
              { label: "Driver source", value: "HRIS (FTE) · Facilities (sq ft) · IT (seats) · Payroll (wages)" },
            ]}
          />
        </div>
      ),
    };
  });

  return (
    <DeptSummaryTable
      title="Allocated overhead by department"
      focus={`Step-down · ${fmt.dollarsK(totalAllocated)} of ${fmt.dollarsK(poolTotal)} pool`}
      cols={[
        { key: "dept",  label: "Department",          width: "1.4fr" },
        { key: "alloc", label: "Allocated overhead",  width: "160px", align: "right", mono: true },
        { key: "perHr", label: "$/hr",                width: "100px", align: "right", mono: true },
        { key: "pools", label: "Pools",               width: "70px",  align: "right", mono: true },
        { key: "top",   label: "Largest contributor", width: "1.4fr" },
      ]}
      rows={rows}
      footer={{
        dept: (
          <span style={{
            color: "var(--ink-3)", textTransform: "uppercase",
            letterSpacing: "0.06em", fontSize: 11,
          }}>Allocated to fee depts</span>
        ),
        alloc: fmt.dollarsK(totalAllocated),
        perHr: "—",
        pools: capPools.length,
        top: (
          <span style={{ color: "var(--ink-3)" }}>
            {poolTotal > 0 ? Math.round((totalAllocated / poolTotal) * 100) : 0}% of {fmt.dollarsK(poolTotal)} pool
          </span>
        ),
      }}
    />
  );
}
