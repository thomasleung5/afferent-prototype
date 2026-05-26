
import { useMemo, useState } from "react";
import {
  DataTable, type Column,
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
          ${Math.round(r.fbhrTotal)}
        </span>
      ),
    },
    {
      key: "productiveHours",
      label: "Prd Hrs",
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
      render: (r) => (
        <span className="num">{Math.round(r.utilizationPct)}%</span>
      ),
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
              <RateConstruction fbhr={f}/>
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

/** Compact three-column rate buildup (Direct Labor + Operating + Overhead
 *  → FBHR). Visual treatment mirrors the sibling drilldown sub-tables
 *  on this page (Overhead Allocation Drivers, Service · Hours · Rate):
 *  mono, fontSize 12, no header row, --paper bg + --rule border, 2px
 *  --ink top border on the total. */
export function RateConstruction({ fbhr }: { fbhr: FBHR }) {
  const GRID = "1fr 90px 90px";
  const ROW_PAD = "7px 12px";
  const rows: Array<{ category: string; amount: number; rate: number }> = [
    { category: "Direct Labor",             amount: fbhr.directDollars,    rate: fbhr.directRate },
    { category: "Operating",                amount: fbhr.operatingDollars, rate: fbhr.operatingRate },
    { category: "Overhead Cost Allocation", amount: fbhr.capDollars,       rate: fbhr.capRate },
  ];
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.4,
    }}>
      {rows.map((r, i) => (
        <div key={r.category} style={{
          display: "grid", gridTemplateColumns: GRID, gap: 12,
          padding: ROW_PAD,
          borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : "none",
          alignItems: "baseline",
        }}>
          <span style={{ color: "var(--ink)" }}>{r.category}</span>
          <span style={{ textAlign: "right" }}>{fmt.dollarsK(r.amount)}</span>
          <span style={{ textAlign: "right" }}>${Math.round(r.rate)}/hr</span>
        </div>
      ))}
      <div style={{
        display: "grid", gridTemplateColumns: GRID, gap: 12,
        padding: "10px 12px", borderTop: "2px solid var(--ink)",
        fontWeight: 700, alignItems: "baseline",
      }}>
        <span>FBHR</span>
        <span/>
        <span style={{ textAlign: "right", color: "var(--accent)" }}>${Math.round(fbhr.fbhr)}/hr</span>
      </div>
    </div>
  );
}
