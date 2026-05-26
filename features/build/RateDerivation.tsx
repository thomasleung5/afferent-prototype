
import { useMemo, useState } from "react";
import {
  DataTable, Ledger, type Column,
} from "@/components/table";
import {
  DeptChip, DrilldownShell, DrilldownColumn, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import { poolToFeeDept } from "@/lib/data/capStepDownGl";
import type { FBHR } from "@/lib/calc";
import { useBuildState } from "@/lib/store";
import {
  deptCapacityWarnings, type DeptCapacityWarning,
} from "@/lib/capacity";

const ORDER: DeptCode[] = FEE_DEPTS;
const labelOf = deptName;

interface Row {
  id: DeptCode;
  dept: DeptCode;
  deptName: string;
  fbhr: FBHR;
  directRate: number;
  operatingRate: number;
  capRate: number;
  fbhrTotal: number;
  productiveHours: number;
  allocatedHours: number;
  utilizationPct: number;
}

export function RateDerivation() {
  const { derived, capPools } = useBuildState();
  const stepModel = derived.capStepDown;
  const [openId, setOpenId] = useState<string | undefined>();

  // Capacity warnings grouped by dept so the Department cell can render
  // an inline ⚠ glyph with a hover-readable tooltip. Same severity
  // language as the spec — "intervention" at >125%, "missing supply"
  // when productive=0 with real demand.
  const warningsByDept = useMemo(() => {
    const m = new Map<DeptCode, DeptCapacityWarning[]>();
    for (const w of deptCapacityWarnings(derived.utilization)) {
      const list = m.get(w.dept) ?? [];
      list.push(w);
      m.set(w.dept, list);
    }
    return m;
  }, [derived.utilization]);

  // Skip depts that aren't actually modeled in the active jurisdiction
  // (no positions / no productive hours → no derivable rate).
  const activeDepts = ORDER.filter((d) => derived.fbhr[d].productiveHours > 0);
  const rows: Row[] = activeDepts.map((d) => {
    const f = derived.fbhr[d];
    const u = derived.utilization[d];
    return {
      id: d,
      dept: d,
      deptName: labelOf(d),
      fbhr: f,
      directRate: f.directRate,
      operatingRate: f.operatingRate,
      capRate: f.capRate,
      fbhrTotal: f.fbhr,
      productiveHours: f.productiveHours,
      allocatedHours: u.allocated,
      utilizationPct: u.pct,
    };
  });

  const cols: Column<Row>[] = [
    {
      key: "deptName",
      label: "Department",
      width: "minmax(220px, 2fr)",
      render: (r) => {
        const warns = warningsByDept.get(r.dept);
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <DeptChip code={r.dept}/>
            <span style={{ fontSize: "var(--fs-ui)", fontWeight: 500 }}>{r.deptName}</span>
            {warns && warns.length > 0 && (
              <span
                title={warns.map(formatDeptWarning).join(" · ")}
                style={{ color: "var(--warn)", fontSize: 13, lineHeight: 1 }}
              >⚠</span>
            )}
          </div>
        );
      },
    },
    {
      key: "directRate",
      label: "Direct labor $/hr",
      width: "150px",
      align: "right",
      render: (r) => <span className="num">${Math.round(r.directRate)}</span>,
    },
    {
      key: "operatingRate",
      label: "Operating $/hr",
      width: "130px",
      align: "right",
      render: (r) => <span className="num">${Math.round(r.operatingRate)}</span>,
    },
    {
      key: "capRate",
      label: "Overhead $/hr",
      width: "130px",
      align: "right",
      render: (r) => <span className="num">${Math.round(r.capRate)}</span>,
    },
    {
      key: "fbhrTotal",
      label: "FBHR",
      width: "110px",
      align: "right",
      render: (r) => (
        <span className="num" style={{ color: "var(--accent)" }}>
          ${Math.round(r.fbhrTotal)}<span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>/hr</span>
        </span>
      ),
    },
    {
      key: "productiveHours",
      label: "Prod hrs/yr",
      width: "110px",
      align: "right",
      render: (r) => <span className="num">{fmt.int(r.productiveHours)}</span>,
    },
    {
      key: "allocatedHours",
      label: "Allocated hours",
      width: "130px",
      align: "right",
      render: (r) => (
        <span className="num" style={{ color: "var(--ink-2)" }}>
          {fmt.int(r.allocatedHours)}
        </span>
      ),
    },
    {
      key: "utilizationPct",
      label: "Utilization",
      width: "110px",
      align: "right",
      render: (r) => {
        // Subtle semantic styling per spec:
        //   <85%   → underutilized, muted ink-3
        //   85–100 → healthy, neutral ink
        //   >100%  → over capacity, subtle warn (not bright red)
        // Productive hrs == 0 falls into the <85% bucket and shows
        // muted; that case is also the "missing productive hours"
        // warning surface PR-K4 will flag explicitly.
        const pct = r.utilizationPct;
        const color = pct > 100 ? "var(--warn)"
          : pct >= 85 ? "var(--ink)"
          : "var(--ink-3)";
        return (
          <span className="num" style={{ color }}>
            {Math.round(pct)}%
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <SectionLabel right={`${rows.length} departments`}>
        Fully burdened hourly rate by department
      </SectionLabel>
      <DataTable
      cols={cols}
      rows={rows}
      openId={openId}
      onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
      drilldownIndicator
      renderDrilldown={(r) => {
        const f = r.fbhr;
        const allocRows = capPools
          .map((p) => ({ poolId: p.id, allocated: poolToFeeDept(stepModel, p.id, r.dept) }))
          .filter((p) => p.allocated > 0.5)
          .sort((a, b) => b.allocated - a.allocated);
        const totalCAP = allocRows.reduce((a, x) => a + x.allocated, 0);
        return (
          <DrilldownShell>
            <DrilldownColumn marker="①" title="Rate construction">
              <Ledger
                cols={[
                  { key: "category", label: "Category", width: "1fr" },
                  { key: "amount",   label: "Amount",   width: "90px",  align: "right" },
                  { key: "rate",     label: "Rate",     width: "90px",  align: "right" },
                ]}
                rows={[
                  {
                    key: "labor",
                    cells: {
                      category: <span style={{ color: "var(--ink)" }}>Direct Labor</span>,
                      amount: <span className="num">{fmt.dollarsK(f.directDollars)}</span>,
                      rate:   <span className="num">${Math.round(f.directRate)}/hr</span>,
                    },
                  },
                  {
                    key: "operating",
                    cells: {
                      category: <span style={{ color: "var(--ink)" }}>Operating</span>,
                      amount: <span className="num">{fmt.dollarsK(f.operatingDollars)}</span>,
                      rate:   <span className="num">${Math.round(f.operatingRate)}/hr</span>,
                    },
                  },
                  {
                    key: "overhead",
                    cells: {
                      category: <span style={{ color: "var(--ink)" }}>Overhead Cost Allocation</span>,
                      amount: <span className="num">{fmt.dollarsK(f.capDollars)}</span>,
                      rate:   <span className="num">${Math.round(f.capRate)}/hr</span>,
                    },
                  },
                ]}
                total={{
                  category: <span>FBHR</span>,
                  amount: "",
                  rate: (
                    <span className="num" style={{ color: "var(--accent)" }}>
                      ${Math.round(f.fbhr)}/hr
                    </span>
                  ),
                }}
              />
              <div style={{
                marginTop: 8, fontSize: "var(--t-l8)", color: "var(--ink-3)", lineHeight: 1.5,
              }}>
                All rates based on {fmt.int(f.productiveHours)} productive hours.
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Overhead allocation drivers">
              <div style={{
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.4,
              }}>
                {allocRows.slice(0, 6).map((ar, i) => {
                  const pool = capPools.find((p) => p.id === ar.poolId);
                  return (
                    <div key={ar.poolId} style={{
                      display: "flex", justifyContent: "space-between", gap: 12,
                      padding: "7px 12px",
                      borderBottom: i < Math.min(allocRows.length, 6) - 1 ? "1px solid var(--rule)" : "none",
                      alignItems: "baseline",
                    }}>
                      <span
                        title={pool?.basis ?? undefined}
                        style={{ color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}
                      >
                        {pool?.pool ?? ar.poolId}
                      </span>
                      <span style={{ fontWeight: 700, whiteSpace: "nowrap", color: "var(--ink)" }}>
                        {fmt.dollarsK(ar.allocated)}
                      </span>
                    </div>
                  );
                })}
                {allocRows.length > 6 && (
                  <div style={{ padding: "7px 12px", color: "var(--ink-4)", fontSize: "var(--t-l4)" }}>
                    + {allocRows.length - 6} smaller pools
                  </div>
                )}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "10px 12px", borderTop: "2px solid var(--ink)",
                  fontWeight: 700,
                }}>
                  <span>Total overhead → {r.deptName}</span>
                  <span>{fmt.dollarsK(totalCAP)}</span>
                </div>
              </div>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      />
    </div>
  );
}

/** Tooltip text for the ⚠ glyph next to a dept name on the FBHR table.
 *  Phrasing is intentionally diagnostic, not alarming — the inline
 *  utilization cell already carries the severity color; this just
 *  explains the why on hover. */
function formatDeptWarning(w: DeptCapacityWarning): string {
  if (w.kind === "utilization-critical") {
    return `Utilization ${Math.round(w.pct)}% — over capacity (>125%)`;
  }
  return `${fmt.int(w.allocated)} demand hrs against 0 productive hours`;
}
