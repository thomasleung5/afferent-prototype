"use client";

import { useMemo, useState } from "react";
import {
  DataTable, deriveDeptFilter, applyFilter,
  type Column, type FilterGroup,
} from "@/components/table";
import {
  DeptChip, DrilldownShell, DrilldownColumn, TraceBlock, Formula, SourcePill,
} from "@/components/ui";
import { fmt } from "@/lib/format";
import type { DeptCode } from "@/lib/types";
import type { FeeComparison } from "@/lib/calc";
import { useBuildState } from "./BuildContext";
import { ConfReason } from "./StateChip";

type Priority = "high" | "med" | "low" | "none";
type Confidence = "high" | "med" | "low";

interface Row extends FeeComparison {
  priority: Priority;
  confidence: Confidence;
  action: string;
  rationale: string[];
  flag: boolean;
}

const PRI_LABEL: Record<Priority, string> = {
  high: "High priority",
  med:  "Medium",
  low:  "Low",
  none: "—",
};

const PRI_COLOR: Record<Priority, string> = {
  high: "var(--neg)",
  med:  "var(--warn)",
  low:  "var(--ink-3)",
  none: "var(--ink-4)",
};

const CONF_LABEL: Record<Confidence, string> = {
  high: "High",
  med:  "Medium",
  low:  "Low",
};

const CONF_COLOR: Record<Confidence, string> = {
  high: "var(--pos)",
  med:  "var(--warn)",
  low:  "var(--neg)",
};

function rateRow(c: FeeComparison): Row {
  const priority: Priority =
    c.annualUplift > 25000 ? "high" :
    c.annualUplift >  5000 ? "med"  :
    c.annualUplift > 0     ? "low"  : "none";

  const confidence: Confidence =
    c.volume === 0 || c.hours === 0    ? "low" :
    c.recoveryPct > 200 || c.hours < 0.1 ? "low" :
    c.volume < 5 || c.unitCost < 50    ? "med" : "high";

  let action = "Hold — at target";
  if (c.annualUplift > 25000) action = "Raise to recommended";
  else if (c.annualUplift > 5000) action = "Raise to recommended";
  else if (c.annualUplift > 0) action = "Consider raising";
  else if (c.annualUplift < -1000) action = "Lower toward target";

  const rationale: string[] = [];
  if (c.recoveryPct < 50 && c.fee > 0) {
    rationale.push(`Current fee recovers only ${c.recoveryPct.toFixed(0)}% of cost.`);
  }
  if (c.fee === 0) {
    rationale.push("No fee currently charged — full subsidy.");
  }
  if (c.target < 100 && c.recoveryPct < c.target * 0.8) {
    rationale.push(`Recovery is below the ${c.target}% policy target.`);
  }
  if (c.volume > 50 && c.annualUplift > 10000) {
    rationale.push(`High volume (${c.volume.toLocaleString()}/yr) amplifies the per-unit gap.`);
  }
  if (rationale.length === 0 && c.annualUplift > 0) {
    rationale.push(`Service is under target by ${(c.target - c.recoveryPct).toFixed(0)} points.`);
  }

  return {
    ...c,
    priority,
    confidence,
    action,
    rationale,
    flag: confidence === "low",
  };
}

export function RecommendationsTable() {
  const { services, derived } = useBuildState();
  const [dept, setDept] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [openId, setOpenId] = useState<string | undefined>();

  const all: Row[] = useMemo(
    () => derived.comparisons
      .filter((c) => c.annualUplift !== 0)
      .map(rateRow),
    [derived.comparisons],
  );

  const rows = useMemo(() => {
    let out = applyFilter(all, "dept", dept);
    if (priority !== "ALL") out = out.filter((r) => r.priority === priority);
    return out;
  }, [all, dept, priority]);

  const filters: FilterGroup[] = [
    {
      id: "dept", label: "Dept",
      options: deriveDeptFilter(all),
      value: dept, onChange: setDept,
    },
    {
      id: "priority", label: "Priority",
      options: [
        { value: "ALL",  label: "All",     count: all.length },
        { value: "high", label: "High",    count: all.filter((r) => r.priority === "high").length },
        { value: "med",  label: "Medium",  count: all.filter((r) => r.priority === "med").length },
        { value: "low",  label: "Low",     count: all.filter((r) => r.priority === "low").length },
      ],
      value: priority, onChange: setPriority,
    },
  ];

  const cols: Column<Row>[] = [
    {
      key: "priority",
      label: "Priority",
      width: "120px",
      sortable: true,
      sortKey: (r) => ({ high: 3, med: 2, low: 1, none: 0 })[r.priority],
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: PRI_COLOR[r.priority],
          }}/>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{PRI_LABEL[r.priority]}</span>
        </span>
      ),
    },
    {
      key: "name",
      label: "Service",
      width: "minmax(220px, 2fr)",
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
      label: "Now",
      width: "90px",
      align: "right",
      sortable: true,
      render: (r) => <span className="num">{fmt.dollars(r.fee)}</span>,
    },
    {
      key: "recommended",
      label: "Recommended",
      width: "120px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num" style={{ fontWeight: 600, color: "var(--accent)" }}>
          {fmt.dollars(r.recommended)}
        </span>
      ),
    },
    {
      key: "annualUplift",
      label: "Annual uplift",
      width: "120px",
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
      key: "confidence",
      label: "Confidence",
      width: "100px",
      align: "right",
      sortable: true,
      sortKey: (r) => ({ high: 3, med: 2, low: 1 })[r.confidence],
      render: (r) => (
        <span className="mono" style={{
          display: "inline-block",
          fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          padding: "2px 7px",
          textTransform: "uppercase",
          color: CONF_COLOR[r.confidence],
          border: `1px solid ${CONF_COLOR[r.confidence]}`,
          background: r.confidence === "high" ? "var(--pos-tint)" :
                       r.confidence === "med"  ? "var(--warn-tint)" :
                                                  "var(--neg-tint)",
        }}>{CONF_LABEL[r.confidence]}</span>
      ),
    },
    {
      key: "action",
      label: "Action",
      width: "minmax(170px, 1.2fr)",
      render: (r) => <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.action}</span>,
    },
  ];

  const totalUplift = rows.reduce((a, r) => a + Math.max(0, r.annualUplift), 0);
  const totalCount = rows.length;

  return (
    <DataTable
      title="Recommended fee changes"
      eyebrow="Output · Ranked by annual uplift, high-confidence first"
      cols={cols}
      rows={rows}
      filters={filters}
      defaultSort={{ key: "annualUplift", dir: "desc" }}
      stickySort={(a, b) => (a.flag ? 1 : 0) - (b.flag ? 1 : 0)}
      openId={openId}
      onRowClick={(r) => setOpenId(openId === r.id ? undefined : r.id)}
      renderDrilldown={(r) => {
        const svc = services.find((s) => s.id === r.id);
        if (!svc) return null;
        const fbhr = derived.fbhr[r.dept as DeptCode]?.fbhr ?? 0;
        return (
          <DrilldownShell>
            <DrilldownColumn marker="①" title="Recommendation">
              <TraceBlock label="Action">
                <b style={{ color: "var(--ink)" }}>{r.action}</b>
              </TraceBlock>
              <TraceBlock label="Confidence">
                <span style={{ color: CONF_COLOR[r.confidence], fontWeight: 600 }}>
                  {CONF_LABEL[r.confidence]}
                </span>
              </TraceBlock>
              <TraceBlock label="Annual uplift">
                <b className="num" style={{ color: "var(--pos)" }}>
                  {r.annualUplift > 0 ? "+" : ""}{fmt.dollarsK(r.annualUplift)}/yr
                </b>
              </TraceBlock>
              <div style={{ marginTop: 10 }}>
                <SourcePill tone="policy">RECOMMENDED FEE</SourcePill>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="②" title="Rationale">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {r.rationale.map((rr, i) => (
                  <ConfReason key={i} ok={false} text={rr}/>
                ))}
              </div>
              <div style={{
                padding: "12px 14px", marginTop: 12,
                background: "var(--paper)", border: "1px solid var(--rule)",
                fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>cost</span>
                  <b>{fmt.dollars(r.unitCost)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>× target {r.target}%</span>
                  <b>{fmt.dollars(r.recommended)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>− current fee</span>
                  <b>{fmt.dollars(r.fee)}</b>
                </div>
                <div style={{
                  borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>× volume {r.volume}</span>
                  <b style={{ color: "var(--pos)" }}>{fmt.dollarsK(r.annualUplift)}</b>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Formula>(recommended − fee) × volume = annual uplift</Formula>
              </div>
            </DrilldownColumn>

            <DrilldownColumn marker="③" title="Lineage">
              <TraceBlock label="Service">{svc.hours} h × dept FBHR ${Math.round(fbhr)}/hr (Cost of Service)</TraceBlock>
              <TraceBlock label="Volume">{r.volume.toLocaleString()}/yr (Workload)</TraceBlock>
              <TraceBlock label="Target">{r.target}% from Recovery Policy</TraceBlock>
              <TraceBlock label="Peer median">{svc.peer > 0 ? fmt.dollars(svc.peer) : "—"} (Fee Benchmark)</TraceBlock>
              <TraceBlock label="Current recovery">
                <span style={{
                  color: r.recoveryPct >= 80 ? "var(--pos)" :
                         r.recoveryPct >= 50 ? "var(--warn)" : "var(--neg)",
                  fontWeight: 600,
                }}>{r.recoveryPct.toFixed(0)}%</span>
              </TraceBlock>
            </DrilldownColumn>
          </DrilldownShell>
        );
      }}
      footerNote={
        <span>
          {totalCount} recommendations · total potential uplift{" "}
          <b style={{ color: "var(--pos)" }}>+{fmt.dollarsK(totalUplift)}/yr</b>
        </span>
      }
    />
  );
}
