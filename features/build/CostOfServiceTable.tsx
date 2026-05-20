
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  DeptChip, DrilldownShell, DrilldownColumn, SectionLabel, TraceBlock, SourcePill,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { poolToFeeDept } from "@/lib/data/capStepDownGl";
import type { ServiceCost } from "@/lib/calc";
import { useBuildState } from "@/lib/store";

interface Row extends ServiceCost {
  rate: number;
  annual: number;
}

export function CostOfServiceTable() {
  const { derived, capPools } = useBuildState();
  const stepModel = derived.capStepDown;
  const [dept, setDept] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  const all: Row[] = useMemo(() => derived.costs.map((c) => ({
    ...c,
    rate: derived.fbhr[c.dept]?.fbhr ?? 0,
    annual: c.annualCost,
  })), [derived]);
  const rows = useMemo(() => applyFilter(all, "dept", dept), [all, dept]);

  const filters: FilterGroup[] = [{
    id: "dept", label: "Dept",
    options: deriveDeptFilter(all),
    value: dept, onChange: setDept,
  }];

  const cols: Column<Row>[] = [
    {
      key: "name",
      label: "Service",
      width: "minmax(260px, 2fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontSize: 12.5 }}>{r.name}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>{r.id}</div>
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "80px",
      sortable: true,
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "hours",
      label: "Hours",
      width: "70px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.hours}</span>,
    },
    {
      key: "rate",
      label: "FBHR",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">${Math.round(r.rate)}</span>,
    },
    {
      key: "unitCost",
      label: "Total cost",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollars(r.unitCost)}</span>,
    },
    {
      key: "volume",
      label: "Vol/yr",
      width: "80px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.volume}</span>,
    },
    {
      key: "annual",
      label: "Annual",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num">{fmt.dollarsK(r.annual)}</span>
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${all.length} services`}>
        Cost of service
      </SectionLabel>
      <DataTable
      cols={cols}
      rows={rows}
      filters={filters}
      defaultSort={{ key: "annual", dir: "desc" }}
      openId={openId}
      onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
      drilldownIndicator
      renderDrilldown={(r) => {
        const dept = r.dept as DeptCode;
        const f = derived.fbhr[dept];
        const allocRows = capPools
          .map((p) => ({ poolId: p.id, allocated: poolToFeeDept(stepModel, p.id, dept) }))
          .filter((p) => p.allocated > 0.5)
          .sort((a, b) => b.allocated - a.allocated);
        const totalCAPForDept = allocRows.reduce((a, x) => a + x.allocated, 0);
        const totalDirect = Math.round(r.hours * f.directRate);
        const totalOp = Math.round(r.hours * f.operatingRate);
        const totalCAP = Math.round(r.hours * f.capRate);
        const total = Math.round(r.unitCost);
        const annual = Math.round(r.annual);

        return (
          <DrilldownShell>
            <DrilldownColumn marker="①" title="Service · Hours · Rate">
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ fontWeight: 500 }}>{r.name}</div>
                <div style={{ color: "var(--ink-3)", fontSize: 11.5, marginTop: 2 }}>
                  {r.id} · {dept}
                </div>
              </div>
              <div style={{
                marginTop: 14, padding: "12px 14px",
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div>hours per unit: <b>{r.hours}</b></div>
                <div>fully burdened rate: <b style={{ color: "var(--accent)" }}>${Math.round(r.rate)}/hr</b></div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
                  unit cost = <b>{fmt.dollars(total)}</b>
                </div>
                <div>× volume <b>{r.volume}</b>/yr</div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
                  annual = <b>{fmt.dollars(annual)}</b>
                </div>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Rate composition">
              <div style={{
                padding: "12px 14px",
                background: "var(--paper)", border: "1px solid var(--rule)",
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
              <div style={{
                marginTop: 14, padding: "12px 14px",
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>direct labor</span>
                  <b>{fmt.dollars(totalDirect)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>+ operating</span>
                  <b>{fmt.dollars(totalOp)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>+ overhead cost allocation</span>
                  <b>{fmt.dollars(totalCAP)}</b>
                </div>
                <div style={{
                  borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>total cost</span>
                  <b>{fmt.dollars(totalDirect + totalOp + totalCAP)}</b>
                </div>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Overhead cost allocation pools feeding this rate">
              <div style={{
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 11.5, lineHeight: 1.5,
              }}>
                {allocRows.slice(0, 6).map((ar, i) => {
                  const pool = capPools.find((p) => p.id === ar.poolId);
                  return (
                    <div key={ar.poolId} style={{
                      display: "flex", justifyContent: "space-between", gap: 10,
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
                  <div style={{ padding: "7px 12px", color: "var(--ink-4)", fontSize: 10.5 }}>
                    + {allocRows.length - 6} smaller pools
                  </div>
                )}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "10px 12px", borderTop: "2px solid var(--ink)",
                  fontWeight: 700,
                }}>
                  <span>Total CAP → {dept}</span>
                  <span>{fmt.dollarsK(totalCAPForDept)}</span>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <SourcePill tone="cap">FROM OVERHEAD COST ALLOCATION</SourcePill>
              </div>
              <TraceBlock label="Carries into">
                Drill further on the Overhead Cost Allocation page to see drivers and pass-2 contributions.
              </TraceBlock>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      />
    </div>
  );
}
