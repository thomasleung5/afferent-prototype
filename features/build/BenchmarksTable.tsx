
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  DeptChip, DrilldownShell, DrilldownColumn, InlineLinkRow, SectionLabel,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import { useBuildState } from "@/lib/store";
import { useActiveJurisdiction } from "@/lib/active";
import { displayCostOfService, displayCurrentFee } from "@/lib/feeDisplay";

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

export function BenchmarksTable() {
  const { services, derived } = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const peers = jurisdiction.peers;
  const [dept, setDept] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();
  // ?serviceId=... means we were cross-navigated here from another tab.
  // On arrival, drop any dept filter that would hide the row, open the
  // matching drilldown, scroll it into view, and flash it briefly so the
  // user sees where they landed.
  const { serviceId } = useSearch({ from: "/build/benchmarks" });
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
    };
  }), [services, derived.fbhr, peers]);

  const rows = useMemo(() => applyFilter(all, "dept", dept), [all, dept]);

  // Service lookup for the fee-display helpers (currentFeeText /
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
          <span className="num" style={{ color }}>
            {v > 0 ? "+" : ""}{Math.round(v)}%
          </span>
        );
      },
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
        defaultSort={{ key: "feeNo", dir: "asc" }}
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
                    <Line label="our unit cost" value={svc ? displayCostOfService(svc, { unitCost: Math.round(r.cost) }) : fmt.dollars(Math.round(r.cost))}/>
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
                <InlineLinkRow
                  links={[
                    { to: "/build/costs",    search: { serviceId: r.id },
                      text: "View cost of service →" },
                    { to: "/build/feestudy", search: { serviceId: r.id },
                      text: "View fee schedule →" },
                  ]}
                />
              </DrilldownColumn>
            </DrilldownShell>
          );
        }}
      />
    </div>
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

