
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  DeptChip, DrilldownShell, DrilldownColumn, TraceBlock, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import { CITY } from "@/lib/data/city";
import type { DeptCode } from "@/lib/types";
import { useBuildState } from "@/lib/store";

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

function peerJitter(id: string, median: number): number[] {
  if (!median) return CITY.peers.map(() => 0);
  const seed = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return CITY.peers.map((_, i) => {
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
  const { services, derived } = useBuildState();
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
    const peerValues = peerJitter(s.id, s.peer);
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
  }), [services, derived.fbhr]);

  const rows = useMemo(() => applyFilter(all, "dept", dept), [all, dept]);

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
          <span style={{ fontSize: 13, color: "var(--ink)" }}>{r.name}</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{r.id}</span>
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
      render: (r) => <span className="num">{fmt.dollars(r.fee)}</span>,
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
      <SectionLabel right={`${rows.length} fee${rows.length === 1 ? "" : "s"} · ${CITY.peers.length} peer cities`}>
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
          const sorted = CITY.peers.slice(0, 5)
            .map((city, i) => ({ city, value: r.peerValues[i] }))
            .sort((a, b) => b.value - a.value);
          return (
            <DrilldownShell>
              <DrilldownColumn marker="①" title="Pricing gap">
                <div style={{
                  padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--rule)",
                  fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
                }}>
                  <Line label="our fee" value={fmt.dollars(r.fee)}/>
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
                    <Line label="our unit cost" value={fmt.dollars(Math.round(r.cost))}/>
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
                  fontFamily: "var(--ff-mono)", fontSize: 11.5, lineHeight: 1.5,
                }}>
                  {sorted.map((p, i) => (
                    <div key={p.city} style={{
                      display: "flex", justifyContent: "space-between",
                      gap: 10, padding: "7px 12px",
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
              </DrilldownColumn>

              <DrilldownColumn marker="③" title="Source &amp; method">
                <TraceBlock label="Peers">{CITY.peers.join(" · ")}</TraceBlock>
                <TraceBlock label="Survey window">Adopted fees as of Jul 1, 2025 · public schedules</TraceBlock>
                <TraceBlock label="Method">
                  Median across {CITY.peers.length} peers; per-city values shown above are stable random samples around the median.
                </TraceBlock>
                <TraceBlock label="Caveat">
                  Peer fees are listed prices and may understate full cost recovery
                  if peer cities subsidize from general fund.
                </TraceBlock>
                <Link
                  to="/build/feestudy"
                  search={{ serviceId: r.id }}
                  style={{
                    display: "inline-block", marginTop: 10, fontSize: 11,
                    color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3,
                  }}
                >
                  View fee →
                </Link>
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
      fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em",
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
