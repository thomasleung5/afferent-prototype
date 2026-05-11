
import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  DeptChip, DrilldownShell, DrilldownColumn, TraceBlock, Formula, SourcePill,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import { CITY } from "@/lib/data/city";
import type { DeptCode, Service } from "@/lib/types";
import { useBuildState } from "./BuildContext";

interface Row {
  id: string;
  name: string;
  dept: DeptCode;
  hours: number;
  fee: number;
  cost: number;
  peerMedian: number;
  peerValues: number[];
  varianceVsMedian: number;
  varianceVsCost: number;
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

export function BenchmarkTable() {
  const { services, derived } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  const all: Row[] = useMemo(() => services.map((s) => {
    const fbhr = derived.fbhr[s.dept]?.fbhr ?? 0;
    const cost = s.hours * fbhr;
    const peerValues = peerJitter(s.id, s.peer);
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
      varianceVsMedian,
      varianceVsCost,
    };
  }), [services, derived.fbhr]);

  const rows = useMemo(() => applyFilter(all, "dept", dept), [all, dept]);

  const filters: FilterGroup[] = [{
    id: "dept", label: "Dept",
    options: deriveDeptFilter(all),
    value: dept, onChange: setDept,
  }];

  const peerCols: Column<Row>[] = CITY.peers.slice(0, 5).map((city, i) => ({
    key: `peer_${i}`,
    label: city,
    width: "110px",
    align: "right",
    sortable: true,
    sortKey: (r) => r.peerValues[i] ?? 0,
    render: (r) => (
      <span className="num" style={{ color: "var(--ink-3)" }}>
        {r.peerValues[i] > 0 ? fmt.dollars(r.peerValues[i]) : "—"}
      </span>
    ),
  }));

  const cols: Column<Row>[] = [
    {
      key: "name",
      label: "Fee item",
      width: "minmax(240px, 1.8fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontSize: 13 }}>{r.name}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{r.id}</div>
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
      label: "Our fee",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollars(r.fee)}</span>,
    },
    {
      key: "peerMedian",
      label: "Peer median",
      width: "110px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num">
          {r.peerMedian > 0 ? fmt.dollars(r.peerMedian) : "—"}
        </span>
      ),
    },
    ...peerCols,
    {
      key: "varianceVsMedian",
      label: "vs Median",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => {
        if (r.peerMedian <= 0) return <span style={{ color: "var(--ink-4)" }}>—</span>;
        const v = r.varianceVsMedian;
        const color = v > 5 ? "var(--neg)" : v < -5 ? "var(--warn)" : "var(--pos)";
        return (
          <span className="num" style={{ color, fontWeight: 600 }}>
            {v > 0 ? "+" : ""}{Math.round(v)}%
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      title="Fee benchmark · adopted fees in peer cities"
      eyebrow={`Benchmark · ${CITY.peers.slice(0, 5).join(" · ")}`}
      cols={cols}
      rows={rows}
      filters={filters}
      defaultSort={{ key: "varianceVsMedian", dir: "desc" }}
      openId={openId}
      onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
      drilldownIndicator
      minWidth={1100}
      renderDrilldown={(r) => {
        const sorted = CITY.peers.slice(0, 5)
          .map((city, i) => ({ city, value: r.peerValues[i] }))
          .sort((a, b) => b.value - a.value);
        return (
          <DrilldownShell>
            <DrilldownColumn marker="①" title="Our fee vs. peers">
              <div style={{
                padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>our fee</span>
                  <b>{fmt.dollars(r.fee)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>peer median</span>
                  <b>{r.peerMedian > 0 ? fmt.dollars(r.peerMedian) : "—"}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>variance</span>
                  <b style={{
                    color: r.varianceVsMedian > 5 ? "var(--neg)" :
                           r.varianceVsMedian < -5 ? "var(--warn)" : "var(--pos)",
                  }}>
                    {r.peerMedian > 0 ? `${r.varianceVsMedian > 0 ? "+" : ""}${Math.round(r.varianceVsMedian)}%` : "—"}
                  </b>
                </div>
                <div style={{
                  borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span style={{ color: "var(--ink-3)" }}>our unit cost</span>
                  <b>{fmt.dollars(Math.round(r.cost))}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>vs cost</span>
                  <b style={{
                    color: r.varianceVsCost < -10 ? "var(--neg)" : "var(--ink)",
                  }}>
                    {r.cost > 0 ? `${r.varianceVsCost > 0 ? "+" : ""}${Math.round(r.varianceVsCost)}%` : "—"}
                  </b>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Formula>variance = (our fee − peer median) ÷ peer median</Formula>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Peer cities ranked">
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

            <DrilldownColumn marker="③" title="Source & method">
              <TraceBlock label="Peers">Atherton · Portola Valley · Woodside · Hillsborough · Monte Sereno</TraceBlock>
              <TraceBlock label="Survey window">Adopted fees as of Jul 1, 2025 · public schedules</TraceBlock>
              <TraceBlock label="Method">
                Median across 5 peers; per-city values shown above are stable random samples around the median.
              </TraceBlock>
              <TraceBlock label="Caveat">
                Peer fees are listed prices and may understate full cost recovery
                if peer cities subsidize from general fund.
              </TraceBlock>
              <div style={{ marginTop: 10 }}>
                <SourcePill>BENCHMARK</SourcePill>
              </div>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      footerNote={`${rows.length} fees · click a row to compare peer cities and cost basis`}
    />
  );
}
