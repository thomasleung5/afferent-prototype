
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  DataTable, applyFilter, deriveDeptFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, CellSelect, DeptChip, DrilldownShell, DrilldownColumn, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type {
  DeptCode, FeeRowKind, FeeScheduleStatus, Service,
} from "@/lib/types";
import type { FeeComparison } from "@/lib/calc";
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
  // Service or Fee Benchmark. Clear filters that would hide the row,
  // open its drilldown, scroll, and flash so the user sees where they
  // landed. Same pattern used by BenchmarkTable / CostOfServiceTable.
  const { serviceId } = useSearch({ from: "/build/feestudy" });
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

  // FeeComparison doesn't carry `peer`, so look it up from services — same
  // source the Fee Benchmark tab reads from. Keeps the column aligned with
  // the drilldown's `svc.peer`.
  const peerById = useMemo(
    () => new Map(services.map((s) => [s.id, s.peer])),
    [services],
  );
  // Full Service lookup for the PR-L2 display helpers (currentFeeText,
  // recommendedFeeText, fullCostRecoveryFeeText overrides) plus the
  // PR-L4 fee identity columns (feeNo, unit). The FeeComparison rows
  // don't carry these fields, so each cell looks the Service up by id
  // at render time. Math (annualUplift, recoveryPct, etc.) still uses
  // the numeric fields off FeeComparison — display routing only.
  const svcById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );

  // Sort by annual uplift descending so the rows with the largest
  // adoption impact float to the top. Previous confidence-first ranking
  // depended on the workflow-state UI that's been removed.
  const sorted = useMemo(() => {
    const filtered = applyFilter(derived.comparisons, "dept", deptFilter);
    return [...filtered].sort((a, b) => b.annualUplift - a.annualUplift);
  }, [derived.comparisons, deptFilter]);

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
                  title="Excluded from recovery aggregates (see PR-L3 isCountableFee)"
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
      sortKey: (r) => svcById.get(r.id)?.unit ?? "",
      render: (r) => {
        const unit = svcById.get(r.id)?.unit;
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
      key: "peer",
      label: "Peer median",
      width: "100px",
      align: "right",
      sortable: true,
      sortKey: (r) => peerById.get(r.id) ?? 0,
      render: (r) => {
        const peer = peerById.get(r.id) ?? 0;
        return (
          <span className="num">{peer > 0 ? fmt.dollars(peer) : "—"}</span>
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [derived.fbhr, updateService, peerById, svcById]);

  return (
    <div>
      <SectionLabel right={`${derived.comparisons.length} fees`}>
        Fee decision queue
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={sorted}
        filters={filters}
        openId={openId}
        onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
        drilldownIndicator
        renderDrilldown={(r) => {
          const svc = services.find((s) => s.id === r.id);
          if (!svc) return null;
          const delta = r.recommended - r.fee;
          const deltaPct = r.fee > 0 ? (delta / r.fee) * 100 : 100;
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

          const reasons: string[] = [];
          if (r.target < 100) reasons.push(`policy target set to ${r.target}% (vs 100% full cost)`);
          if (r.recoveryPct < 50 && r.fee > 0) reasons.push(`current fee was recovering only ${r.recoveryPct.toFixed(0)}% of cost`);
          if (r.fee === 0) reasons.push("no fee currently charged for this service");
          if (r.dept === "BLDG" && Math.abs(deltaPct) > 30) reasons.push(`BLDG FBHR is now ${fmt.dollars(fbhr)}/hr after CAP allocation`);
          if (reasons.length === 0) reasons.push(`hours per unit (${svc.hours}) × FBHR (${fmt.dollars(fbhr)}) yields a different cost basis`);

          return (
            <DrilldownShell>
            <DrilldownColumn marker="①" title="Policy">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div className="mono" style={{
                    fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                    color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                  }}>Recovery target</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input
                      type="range"
                      min={0} max={100} step={5}
                      value={r.target}
                      onChange={(e) => updateService(r.id, { target: Number(e.target.value) })}
                      style={{ flex: 1, accentColor: "var(--accent)" }}
                    />
                    <span className="num" style={{
                      fontSize: "var(--fs-ui)", fontWeight: 600, minWidth: 42, textAlign: "right",
                    }}>{r.target}%</span>
                  </div>
                </div>
                <div>
                  <div className="mono" style={{
                    fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                    color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                  }}>Current fee</div>
                  <CellInput
                    type="currency"
                    value={svc.fee}
                    onChange={(v) => updateService(r.id, { fee: Number(v) || 0 })}
                    prefix="$" min={0}
                  />
                </div>
                <div>
                  <div
                    className="mono"
                    title="Cycle lifecycle of this fee row — distinct from the review state above (Pending / Ready / Adopted)."
                    style={{
                      fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                      color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                    }}>Lifecycle</div>
                  <CellSelect
                    value={svc.status ?? "existing"}
                    options={LIFECYCLE_OPTIONS}
                    onChange={(v) => updateService(r.id, { status: v as FeeScheduleStatus })}
                  />
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
              {Math.abs(delta) >= 1 && (
                <div style={{
                  marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--rule)",
                  fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <span className="mono" style={{
                      fontSize: "var(--t-l9)", fontWeight: 700, letterSpacing: "0.1em",
                      color: delta > 0 ? "var(--warn)" : "var(--pos)",
                      textTransform: "uppercase",
                    }}>Why this {delta > 0 ? "increase" : "decrease"}</span>
                    <span className="num" style={{ fontSize: 12, fontWeight: 600 }}>
                      {delta > 0 ? "+" : ""}{fmt.dollars(delta)} {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(0)}%
                    </span>
                  </div>
                  <ul style={{ margin: 0, padding: "0 0 0 16px", listStyle: "disc" }}>
                    {reasons.map((rr, i) => <li key={i} style={{ marginBottom: 2 }}>{rr}</li>)}
                  </ul>
                </div>
              )}
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
                  to="/build/benchmark"
                  search={{ serviceId: r.id }}
                  style={{
                    display: "inline-block", marginTop: 8, fontSize: "var(--t-l8)",
                    color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3,
                  }}
                >
                  View fee benchmark →
                </Link>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="④" title="Structure & display">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div className="mono" style={{
                    fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                    color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                  }}>Row kind</div>
                  <CellSelect
                    value={svc.rowKind ?? "flat"}
                    options={ROW_KIND_OPTIONS}
                    onChange={(v) => updateService(r.id, { rowKind: v as FeeRowKind })}
                  />
                </div>
                <div>
                  <div className="mono" style={{
                    fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
                    color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                  }}>Formula</div>
                  <FormulaEditor
                    value={svc.formula}
                    onChange={(f) => updateService(r.id, { formula: f })}
                  />
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

const ROW_KIND_OPTIONS = [
  { value: "flat",               label: "Flat" },
  { value: "formula",            label: "Formula" },
  { value: "deposit",            label: "Deposit" },
  { value: "time-and-materials", label: "T&M" },
  { value: "pass-through",       label: "Pass-through" },
  { value: "statutory",          label: "Statutory" },
];

const LIFECYCLE_OPTIONS = [
  { value: "existing",      label: "Existing (carried forward)" },
  { value: "new",           label: "New (this cycle)" },
  { value: "renamed",       label: "Renamed" },
  { value: "moved",         label: "Moved to other dept" },
  { value: "deleted",       label: "Deleted (removed this cycle)" },
  { value: "not-evaluated", label: "Not evaluated" },
];

/** Compact chip label for the non-countable badge next to fee item names.
 *  Returns null when the row is countable (flat/formula + existing/new/
 *  renamed/moved) — the caller hides the chip in that case. Lifecycle
 *  status takes precedence over rowKind in the display because deleted
 *  / not-evaluated is more consequential to flag than the pricing model. */
function nonCountableChipLabel(service: Service): string | null {
  const status = service.status;
  if (status === "deleted")       return "deleted";
  if (status === "not-evaluated") return "not evaluated";
  const kind = service.rowKind;
  if (kind === "deposit")            return "deposit";
  if (kind === "time-and-materials") return "T&M";
  if (kind === "pass-through")       return "pass-through";
  if (kind === "statutory")          return "statutory";
  return null;
}

