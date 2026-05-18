import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { DataTable, type Column, type FilterGroup } from "@/components/table";
import { StatusPill, DrilldownShell, DrilldownColumn, SectionLabel } from "@/components/ui";
import { ConfReason } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { ANNUAL_CHANGES, RECOVERY_DELTAS, type AnnualChange } from "@/lib/data/annual";

type DecisionStatus = "accepted" | "deferred" | "rejected" | undefined;
type QueueFilter = "ALL" | "PENDING" | "ACCEPTED" | "DEFERRED";
type SectionFilter = "ALL" | "SAL" | "WKL" | "CAP" | "FEE" | "SVC" | "OPS";

const SECTION_LABEL: Record<string, string> = {
  SAL: "Direct Labor", WKL: "Workload", CAP: "Cost Allocation",
  FEE: "Fee schedule", SVC: "Services", OPS: "Operating",
};

const SECTION_HREF: Record<string, string> = {
  SAL: "/build/salary",
  WKL: "/build/workload",
  CAP: "/build/cap",
  FEE: "/build/feestudy",
  SVC: "/build/services",
  OPS: "/build/operating",
};

function sectionFor(change: string): string {
  const c = change.toLowerCase();
  if (c.includes("salary") || c.includes("benefits") || c.includes("technician") || c.includes("title")) return "SAL";
  if (c.includes("workload") || c.includes("permit volume") || c.includes("permit")) return "WKL";
  if (c.includes("cap") || c.includes("attorney") || c.includes("overhead") || c.includes("insurance") || c.includes("finance")) return "CAP";
  if (c.includes("fee") || c.includes("schedule") || c.includes("recovery")) return "FEE";
  if (c.includes("hours") || c.includes("excluded") || c.includes("long-range")) return "SVC";
  return "OPS";
}

function priorityFor(impact: string): "high" | "med" | "low" | "none" {
  const m = impact.match(/[\d.]+\s*(k|m)?/i);
  if (!m) return "none";
  const n = parseFloat(m[0]) * (/m/i.test(m[1] ?? "") ? 1000 : /k/i.test(m[1] ?? "") ? 1 : 0.001);
  if (n >= 100) return "high";
  if (n >= 20)  return "med";
  if (n > 0)    return "low";
  return "none";
}

function statusKindFor(badge: string): "bad" | "warn" | "review" | "ok" | "info" {
  const b = badge.toLowerCase();
  if (b.includes("legal")) return "bad";
  if (b.includes("high impact") || b.includes("missing")) return "bad";
  if (b.includes("low confidence")) return "warn";
  if (b.includes("needs review")) return "review";
  return "info";
}

function parseImpact(s: string): number {
  const m = s.match(/([+−-])?\s*\$?\s*([\d.]+)\s*(k|m)?/i);
  if (!m) return 0;
  const sign = m[1] === "−" || m[1] === "-" ? -1 : 1;
  const mag  = /m/i.test(m[3] ?? "") ? 1000 : /k/i.test(m[3] ?? "") ? 1 : 0.001;
  return sign * parseFloat(m[2]) * mag;
}

function DecisionControl({ status, onSet }: { status: DecisionStatus; onSet: (s: DecisionStatus) => void }) {
  const opts: { k: NonNullable<DecisionStatus>; label: string }[] = [
    { k: "accepted", label: "Accept" },
    { k: "deferred", label: "Defer" },
    { k: "rejected", label: "Reject" },
  ];
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--rule)", background: "var(--paper)" }}>
      {opts.map((o, i) => {
        const on = status === o.k;
        return (
          <button key={o.k} onClick={() => onSet(on ? undefined : o.k)} style={{
            padding: "4px 9px", fontSize: 11, fontWeight: 500,
            color: on ? "var(--ink)" : "var(--ink-3)",
            background: on ? "var(--paper-2)" : "transparent",
            borderRight: i < opts.length - 1 ? "1px solid var(--rule)" : "none",
            cursor: "pointer",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

interface Row extends AnnualChange {
  section: string;
  priority: "high" | "med" | "low" | "none";
}

export function ChangeReviewTable() {
  const [queue, setQueue]     = useState<QueueFilter>("ALL");
  const [section, setSection] = useState<SectionFilter>("ALL");
  const [openId, setOpenId]   = useState<string | undefined>(undefined);
  const [decisions, setDecisions] = useState<Record<string, DecisionStatus>>({});
  const setDecision = (id: string, st: DecisionStatus) => setDecisions((d) => ({ ...d, [id]: st }));

  // Enriched + pre-sorted by the canonical priority × confidence rule.
  // DataTable preserves input order until the user clicks a sortable
  // header, so this becomes the default row order.
  const enriched: Row[] = useMemo(() => {
    const pri  = { high: 3, med: 2, low: 1, none: 0 };
    const conf: Record<string, number> = { low: 3, medium: 2, high: 1 };
    const sc = (r: Row) => (pri[r.priority] ?? 0) * 10 + (conf[r.confidence.toLowerCase()] ?? 0);
    return ANNUAL_CHANGES
      .map((r): Row => ({ ...r, section: sectionFor(r.change), priority: priorityFor(r.impact) }))
      .sort((a, b) => sc(b) - sc(a));
  }, []);

  const counts = useMemo(() => ({
    ALL:      enriched.length,
    PENDING:  enriched.filter((r) => !decisions[r.id]).length,
    ACCEPTED: enriched.filter((r) => decisions[r.id] === "accepted").length,
    DEFERRED: enriched.filter((r) => decisions[r.id] === "deferred").length,
  }), [enriched, decisions]);

  const totals = counts;

  const filtered = useMemo(() => enriched.filter((r) => {
    if (section !== "ALL" && r.section !== section) return false;
    if (queue === "PENDING")  return !decisions[r.id];
    if (queue === "ACCEPTED") return decisions[r.id] === "accepted";
    if (queue === "DEFERRED") return decisions[r.id] === "deferred";
    return true;
  }), [enriched, section, queue, decisions]);

  const filters: FilterGroup[] = [
    {
      id: "queue",
      options: [
        { value: "ALL",      label: "All",      count: counts.ALL },
        { value: "PENDING",  label: "Pending",  count: counts.PENDING },
        { value: "ACCEPTED", label: "Accepted", count: counts.ACCEPTED },
        { value: "DEFERRED", label: "Deferred", count: counts.DEFERRED },
      ],
      value: queue, onChange: (v) => setQueue(v as QueueFilter),
    },
    {
      id: "section", label: "Section",
      options: [
        { value: "ALL", label: "All" },
        { value: "SAL", label: "Direct Labor" },
        { value: "WKL", label: "Workload" },
        { value: "CAP", label: "Cost Allocation" },
        { value: "FEE", label: "Fee schedule" },
        { value: "SVC", label: "Services" },
        { value: "OPS", label: "Operating" },
      ],
      value: section, onChange: (v) => setSection(v as SectionFilter),
    },
  ];

  const cols: Column<Row>[] = [
    {
      key: "change",
      label: "Change",
      width: "minmax(260px, 2fr)",
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.change}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3 }}>
            {r.id} · {r.affected}
          </div>
        </div>
      ),
    },
    {
      key: "section",
      label: "Section",
      width: "150px",
      sortable: true,
      sortKey: (r) => SECTION_LABEL[r.section] ?? "",
      render: (r) => (
        <span className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          padding: "3px 7px", border: "1px solid var(--rule)",
          background: "var(--paper)", color: "var(--ink-2)",
        }}>{SECTION_LABEL[r.section]}</span>
      ),
    },
    {
      key: "prior",
      label: "Prior",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="mono num" style={{ color: "var(--ink-3)" }}>{r.prior}</span>
      ),
    },
    {
      key: "current",
      label: "Current",
      width: "100px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="mono num">{r.current}</span>
      ),
    },
    {
      key: "impact",
      label: "Impact",
      width: "140px",
      align: "right",
      sortable: true,
      sortKey: (r) => parseImpact(r.impact),
      render: (r) => {
        const color = r.impact.startsWith("+") ? "var(--neg)"
          : (r.impact.startsWith("−") || r.impact.startsWith("-")) ? "var(--pos)"
          : "var(--ink-2)";
        return (
          <span className="num" style={{ fontWeight: 600, color }}>{r.impact}</span>
        );
      },
    },
    {
      key: "decision",
      label: "Decision",
      width: "190px",
      align: "right",
      sortable: true,
      sortKey: (r) => {
        const rank: Record<string, number> = { accepted: 2, deferred: 1, rejected: 0 };
        return rank[decisions[r.id] ?? ""] ?? -1;
      },
      render: (r) => (
        // Inner click must not toggle the row drilldown.
        <div onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
          <DecisionControl status={decisions[r.id]} onSet={(st) => setDecision(r.id, st)}/>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StatusRow items={[
        { label: "Net impact",       value: "+$472K" },
        { label: "Changes",          value: `${enriched.length}` },
        { label: "Pending",          value: `${totals.PENDING}`,  tone: totals.PENDING > 0 ? "warn" : undefined },
        { label: "Accepted",         value: `${totals.ACCEPTED}` },
        { label: "Deferred",         value: `${totals.DEFERRED}` },
        { label: "Blended recovery", value: `${RECOVERY_DELTAS.priorBlended}% → ${RECOVERY_DELTAS.currentBlended}%` },
      ]}/>

      <div>
        <SectionLabel right={`${enriched.length} changes`}>
          Change decision queue
        </SectionLabel>
        <DataTable
          cols={cols}
          rows={filtered}
          filters={filters}
          openId={openId}
          drilldownIndicator
          onRowClick={(r) => setOpenId((cur) => cur === r.id ? undefined : r.id)}
          emptyState="No changes match current filters."
          getRowStyle={(r) => {
            const dec = decisions[r.id];
            if (dec === "accepted") return { bg: "oklch(98% 0.015 155)" };
            if (dec === "deferred") return { bg: "var(--paper-2)", style: { opacity: 0.65 } };
            if (dec === "rejected") return { bg: "var(--paper-2)" };
            return null;
          }}
          renderDrilldown={(r) => {
            const impactColor = r.impact.startsWith("+") ? "var(--neg)"
              : (r.impact.startsWith("−") || r.impact.startsWith("-")) ? "var(--pos)"
              : "var(--ink-2)";
            return (
              <DrilldownShell>
                <DrilldownColumn marker="①" title="Change detail">
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    <div style={{ fontWeight: 500 }}>{r.change}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Affects: {r.affected}</div>
                    <div style={{
                      marginTop: 10, padding: "8px 10px",
                      background: "var(--paper)", border: "1px solid var(--rule)",
                      fontFamily: "var(--ff-mono)", fontSize: 11.5, lineHeight: 1.7,
                    }}>
                      <div style={{ color: "var(--ink-3)" }}>prior:   <span style={{ color: "var(--ink)" }}>{r.prior}</span></div>
                      <div style={{ color: "var(--ink-3)" }}>current: <span style={{ color: "var(--ink)" }}>{r.current}</span></div>
                      <div style={{ borderTop: "1px solid var(--rule)", marginTop: 4, paddingTop: 4, color: impactColor, fontWeight: 600 }}>
                        impact:  {r.impact}
                      </div>
                    </div>
                  </div>
                </DrilldownColumn>

                <DrilldownColumn marker="②" title="Recommended action">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>{r.action}</div>
                    <StatusPill kind={statusKindFor(r.badge)}>{r.badge}</StatusPill>
                    <Link to={SECTION_HREF[r.section]} style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                      Open {SECTION_LABEL[r.section]} section →
                    </Link>
                  </div>
                </DrilldownColumn>

                <DrilldownColumn marker="③" title="Confidence & source">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <ConfReason ok={r.confidence.toLowerCase() === "high"} text={`Source confidence: ${r.confidence}`}/>
                    <ConfReason
                      ok={!/legal|low confidence/i.test(r.badge)}
                      text={/legal/i.test(r.badge) ? "Legal review required before adoption" : /low confidence/i.test(r.badge) ? "Low confidence — verify mapping" : "No outstanding review flags"}
                    />
                    <ConfReason
                      ok={!r.impact.toLowerCase().startsWith("recovery drift")}
                      text={r.impact.toLowerCase().startsWith("recovery drift") ? "Drift accumulates if fees held flat" : "Direct cost impact recomputed"}
                    />
                  </div>
                  <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
                    Trace this row back to its section to see the underlying inputs and downstream services.
                  </div>
                </DrilldownColumn>
              </DrilldownShell>
            );
          }}
        />
      </div>
    </div>
  );
}
