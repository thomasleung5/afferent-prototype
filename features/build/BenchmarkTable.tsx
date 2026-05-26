
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  CellInput, DeptChip, DrilldownShell, DrilldownColumn, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode, PeerSurveyValue } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { useActiveJurisdiction } from "@/lib/active";
import { displayCurrentFee, displayFullCostFee } from "@/lib/feeDisplay";

interface Row {
  id: string;
  name: string;
  dept: DeptCode;
  hours: number;
  fee: number;
  cost: number;
  peerMedian: number;
  peerValues: number[];
  peerMin: number;
  peerMax: number;
  peerCount: number;
  varianceVsMedian: number;
  varianceVsCost: number;
  status: "below" | "in-line" | "above" | "no-peer";
}

const OFFSETS = [-0.18, -0.07, 0.04, 0.12, 0.22];

function peerJitter(id: string, median: number, peers: string[]): number[] {
  if (!median) return peers.map(() => 0);
  const seed = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return peers.map((_, i) => {
    const off = OFFSETS[(seed + i) % OFFSETS.length];
    return Math.round((median * (1 + off)) / 5) * 5;
  });
}

function classify(variance: number, hasPeer: boolean): Row["status"] {
  if (!hasPeer) return "no-peer";
  if (variance < -5) return "below";
  if (variance >  5) return "above";
  return "in-line";
}

export function BenchmarkTable() {
  const { services, derived, updateService } = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const peers = jurisdiction.peers;
  const [dept, setDept] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();
  // ?serviceId=... means we were cross-navigated here from another tab.
  // On arrival, drop any dept filter that would hide the row, open the
  // matching drilldown, scroll it into view, and flash it briefly so the
  // user sees where they landed.
  const { serviceId } = useSearch({ from: "/build/benchmark" });
  useEffect(() => {
    if (!serviceId) return;
    const match = services.find((s) => s.id === serviceId);
    if (!match) return;
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
  }, [serviceId, services]);

  const all: Row[] = useMemo(() => services.map((s) => {
    const fbhr = derived.fbhr[s.dept]?.fbhr ?? 0;
    const cost = s.hours * fbhr;
    const peerValues = peerJitter(s.id, s.peer, peers);
    const nonZeroPeers = peerValues.filter((v) => v > 0);
    const peerMin = nonZeroPeers.length > 0 ? Math.min(...nonZeroPeers) : 0;
    const peerMax = nonZeroPeers.length > 0 ? Math.max(...nonZeroPeers) : 0;
    const varianceVsMedian = s.peer > 0 ? ((s.fee - s.peer) / s.peer) * 100 : 0;
    const varianceVsCost = cost > 0 ? ((s.fee - cost) / cost) * 100 : 0;
    return {
      id: s.id,
      name: s.name,
      dept: s.dept,
      hours: s.hours,
      fee: s.fee,
      cost,
      peerMedian: s.peer,
      peerValues,
      peerMin,
      peerMax,
      peerCount: nonZeroPeers.length,
      varianceVsMedian,
      varianceVsCost,
      status: classify(varianceVsMedian, s.peer > 0),
    };
  }), [services, derived.fbhr, peers]);

  const rows = useMemo(() => applyFilter(all, "dept", dept), [all, dept]);

  // Service lookup for the PR-L2 fee-display helpers (currentFeeText /
  // fullCostRecoveryFeeText overrides). The Row precomputes numeric
  // fee/cost for math + sortKey; cell display routes through the
  // helper when the matching Service carries a text override.
  const svcById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );

  const filters: FilterGroup[] = [{
    id: "dept", label: "Dept",
    options: deriveDeptFilter(all),
    value: dept, onChange: setDept,
  }];

  const cols: Column<Row>[] = [
    {
      key: "name",
      label: "Fee item",
      width: "minmax(220px, 1.6fr)",
      sortable: true,
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: "var(--fs-ui)", color: "var(--ink)" }}>{r.name}</span>
          <span className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)" }}>{r.id}</span>
        </div>
      ),
    },
    {
      key: "dept",
      label: "Dept",
      width: "64px",
      sortable: true,
      render: (r) => <DeptChip code={r.dept}/>,
    },
    {
      key: "fee",
      label: "Our fee",
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
      key: "peerMedian",
      label: "Peer median",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num">
          {r.peerMedian > 0 ? fmt.dollars(r.peerMedian) : "—"}
        </span>
      ),
    },
    {
      key: "varianceVsMedian",
      label: "Variance",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => {
        if (r.peerMedian <= 0) return <span style={{ color: "var(--ink-4)" }}>—</span>;
        const v = r.varianceVsMedian;
        // Below median is the underpriced / action-required case; above
        // median reads as informational. In-line stays muted.
        const color = v < -5 ? "var(--warn)"
          : v >  5 ? "var(--ink-3)"
          : "var(--ink-2)";
        return (
          <span className="num" style={{ color, fontWeight: 600 }}>
            {v > 0 ? "+" : ""}{Math.round(v)}%
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      width: "90px",
      sortable: true,
      sortKey: (r) => STATUS_RANK[r.status],
      render: (r) => <StatusChip status={r.status}/>,
    },
    {
      key: "peerRange",
      label: "Peer range",
      width: "minmax(130px, 1fr)",
      align: "right",
      sortable: true,
      sortKey: (r) => r.peerMax - r.peerMin,
      render: (r) => (
        r.peerCount > 0
          ? <span className="num">{fmt.dollars(r.peerMin)} – {fmt.dollars(r.peerMax)}</span>
          : <span style={{ color: "var(--ink-4)" }}>—</span>
      ),
    },
    {
      key: "peerCount",
      label: "Peers",
      width: "80px",
      align: "right",
      sortable: true,
      render: (r) => (
        r.peerCount > 0
          ? <span className="num">{r.peerCount}</span>
          : <span style={{ color: "var(--ink-4)" }}>—</span>
      ),
    },
  ];

  return (
    <div>
      <SectionLabel right={`${rows.length} fee${rows.length === 1 ? "" : "s"} · ${peers.length} peer cities`}>
        Adopted fees vs. peer-city medians
      </SectionLabel>
      <DataTable
        cols={cols}
        rows={rows}
        filters={filters}
        defaultSort={{ key: "varianceVsMedian", dir: "asc" }}
        openId={openId}
        onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
        drilldownIndicator
        renderDrilldown={(r) => {
          const svc = svcById.get(r.id);
          const sorted = peers.slice(0, 5)
            .map((city, i) => ({ city, value: r.peerValues[i] }))
            .sort((a, b) => b.value - a.value);
          return (
            <DrilldownShell>
              <DrilldownColumn marker="①" title="Pricing gap">
                <div style={{
                  padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--rule)",
                  fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
                }}>
                  <Line label="our fee" value={svc ? displayCurrentFee(svc) : fmt.dollars(r.fee)}/>
                  <Line
                    label="peer median"
                    value={r.peerMedian > 0 ? fmt.dollars(r.peerMedian) : "—"}
                  />
                  <Line
                    label="variance"
                    value={r.peerMedian > 0 ? `${r.varianceVsMedian > 0 ? "+" : ""}${Math.round(r.varianceVsMedian)}%` : "—"}
                    color={r.varianceVsMedian < -5 ? "var(--warn)"
                      : r.varianceVsMedian > 5 ? "var(--ink-3)"
                      : "var(--ink)"}
                  />
                  <div style={{
                    borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  }}>
                    <Line label="our unit cost" value={svc ? displayFullCostFee(svc, Math.round(r.cost)) : fmt.dollars(Math.round(r.cost))}/>
                    <Line
                      label="vs cost"
                      value={r.cost > 0 ? `${r.varianceVsCost > 0 ? "+" : ""}${Math.round(r.varianceVsCost)}%` : "—"}
                      color={r.varianceVsCost < -10 ? "var(--warn)" : "var(--ink)"}
                    />
                  </div>
                </div>
              </DrilldownColumn>

              <DrilldownColumn marker="②" title="Peer cities">
                <div style={{
                  background: "var(--paper)", border: "1px solid var(--rule)",
                  fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.5,
                }}>
                  {sorted.map((p, i) => (
                    <div key={p.city} style={{
                      display: "flex", justifyContent: "space-between",
                      gap: 12, padding: "7px 12px",
                      borderBottom: i < sorted.length - 1 ? "1px solid var(--rule)" : "none",
                    }}>
                      <span style={{ color: "var(--ink-2)" }}>{p.city}</span>
                      <span style={{ fontWeight: 500 }}>{p.value > 0 ? `$${p.value.toLocaleString()}` : "—"}</span>
                    </div>
                  ))}
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "10px 12px", borderTop: "2px solid var(--ink)",
                    fontWeight: 700,
                  }}>
                    <span>Peer median</span>
                    <span>{r.peerMedian > 0 ? `$${r.peerMedian.toLocaleString()}` : "—"}</span>
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
                  View fee →
                </Link>
              </DrilldownColumn>

              <DrilldownColumn marker="③" title="Peer survey">
                <PeerSurveyEditor
                  value={svc?.peerSurvey}
                  onChange={(next) => updateService(r.id, { peerSurvey: next })}
                />
              </DrilldownColumn>
            </DrilldownShell>
          );
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status chip & ranking helpers
// ---------------------------------------------------------------------------

const STATUS_RANK: Record<Row["status"], number> = {
  below: 0, "in-line": 1, above: 2, "no-peer": 3,
};

const STATUS_LABEL: Record<Row["status"], string> = {
  below: "Below",
  "in-line": "In line",
  above: "Above",
  "no-peer": "—",
};

const STATUS_COLOR: Record<Row["status"], string> = {
  below: "var(--warn)",
  "in-line": "var(--ink-2)",
  above: "var(--ink-3)",
  "no-peer": "var(--ink-4)",
};

function StatusChip({ status }: { status: Row["status"] }) {
  if (status === "no-peer") {
    return <span style={{ color: "var(--ink-4)" }}>—</span>;
  }
  return (
    <span className="mono" style={{
      display: "inline-block",
      fontSize: "var(--t-l4)", fontWeight: 600, letterSpacing: "0.06em",
      color: STATUS_COLOR[status],
      padding: "2px 6px",
      background: "var(--paper-2)",
      border: "1px solid var(--rule)",
    }}>{STATUS_LABEL[status]}</span>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <b style={{ color: color ?? "var(--ink)" }}>{value}</b>
    </div>
  );
}

/** PR-M1: editor for service.peerSurvey, moved from the Services drilldown
 *  to its rightful home on the Fee Benchmark page. Per-row Agency / value
 *  text / numeric ($) / comparable (checkbox) / × remove. Empty array
 *  clears the field back to undefined so the Service stays clean when
 *  the analyst removes all rows. The `comparable` flag is the gate the
 *  median / range rollups will eventually use (PR-L8 wiring deferred);
 *  non-comparable rows stay in the array for audit but won't pollute
 *  math once the display layer is wired through. */
function PeerSurveyEditor({
  value, onChange,
}: {
  value: PeerSurveyValue[] | undefined;
  onChange: (next: PeerSurveyValue[] | undefined) => void;
}) {
  const rows = value ?? [];
  const patch = (i: number, p: Partial<PeerSurveyValue>) => {
    onChange(rows.map((r, idx) => idx === i ? { ...r, ...p } : r));
  };
  const remove = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : undefined);
  };
  const add = () => {
    onChange([...rows, { agency: "", comparable: true }]);
  };

  const COLS = "minmax(110px, 1.4fr) minmax(90px, 1.1fr) 90px 22px 22px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.length === 0 ? (
        <span style={{ color: "var(--ink-4)", fontSize: 12 }}>(no entries)</span>
      ) : (
        <div style={{ border: "1px solid var(--rule)", background: "var(--paper-2)" }}>
          <div style={{
            display: "grid", gridTemplateColumns: COLS, gap: 8,
            padding: "5px 8px", borderBottom: "1px solid var(--rule)",
            fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            <span>Agency</span>
            <span>Value text</span>
            <span style={{ textAlign: "right" }}>Numeric</span>
            <span title="Comparable — included in median/range rollups">Cmp</span>
            <span/>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: COLS, gap: 8,
              padding: "4px 8px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : "none",
              alignItems: "baseline",
            }}>
              <CellInput
                value={r.agency}
                onChange={(v) => patch(i, { agency: String(v) })}
                placeholder="e.g. Atherton"
                fontSize={12}
              />
              <CellInput
                value={r.valueText ?? ""}
                onChange={(v) => patch(i, { valueText: String(v) || undefined })}
                placeholder="(numeric only)"
                fontSize={12}
              />
              <CellInput
                type="currency"
                value={r.valueNumber ?? ""}
                onChange={(v) => patch(i, { valueNumber: v === "" ? undefined : Number(v) })}
                prefix="$" placeholder="—"
                align="right" fontSize={12}
              />
              <input
                type="checkbox"
                checked={r.comparable}
                onChange={(e) => patch(i, { comparable: e.target.checked })}
                onClick={(e) => e.stopPropagation()}
                title="Include this agency in median / range rollups"
                style={{ accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                title="Remove agency"
                style={{
                  color: "var(--ink-4)", fontSize: 14, lineHeight: 1, padding: "0 4px",
                  background: "transparent", border: 0, cursor: "pointer",
                }}
              >×</button>
            </div>
          ))}
          {rows.some((r) => r.sourceNote) && (
            <div style={{
              padding: "5px 8px", borderTop: "1px solid var(--rule)",
              fontSize: "var(--t-l8)", color: "var(--ink-3)", lineHeight: 1.5,
            }}>
              {rows.filter((r) => r.sourceNote).map((r, i) => (
                <div key={i}>
                  <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{r.agency}:</span>{" "}
                  {r.sourceNote}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); add(); }}
        style={{
          fontSize: 12, color: "var(--accent)",
          background: "transparent", border: 0, cursor: "pointer", padding: 0,
          alignSelf: "flex-start",
        }}
      >+ Add agency</button>
    </div>
  );
}
