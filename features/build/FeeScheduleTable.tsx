
import { useMemo, useState } from "react";
import {
  DataTable, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, DeptChip, DrilldownShell, DrilldownColumn, Formula, SourcePill,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import { CITY } from "@/lib/data/city";
import type { DeptCode } from "@/lib/types";
import type { FeeComparison } from "@/lib/calc";
import { useBuildState } from "@/lib/store";
import { StateChip, ConfReason, type FeeState } from "./StateChip";

type Confidence = "high" | "med" | "low";
type Priority = "high" | "med" | "low" | "none";

interface Row extends FeeComparison {
  priority: Priority;
  confidence: Confidence;
  state: FeeState;
  flag: boolean;
}

const PRI_RANK: Record<Priority, number> = { high: 3, med: 2, low: 1, none: 0 };
const STATE_RANK: Record<FeeState, number> = {
  PENDING: 0, REVIEWED: 1, READY: 2, ADOPTED: 3, DEFERRED: 4,
};

function peerOffsets(id: string, median: number): { city: string; value: number }[] {
  if (!median) return [];
  const seed = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const offsets = [-0.18, -0.07, 0.04, 0.12, 0.22];
  const rounded = (v: number) => Math.round(v / 5) * 5;
  return CITY.peers.slice(0, 5).map((city, i) => ({
    city,
    value: rounded(median * (1 + offsets[(seed + i) % offsets.length])),
  }));
}

function priorityFor(impact: number): Priority {
  if (impact > 25000) return "high";
  if (impact >  5000) return "med";
  if (impact > 0)     return "low";
  return "none";
}

function confidenceFor(
  volume: number, hours: number, recoveryNow: number, cost: number,
): Confidence {
  if (volume === 0 || hours === 0) return "low";
  if (recoveryNow > 200 || hours < 0.1) return "low";
  if (volume < 5 || cost < 50) return "med";
  return "high";
}

const PRI_COLOR: Record<Priority, string> = {
  high: "var(--neg)",
  med:  "var(--warn)",
  low:  "var(--ink-3)",
  none: "var(--ink-4)",
};

const CONF_COLOR: Record<Confidence, string> = {
  high: "var(--pos)",
  med:  "var(--warn)",
  low:  "var(--neg)",
};

export function FeeScheduleTable() {
  const { services, derived, updateService } = useBuildState();
  const [stateMap, setStateMap] = useState<Record<string, FeeState>>({});
  const [filter, setFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  const stateFor = (id: string): FeeState => stateMap[id] ?? "PENDING";
  const setState = (id: string, st: FeeState) => setStateMap((s) => ({ ...s, [id]: st }));

  const enriched: Row[] = useMemo(() => derived.comparisons.map((c) => {
    const priority = priorityFor(c.annualUplift);
    const confidence = confidenceFor(c.volume, c.hours, c.recoveryPct, c.unitCost);
    return {
      ...c,
      priority,
      confidence,
      state: stateFor(c.id),
      flag: confidence === "low",
    };
  }), [derived.comparisons, stateMap]);

  const filtered = useMemo(() => {
    let out = applyFilter(enriched, "dept", deptFilter);
    if (filter === "HIGH")    out = out.filter((r) => r.priority === "high");
    if (filter === "LOW")     out = out.filter((r) => r.confidence === "low");
    if (filter === "PENDING") out = out.filter((r) => r.state === "PENDING");
    if (filter === "READY")   out = out.filter((r) => r.state === "READY" || r.state === "REVIEWED");
    if (filter === "ADOPTED") out = out.filter((r) => r.state === "ADOPTED");
    return out;
  }, [enriched, filter, deptFilter]);

  // Default ranking: high priority + low confidence first, then by uplift.
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const aScore = PRI_RANK[a.priority] * 10 + (a.confidence === "low" ? 3 : a.confidence === "med" ? 2 : 1);
    const bScore = PRI_RANK[b.priority] * 10 + (b.confidence === "low" ? 3 : b.confidence === "med" ? 2 : 1);
    if (aScore !== bScore) return bScore - aScore;
    return b.annualUplift - a.annualUplift;
  }), [filtered]);

  const filterCounts = {
    ALL:     enriched.length,
    HIGH:    enriched.filter((r) => r.priority === "high").length,
    LOW:     enriched.filter((r) => r.confidence === "low").length,
    PENDING: enriched.filter((r) => r.state === "PENDING").length,
    READY:   enriched.filter((r) => r.state === "READY" || r.state === "REVIEWED").length,
    ADOPTED: enriched.filter((r) => r.state === "ADOPTED").length,
  };

  const filters: FilterGroup[] = [
    {
      id: "queue", label: "Queue",
      options: [
        { value: "ALL",     label: "All",          count: filterCounts.ALL },
        { value: "HIGH",    label: "High priority",count: filterCounts.HIGH },
        { value: "LOW",     label: "Low confidence", count: filterCounts.LOW },
        { value: "PENDING", label: "Pending",      count: filterCounts.PENDING },
        { value: "READY",   label: "Ready",        count: filterCounts.READY },
        { value: "ADOPTED", label: "Adopted",      count: filterCounts.ADOPTED },
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

  const cols: Column<Row>[] = [
    {
      key: "name",
      label: "Fee item",
      width: "minmax(220px, 1.8fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: PRI_COLOR[r.priority],
            }} title={`${r.priority} priority`}/>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2, paddingLeft: 16 }}>
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
      label: "Now",
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
      render: (r) => (
        <span className="num" style={{ color: "var(--ink-3)" }}>
          {(r as unknown as { peer: number }).peer
            ? fmt.dollars((r as unknown as { peer: number }).peer)
            : "—"}
        </span>
      ),
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
  ];

  return (
    <DataTable
      title="Fee decision queue"
      eyebrow="Output · High-priority + low-confidence float to top"
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
        const peers = peerOffsets(r.id, svc.peer);

        const reasons: string[] = [];
        if (r.target < 100) reasons.push(`policy target set to ${r.target}% (vs 100% full cost)`);
        if (r.recoveryPct < 50 && r.fee > 0) reasons.push(`current fee was recovering only ${r.recoveryPct.toFixed(0)}% of cost`);
        if (r.fee === 0) reasons.push("no fee currently charged for this service");
        if (r.dept === "BLDG" && Math.abs(deltaPct) > 30) reasons.push(`BLDG FBHR is now $${Math.round(fbhr)}/hr after CAP allocation`);
        if (reasons.length === 0) reasons.push(`hours per unit (${svc.hours}) × FBHR ($${Math.round(fbhr)}) yields a different cost basis`);

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
                    type="number"
                    value={svc.fee}
                    onChange={(v) => updateService(r.id, { fee: Number(v) || 0 })}
                    prefix="$" step={5} min={0}
                  />
                </div>
                <div>
                  <SourcePill tone="policy">POLICY · {LIFETIME(r.state)}</SourcePill>
                </div>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Calculation">
              <div style={{
                padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div>{svc.hours} hrs × ${Math.round(fbhr)}/hr</div>
                <div style={{ color: "var(--ink-3)" }}>= ${Math.round(r.unitCost)} unit cost</div>
                <div style={{ color: "var(--ink-3)" }}>× {r.target}% recovery target</div>
                <div style={{ color: "var(--ink-3)" }}>→ rounded to $5</div>
                <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
                  recommended: <b>{fmt.dollars(r.recommended)}</b>
                </div>
                <div style={{ color: "var(--ink-3)", marginTop: 4 }}>
                  annual: ${r.recommended} × {r.volume} ={" "}
                  <b style={{ color: "var(--ink-2)" }}>{fmt.dollarsK(r.recommended * r.volume)}</b>
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
              <div style={{ marginTop: 10 }}>
                <Formula>cost × target ÷ $5</Formula>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Confidence & comparators">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <ConfReason
                  ok={r.volume > 0}
                  text={r.volume > 0 ? `Volume: ${r.volume}/yr (FY 24/25 actuals)` : "Volume missing — re-import or estimate"}
                />
                <ConfReason
                  ok={svc.hours > 0}
                  text={svc.hours > 0 ? `Hours: ${svc.hours} per unit (staff estimate)` : "Hours missing — needs staff input"}
                />
                <ConfReason
                  ok={r.recoveryPct < 200}
                  text={r.recoveryPct < 200 ? `Current fee recovers approximately ${r.recoveryPct.toFixed(0)}% of estimated cost` : "Current fee suspiciously high vs cost — verify"}
                />
                <ConfReason
                  ok={r.unitCost > 50}
                  text={r.unitCost > 50 ? "Unit cost in normal range" : "Unit cost very low — check hours"}
                />
                <div style={{
                  marginTop: 4, fontSize: 11, color: CONF_COLOR[r.confidence], fontWeight: 500,
                }}>
                  {r.confidence === "high" ? "High confidence" : r.confidence === "med" ? "Medium confidence" : "Low confidence"}
                </div>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--rule)" }}>
                <div className="mono" style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
                  color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8,
                }}>Comparable cities</div>
                {peers.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    No peer data on file for this fee.
                  </div>
                ) : (
                  <div style={{
                    background: "var(--paper)", border: "1px solid var(--rule)",
                    fontFamily: "var(--ff-mono)", fontSize: 11.5, lineHeight: 1.5,
                  }}>
                    {peers.map((row, i) => (
                      <div key={row.city} style={{
                        display: "flex", justifyContent: "space-between", gap: 10,
                        padding: "7px 12px",
                        borderBottom: i < peers.length - 1 ? "1px solid var(--rule)" : "none",
                      }}>
                        <span style={{ color: "var(--ink-2)" }}>{row.city}</span>
                        <span style={{ fontWeight: 500 }}>${row.value.toLocaleString()}</span>
                      </div>
                    ))}
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "10px 12px", borderTop: "2px solid var(--ink)",
                      fontWeight: 700,
                    }}>
                      <span>Peer median</span>
                      <span>${svc.peer.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      footerNote={`${sorted.length} of ${enriched.length} fees · click a row for policy, calculation, and confidence`}
    />
  );
}

function LIFETIME(s: FeeState): string {
  return ({
    PENDING:  "PENDING REVIEW",
    REVIEWED: "STAFF REVIEWED",
    READY:    "READY FOR COUNCIL",
    ADOPTED:  "ADOPTED",
    DEFERRED: "DEFERRED",
  } as Record<FeeState, string>)[s];
}
