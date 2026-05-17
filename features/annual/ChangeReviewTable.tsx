import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { TableToolbar, StatusPill, DrilldownShell, DrilldownColumn, SectionLabel } from "@/components/ui";
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

type SortKey = "change" | "section" | "prior" | "current" | "impact" | "decision";

export function ChangeReviewTable() {
  const [queue, setQueue]     = useState<QueueFilter>("ALL");
  const [section, setSection] = useState<SectionFilter>("ALL");
  const [openId, setOpenId]   = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionStatus>>({});
  const [sortKey, setSortKey]   = useState<SortKey | null>(null);
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");
  const setDecision = (id: string, st: DecisionStatus) => setDecisions((d) => ({ ...d, [id]: st }));
  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const enriched = useMemo(() =>
    ANNUAL_CHANGES.map((r) => ({ ...r, section: sectionFor(r.change), priority: priorityFor(r.impact) })),
  []);

  const counts = useMemo(() => ({
    ALL:      enriched.length,
    PENDING:  enriched.filter((r) => !decisions[r.id]).length,
    ACCEPTED: enriched.filter((r) => decisions[r.id] === "accepted").length,
    DEFERRED: enriched.filter((r) => decisions[r.id] === "deferred").length,
  }), [enriched, decisions]);

  const totals = useMemo(() => ({
    accepted: enriched.filter((r) => decisions[r.id] === "accepted").length,
    pending:  enriched.filter((r) => !decisions[r.id]).length,
    deferred: enriched.filter((r) => decisions[r.id] === "deferred").length,
  }), [enriched, decisions]);

  const filtered = enriched.filter((r) => {
    if (section !== "ALL" && r.section !== section) return false;
    if (queue === "PENDING")  return !decisions[r.id];
    if (queue === "ACCEPTED") return decisions[r.id] === "accepted";
    if (queue === "DEFERRED") return decisions[r.id] === "deferred";
    return true;
  });

  const parseImpact = (s: string) => {
    const m = s.match(/([+−-])?\s*\$?\s*([\d.]+)\s*(k|m)?/i);
    if (!m) return 0;
    const sign = m[1] === "−" || m[1] === "-" ? -1 : 1;
    const mag  = /m/i.test(m[3] ?? "") ? 1000 : /k/i.test(m[3] ?? "") ? 1 : 0.001;
    return sign * parseFloat(m[2]) * mag;
  };

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (!sortKey) {
      arr.sort((a, b) => {
        const pri  = { high: 3, med: 2, low: 1, none: 0 };
        const conf = { low: 3, medium: 2, high: 1 };
        const sc = (r: typeof a) => (pri[r.priority] ?? 0) * 10 + (conf[(r.confidence.toLowerCase() as "low"|"medium"|"high")] ?? 0);
        return sc(b) - sc(a);
      });
      return arr;
    }
    arr.sort((a, b) => {
      const decRank  = { accepted: 2, deferred: 1, rejected: 0 };
      const get = (r: typeof a): string | number => {
        if (sortKey === "change")     return r.change;
        if (sortKey === "section")    return SECTION_LABEL[r.section] ?? "";
        if (sortKey === "prior")      return r.prior;
        if (sortKey === "current")    return r.current;
        if (sortKey === "impact")     return parseImpact(r.impact);
        if (sortKey === "decision")   return decRank[decisions[r.id] as keyof typeof decRank] ?? 0;
        return 0;
      };
      const va = get(a), vb = get(b);
      let c = 0;
      if (typeof va === "number" && typeof vb === "number") c = va - vb;
      else c = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "desc" ? -c : c;
    });
    return arr;
  }, [filtered, sortKey, sortDir, decisions]);

  const COLS = "minmax(260px, 2fr) 150px 100px 100px 140px 190px 28px";

  const HEADERS: { key: SortKey | "_chev"; label: string; align: "left" | "right" }[] = [
    { key: "change",   label: "Change",  align: "left" },
    { key: "section",  label: "Section", align: "left" },
    { key: "prior",    label: "Prior",   align: "right" },
    { key: "current",  label: "Current", align: "right" },
    { key: "impact",   label: "Impact",  align: "right" },
    { key: "decision", label: "Decision",align: "right" },
    { key: "_chev",    label: "",        align: "right" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StatusRow items={[
        { label: "Net impact",       value: "+$472K" },
        { label: "Changes",          value: `${enriched.length}` },
        { label: "Pending",          value: `${totals.pending}`,  tone: totals.pending > 0 ? "warn" : undefined },
        { label: "Accepted",         value: `${totals.accepted}` },
        { label: "Deferred",         value: `${totals.deferred}` },
        { label: "Blended recovery", value: `${RECOVERY_DELTAS.priorBlended}% → ${RECOVERY_DELTAS.currentBlended}%` },
      ]}/>

      <div>
        <SectionLabel right={`${enriched.length} changes`}>
          Change decision queue
        </SectionLabel>
        <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
        <TableToolbar
          shownCount={sorted.length}
          totalCount={enriched.length}
          filters={[
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
          ]}
        />

        {/* Sortable header */}
        <div style={{
          display: "grid", gridTemplateColumns: COLS,
          padding: "10px 14px", background: "var(--paper-2)",
          borderBottom: "1px solid var(--rule-strong)",
          fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
          letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
          alignItems: "end",
        }}>
          {HEADERS.map((h) => {
            const isSorted = sortKey === h.key;
            const sortable = h.key !== "_chev";
            return (
              <div
                key={h.key}
                onClick={sortable ? () => onSort(h.key as SortKey) : undefined}
                style={{
                  cursor: sortable ? "pointer" : "default",
                  color: isSorted ? "var(--ink)" : "var(--ink-3)",
                  userSelect: "none",
                  display: "flex",
                  justifyContent: h.align === "right" ? "flex-end" : "flex-start",
                  alignItems: "baseline",
                }}
              >
                <span>{h.label}</span>
                {sortable && (isSorted
                  ? <span style={{ marginLeft: 4, color: "var(--accent)", fontSize: 10, fontWeight: 700 }}>{sortDir === "asc" ? "▴" : "▾"}</span>
                  : <span style={{ marginLeft: 4, opacity: 0.25, fontSize: 9 }}>▴▾</span>
                )}
              </div>
            );
          })}
        </div>

        {sorted.map((r) => {
          const open = openId === r.id;
          const dec  = decisions[r.id];
          const impactColor = r.impact.startsWith("+") ? "var(--neg)" : (r.impact.startsWith("−") || r.impact.startsWith("-")) ? "var(--pos)" : "var(--ink-2)";

          return (
            <div key={r.id}>
              <div
                style={{
                  display: "grid", gridTemplateColumns: COLS,
                  padding: "10px 14px", borderBottom: "1px solid var(--rule)",
                  alignItems: "center",
                  background: open ? "var(--paper-2)" : dec === "accepted" ? "oklch(98% 0.015 155)" : dec ? "var(--paper-2)" : "transparent",
                  opacity: dec === "deferred" ? 0.65 : 1,
                  cursor: "pointer",
                }}
                onClick={() => setOpenId(open ? null : r.id)}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.change}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3 }}>
                    {r.id} · {r.affected}
                  </div>
                </div>
                <div>
                  <span className="mono" style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                    padding: "3px 7px", border: "1px solid var(--rule)",
                    background: "var(--paper)", color: "var(--ink-2)",
                  }}>{SECTION_LABEL[r.section]}</span>
                </div>
                <div className="mono num" style={{ textAlign: "right", fontSize: 11.5, color: "var(--ink-3)" }}>{r.prior}</div>
                <div className="mono num" style={{ textAlign: "right", fontSize: 11.5 }}>{r.current}</div>
                <div className="num" style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: impactColor }}>{r.impact}</div>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", justifyContent: "flex-end" }}>
                  <DecisionControl status={dec} onSet={(st) => setDecision(r.id, st)}/>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{
                    fontSize: 9, color: open ? "var(--accent)" : "var(--ink-3)",
                    transform: open ? "rotate(90deg)" : "none",
                    transition: "transform 100ms",
                  }}>▶</span>
                </div>
              </div>

              {open && (
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
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-3)", fontSize: 12.5 }}>
            No changes match current filters.
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
