
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  DataTable, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, DeptChip, DrilldownShell, DrilldownColumn, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import type { FeeComparison } from "@/lib/calc";
import { useBuildState } from "@/lib/store";
import { StateChip, type FeeState } from "@/components/ui";

type Confidence = "high" | "med" | "low";

interface Row extends FeeComparison {
  confidence: Confidence;
  state: FeeState;
  flag: boolean;
}

const STATE_RANK: Record<FeeState, number> = {
  PENDING: 0, REVIEWED: 1, READY: 2, ADOPTED: 3, DEFERRED: 4,
};

function confidenceFor(
  volume: number, hours: number, recoveryNow: number, cost: number,
): Confidence {
  if (volume === 0 || hours === 0) return "low";
  if (recoveryNow > 200 || hours < 0.1) return "low";
  if (volume < 5 || cost < 50) return "med";
  return "high";
}

export function FeeScheduleTable() {
  const { services, derived, updateService } = useBuildState();
  const [stateMap, setStateMap] = useState<Record<string, FeeState>>({});
  const [filter, setFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  const stateFor = (id: string): FeeState => stateMap[id] ?? "PENDING";
  const setState = (id: string, st: FeeState) => setStateMap((s) => ({ ...s, [id]: st }));

  // FeeComparison doesn't carry `peer`, so look it up from services — same
  // source the Fee Benchmark tab reads from. Keeps the column aligned with
  // the drilldown's `svc.peer`.
  const peerById = useMemo(
    () => new Map(services.map((s) => [s.id, s.peer])),
    [services],
  );

  const enriched: Row[] = useMemo(() => derived.comparisons.map((c) => {
    const confidence = confidenceFor(c.volume, c.hours, c.recoveryPct, c.unitCost);
    return {
      ...c,
      confidence,
      state: stateFor(c.id),
      flag: confidence === "low",
    };
  }), [derived.comparisons, stateMap]);

  const filtered = useMemo(() => {
    let out = applyFilter(enriched, "dept", deptFilter);
    if (filter === "LOW")     out = out.filter((r) => r.confidence === "low");
    if (filter === "PENDING") out = out.filter((r) => r.state === "PENDING");
    if (filter === "READY")   out = out.filter((r) => r.state === "READY" || r.state === "REVIEWED");
    if (filter === "ADOPTED") out = out.filter((r) => r.state === "ADOPTED");
    return out;
  }, [enriched, filter, deptFilter]);

  // Default ranking: low confidence first, then by annual uplift.
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const aScore = a.confidence === "low" ? 3 : a.confidence === "med" ? 2 : 1;
    const bScore = b.confidence === "low" ? 3 : b.confidence === "med" ? 2 : 1;
    if (aScore !== bScore) return bScore - aScore;
    return b.annualUplift - a.annualUplift;
  }), [filtered]);

  const filterCounts = useMemo(() => ({
    ALL:     enriched.length,
    LOW:     enriched.filter((r) => r.confidence === "low").length,
    PENDING: enriched.filter((r) => r.state === "PENDING").length,
    READY:   enriched.filter((r) => r.state === "READY" || r.state === "REVIEWED").length,
    ADOPTED: enriched.filter((r) => r.state === "ADOPTED").length,
  }), [enriched]);

  const filters: FilterGroup[] = [
    {
      id: "queue",
      options: [
        { value: "ALL",     label: "All",            count: filterCounts.ALL },
        { value: "LOW",     label: "Low confidence", count: filterCounts.LOW },
        { value: "PENDING", label: "Pending",        count: filterCounts.PENDING },
        { value: "READY",   label: "Ready",          count: filterCounts.READY },
        { value: "ADOPTED", label: "Adopted",        count: filterCounts.ADOPTED },
      ],
      value: filter,
      onChange: setFilter,
    },
    {
      id: "dept", label: "Dept",
      options: [
        { value: "ALL",  label: "All" },
        { value: "PLAN", label: "Planning" },
        { value: "BLDG", label: "Building" },
        { value: "ENG",  label: "Engineering" },
      ],
      value: deptFilter,
      onChange: setDeptFilter,
    },
  ];

  const cols: Column<Row>[] = useMemo(() => [
    {
      key: "name",
      label: "Fee item",
      width: "minmax(220px, 1.8fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>
            {r.id}
          </div>
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "70px",
      sortable: true,
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "fee",
      label: "Current",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollars(r.fee)}</span>,
    },
    {
      key: "unitCost",
      label: "Cost",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollars(r.unitCost)}</span>,
    },
    {
      key: "recommended",
      label: "Recommended",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{ color: "var(--accent)" }}>
          {fmt.dollars(r.recommended)}
        </span>
      ),
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
        const color = r.annualUplift > 0 ? "var(--pos)" : r.annualUplift < 0 ? "var(--neg)" : "var(--ink-3)";
        return (
          <span className="num" style={{ color, fontWeight: 600 }}>
            {r.annualUplift > 0 ? "+" : ""}{fmt.dollarsK(r.annualUplift)}
          </span>
        );
      },
    },
    {
      key: "state",
      label: "Status",
      width: "150px",
      align: "right",
      sortable: true,
      sortKey: (r) => STATE_RANK[r.state],
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", justifyContent: "flex-end" }}>
          <StateChip state={r.state} onChange={(next) => setState(r.id, next)}/>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [derived.fbhr, updateService, stateMap, peerById]);

  return (
    <div>
      <SectionLabel right={`${enriched.length} fees`}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div className="mono" style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                    color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                  }}>Recovery target</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="range"
                      min={0} max={100} step={5}
                      value={r.target}
                      onChange={(e) => updateService(r.id, { target: Number(e.target.value) })}
                      style={{ flex: 1, accentColor: "var(--accent)" }}
                    />
                    <span className="num" style={{
                      fontSize: 13, fontWeight: 600, minWidth: 42, textAlign: "right",
                    }}>{r.target}%</span>
                  </div>
                </div>
                <div>
                  <div className="mono" style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                    color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                  }}>Current fee</div>
                  <CellInput
                    type="currency"
                    value={svc.fee}
                    onChange={(v) => updateService(r.id, { fee: Number(v) || 0 })}
                    prefix="$" min={0}
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
                <div style={{ color: "var(--ink-3)" }}>= {fmt.dollars(r.unitCost)} unit cost</div>
                <div style={{ color: "var(--ink-3)" }}>× {r.target}% recovery target</div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
                  recommended: <b>{fmt.dollars(r.recommended)}</b>
                </div>
              </div>
              {Math.abs(delta) >= 1 && (
                <div style={{
                  marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--rule)",
                  fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.55,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <span className="mono" style={{
                      fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
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
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Comparators">
              <div>
                <div className="mono" style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
                  color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6,
                }}>Peer median</div>
                {svc.peer > 0 ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                      {fmt.dollars(svc.peer)}
                    </span>
                    <span className="num" style={{ fontSize: 11.5, color: peerColor, fontWeight: 500 }}>
                      {peerVariance > 0 ? "+" : ""}{Math.round(peerVariance)}% {peerLabel}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    No peer data on file for this fee.
                  </div>
                )}
                <Link
                  to="/build/benchmark"
                  search={{ feeId: r.id }}
                  style={{
                    display: "inline-block", marginTop: 8, fontSize: 11,
                    color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3,
                  }}
                >
                  View fee benchmark →
                </Link>
              </div>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      />
    </div>
  );
}

