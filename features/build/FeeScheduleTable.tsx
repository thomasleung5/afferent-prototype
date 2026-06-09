
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  DataTable, applyFilter, deriveDeptFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, DeptChip, DrilldownShell, DrilldownColumn, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type {
  DeptCode, Service,
} from "@/lib/types";
import { feeRowKind, type FeeComparison } from "@/lib/calc";
import { useBuildState } from "@/lib/store";
import {
  displayCostOfService, displayCurrentFee, displayRecommendedFee,
} from "@/lib/feeDisplay";
import { FormulaEditor } from "./FormulaEditor";

type Row = FeeComparison;

export function FeeScheduleTable() {
  const { services, derived, updateService } = useBuildState();
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  // ?serviceId=... means we were cross-navigated here from Cost of
  // Service or Fee Benchmarks. Clear filters that would hide the row,
  // open its drilldown, scroll, and flash so the user sees where they
  // landed. Same pattern used by BenchmarksTable / CostOfServiceTable.
  const { serviceId, dept: searchDept } = useSearch({ from: "/build/fee-schedule" });
  useEffect(() => {
    if (!serviceId) return;
    if (!derived.comparisons.some((c) => c.id === serviceId)) return;
    setDeptFilter("ALL");
    setOpenId(serviceId);
    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(serviceId)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("row-flash");
      window.setTimeout(() => el.classList.remove("row-flash"), 1700);
    }, 30);
    return () => window.clearTimeout(handle);
  }, [serviceId, derived.comparisons]);

  // ?dept=... cross-nav from Functional Allocation. Pre-filters to
  // that dept. serviceId-targeted navs win over dept filters.
  useEffect(() => {
    if (serviceId || !searchDept) return;
    setDeptFilter(searchDept);
  }, [searchDept, serviceId]);

  // Full Service lookup for the display helpers (route non-flat rows
  // through `summarizeFee` using the structured `formula`) plus the
  // fee identity columns (feeNo, unit). The FeeComparison rows don't
  // carry these fields, so each cell looks the Service up by id at
  // render time. Math (annualUplift, recoveryPct, etc.) still uses the
  // numeric fields off FeeComparison — display routing only.
  const svcById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );

  // Filter by dept; user-controlled sort lives on DataTable (default
  // Fee # ascending, matching the rest of the fee tables).
  const sorted = useMemo(
    () => applyFilter(derived.comparisons, "dept", deptFilter),
    [derived.comparisons, deptFilter],
  );

  const filters: FilterGroup[] = [
    {
      id: "dept", label: "Dept",
      options: deriveDeptFilter(derived.comparisons),
      value: deptFilter,
      onChange: setDeptFilter,
    },
  ];

  const cols: Column<Row>[] = useMemo(() => [
    {
      key: "feeNo",
      label: "Fee #",
      width: "90px",
      sortable: true,
      sortKey: (r) => svcById.get(r.id)?.feeNo ?? "",
      render: (r) => {
        const feeNo = svcById.get(r.id)?.feeNo;
        return (
          <span className="num" style={{
            color: feeNo ? "var(--ink-2)" : "var(--ink-4)",
          }}>{feeNo ?? "—"}</span>
        );
      },
    },
    {
      key: "name",
      label: "Fee item",
      width: "minmax(200px, 1.6fr)",
      sortable: true,
      render: (r) => {
        const svc = svcById.get(r.id);
        const chip = svc ? nonCountableChipLabel(svc) : null;
        return (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--fs-ui)" }}>{r.name}</span>
              {chip && (
                <span
                  className="mono"
                  title="Excluded from recovery aggregates"
                  style={{
                    fontSize: "var(--t-l9)", letterSpacing: "0.08em",
                    color: "var(--ink-3)", textTransform: "uppercase",
                    padding: "1px 5px", border: "1px solid var(--rule)",
                    background: "var(--paper-2)",
                  }}
                >{chip}</span>
              )}
            </div>
            <div className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)", marginTop: 2 }}>
              {r.id}
            </div>
          </div>
        );
      },
    },
    {
      key: "dept",
      label: "Dept",
      width: "70px",
      sortable: true,
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "unit",
      label: "Unit",
      width: "100px",
      sortable: true,
      sortKey: (r) => svcById.get(r.id)?.unitLabel ?? "",
      render: (r) => {
        const unit = svcById.get(r.id)?.unitLabel;
        return (
          <span className="num" style={{
            color: unit ? "var(--ink-2)" : "var(--ink-4)",
          }}>{unit ?? "—"}</span>
        );
      },
    },
    {
      key: "fee",
      label: "Current",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => {
        const svc = svcById.get(r.id);
        return (
          <span className="num">
            {svc ? displayCurrentFee(svc) : fmt.dollars(r.fee)}
          </span>
        );
      },
    },
    {
      key: "unitCost",
      label: "Cost",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => {
        const svc = svcById.get(r.id);
        return (
          <span className="num">
            {svc ? displayCostOfService(svc, r) : fmt.dollars(r.unitCost)}
          </span>
        );
      },
    },
    {
      key: "recommended",
      label: "Recommended",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => {
        const svc = svcById.get(r.id);
        // Dim non-recoverable rows — they don't roll into recovery
        // aggregates and the display helper already returns "—" when
        // the row is non-recoverable and has no text override.
        const color = r.recoverable ? "var(--accent)" : "var(--ink-4)";
        return (
          <span className="num" style={{ color }}>
            {svc ? displayRecommendedFee(svc, r) : fmt.dollars(r.recommended)}
          </span>
        );
      },
    },
    {
      key: "target",
      label: "Recovery",
      width: "80px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{r.target}%</span>,
    },
    {
      key: "annualUplift",
      label: "Impact",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => {
        // Non-recoverable rows: the uplift number is computed for
        // display but doesn't roll into the recovery aggregate, so
        // render an em-dash to keep the column quiet.
        if (!r.recoverable) {
          return <span className="num" style={{ color: "var(--ink-4)" }}>—</span>;
        }
        const color = r.annualUplift > 0 ? "var(--pos)" : r.annualUplift < 0 ? "var(--neg)" : "var(--ink-3)";
        return (
          <span className="num" style={{ color }}>
            {r.annualUplift > 0 ? "+" : ""}{fmt.dollarsK(r.annualUplift)}
          </span>
        );
      },
    },
  ], [svcById]);

  return (
    <div>
      <SectionLabel right={`${derived.comparisons.length} fees`}>
        Fee decision queue
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={sorted}
        filters={filters}
        defaultSort={{ key: "feeNo", dir: "asc" }}
        openId={openId}
        onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
        drilldownIndicator
        renderDrilldown={(r) => {
          const svc = services.find((s) => s.id === r.id);
          if (!svc) return null;
          const fbhr = derived.fbhr[r.dept as DeptCode]?.fbhr ?? 0;
          const peerVariance = svc.peer > 0 ? ((r.fee - svc.peer) / svc.peer) * 100 : 0;
          const peerLabel =
            peerVariance >  5 ? "above median"
          : peerVariance < -5 ? "below median"
          :                     "near median";
          const peerColor =
            peerVariance >  5 ? "var(--neg)"
          : peerVariance < -5 ? "var(--warn)"
          :                     "var(--pos)";

          return (
            <DrilldownShell>
            <DrilldownColumn marker="①" title="Policy">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div className="mono" style={{
                    fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                    color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                  }}>Recovery target</div>
                  <div style={{ width: 150 }}>
                    <CellInput
                      type="number"
                      value={r.target}
                      onChange={(v) => updateService(r.id, { target: Number(v) || 0 })}
                      suffix="%"
                      min={0}
                      max={100}
                      align="right"
                    />
                  </div>
                </div>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Calculation">
              <div style={{
                padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div>{svc.hours} hrs × {fmt.dollars(fbhr)}/hr</div>
                <div style={{ color: "var(--ink-3)" }}>= {displayCostOfService(svc, r)} unit cost</div>
                <div style={{ color: "var(--ink-3)" }}>× {r.target}% recovery target</div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
                  recommended: <b>{displayRecommendedFee(svc, r)}</b>
                </div>
              </div>
              <Link
                to="/build/costs"
                search={{ serviceId: r.id }}
                style={{
                  display: "inline-block", marginTop: 12, fontSize: "var(--t-l8)",
                  color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                View cost of service →
              </Link>
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Comparators">
              <div>
                <div className="mono" style={{
                  fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.1em",
                  color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                }}>Peer median</div>
                {svc.peer > 0 ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                      {fmt.dollars(svc.peer)}
                    </span>
                    <span className="num" style={{ fontSize: 12, color: peerColor, fontWeight: 500 }}>
                      {peerVariance > 0 ? "+" : ""}{Math.round(peerVariance)}% {peerLabel}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>
                    No peer data on file for this fee.
                  </div>
                )}
                <Link
                  to="/build/benchmarks"
                  search={{ serviceId: r.id }}
                  style={{
                    display: "inline-block", marginTop: 8, fontSize: "var(--t-l8)",
                    color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3,
                  }}
                >
                  View fee benchmarks →
                </Link>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="④" title="Structure & display">
              <div>
                <div className="mono" style={{
                  fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                  color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                }}>Pricing</div>
                <FormulaEditor
                  value={svc.formula}
                  onChange={(f) => updateService(r.id, { formula: f })}
                />
              </div>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      />
    </div>
  );
}

/** Compact chip label for the non-countable badge next to fee item names.
 *  Returns null when the row is countable (flat / formula) — the caller
 *  hides the chip in that case. Non-flat formula kinds (deposit / T&M /
 *  pass-through / statutory) reshape how the fee is billed, so they get
 *  a chip even when an analyst-supplied `fee` value exists. */
function nonCountableChipLabel(service: Service): string | null {
  const kind = feeRowKind(service);
  if (kind === "deposit")            return "deposit";
  if (kind === "time-and-materials") return "T&M";
  if (kind === "pass-through")       return "pass-through";
  if (kind === "statutory")          return "statutory";
  return null;
}

