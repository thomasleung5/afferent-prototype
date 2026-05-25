
import { useState } from "react";
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
}

export function RateDerivation() {
  const { derived, capPools } = useBuildState();
  const stepModel = derived.capStepDown;
  const [openId, setOpenId] = useState<string | undefined>();

  // Skip depts that aren't actually modeled in the active jurisdiction
  // (no positions / no productive hours → no derivable rate).
  const activeDepts = ORDER.filter((d) => derived.fbhr[d].productiveHours > 0);
  const rows: Row[] = activeDepts.map((d) => {
    const f = derived.fbhr[d];
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
    };
  });

  const cols: Column<Row>[] = [
    {
      key: "deptName",
      label: "Department",
      width: "minmax(220px, 2fr)",
      render: (r) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <DeptChip code={r.dept}/>
          <span style={{ fontSize: "var(--fs-ui)", fontWeight: 500 }}>{r.deptName}</span>
        </div>
      ),
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
            <DrilldownColumn marker="①" title="Direct $/hr · from salary">
              <div style={{
                padding: "12px 14px",
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div>salary + benefits: <b>{fmt.dollars(Math.round(f.directDollars))}</b></div>
                <div>÷ productive hrs: <b>{f.productiveHours.toFixed(0)}</b></div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
                  direct $/hr = <b>${Math.round(f.directRate)}</b>
                </div>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Rate composition">
              <div style={{
                padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>direct $/hr</span>
                  <b>${Math.round(f.directRate)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>+ operating $/hr</span>
                  <b>${Math.round(f.operatingRate)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>+ overhead cost allocation $/hr</span>
                  <b>${Math.round(f.capRate)}</b>
                </div>
                <div style={{
                  borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>FBHR</span>
                  <b style={{ color: "var(--accent)" }}>${Math.round(f.fbhr)}</b>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55 }}>
                Operating + overhead cost allocation ={" "}
                {fmt.dollars(Math.round(f.operatingDollars + f.capDollars))} ÷{" "}
                {f.productiveHours.toFixed(0)} hrs.
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Overhead cost allocation pools feeding this rate">
              <div style={{
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.5,
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
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                        {pool?.pool ?? ar.poolId}
                        <span style={{ color: "var(--ink-4)", marginLeft: 5 }}>· {pool?.basis ?? "—"}</span>
                      </span>
                      <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{fmt.dollarsK(ar.allocated)}</span>
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
                  <span>Total CAP → {r.deptName}</span>
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
