
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  DataTable, Ledger, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  DeptChip, DrilldownShell, DrilldownColumn, SectionLabel,
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

  // ?serviceId=... means we were cross-navigated here from another tab.
  // Drop any dept filter that would hide the row, open its drilldown,
  // scroll into view, and flash briefly so the user sees where they
  // landed. Same pattern as BenchmarkTable.
  const { serviceId } = useSearch({ from: "/build/costs" });
  useEffect(() => {
    if (!serviceId) return;
    if (!all.some((r) => r.id === serviceId)) return;
    setDept("ALL");
    setOpenId(serviceId);
    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(serviceId)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("row-flash");
      window.setTimeout(() => el.classList.remove("row-flash"), 1700);
    }, 30);
    return () => window.clearTimeout(handle);
  }, [serviceId, all]);

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
          <div style={{ fontSize: "var(--t-l7)" }}>{r.name}</div>
          <div className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)", marginTop: 2 }}>{r.id}</div>
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
        const total = Math.round(r.unitCost);
        const annual = Math.round(r.annual);

        return (
          <DrilldownShell>
            <DrilldownColumn marker="①" title="Service · Hours · Rate">
              <Link
                to="/build/services"
                search={{ serviceId: r.id }}
                style={{
                  display: "inline-block", fontSize: "var(--t-l8)",
                  color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                View service →
              </Link>
              <div style={{
                marginTop: 12, padding: "10px 14px",
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.65,
              }}>
                <div>hours per unit: <b>{r.hours}</b></div>
                <div>fully burdened rate: <b style={{ color: "var(--accent)" }}>${Math.round(r.rate)}/hr</b></div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 5, marginTop: 5 }}>
                  unit cost = <b>{fmt.dollars(total)}</b>
                </div>
                <div>× volume <b>{r.volume}</b>/yr</div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 5, marginTop: 5 }}>
                  annual = <b>{fmt.dollars(annual)}</b>
                </div>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Rate construction">
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

            <DrilldownColumn marker="③" title="Overhead allocation drivers">
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
                  <span>Total overhead → {dept}</span>
                  <span>{fmt.dollarsK(totalCAPForDept)}</span>
                </div>
              </div>
              <Link
                to="/build/feestudy"
                search={{ serviceId: r.id }}
                style={{
                  display: "inline-block", marginTop: 12, fontSize: "var(--t-l8)",
                  color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                View fee schedule →
              </Link>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      />
    </div>
  );
}
