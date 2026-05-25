import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { DataTable, type Column, type FilterGroup } from "@/components/table";
import { StatusPill, DrilldownShell, DrilldownColumn, SectionLabel } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeChangeExplanations } from "@/features/annual/FeeChangeExplanations";
import { fmt } from "@/lib/format";
import { useBuildState, type Domain } from "@/lib/store";
import {
  deriveAnnualChanges, deriveRecoveryDelta, deriveNetImpact,
  sectionCodeFor, sectionLabelForDomain, sectionHrefForDomain,
  type AnnualChange,
} from "@/lib/data/annual";

const KNOWN_DOMAINS = new Set<string>([
  "positions", "operating", "services", "fees", "volume", "cap",
]);
const asDomain = (s: string): Domain | null => (KNOWN_DOMAINS.has(s) ? (s as Domain) : null);

type DecisionStatus = "accepted" | "deferred" | "rejected" | undefined;
type QueueFilter = "ALL" | "PENDING" | "ACCEPTED" | "DEFERRED";
type SectionFilter = "ALL" | "SAL" | "VOL" | "CAP" | "FEE" | "SVC" | "OPS";

function priorityForBadge(badge: string): "high" | "med" | "low" | "none" {
  const b = badge.toLowerCase();
  if (b.includes("needs review") || b.includes("low confidence") || b.includes("warning")) return "high";
  if (b.includes("confirm")) return "med";
  return "low";
}

function statusKindFor(badge: string): "bad" | "warn" | "review" | "ok" | "info" {
  const b = badge.toLowerCase();
  if (b.includes("legal")) return "bad";
  if (b.includes("high impact") || b.includes("missing")) return "bad";
  if (b.includes("low confidence")) return "warn";
  if (b.includes("needs review")) return "review";
  if (b.includes("warnings")) return "warn";
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
            padding: "4px 9px", fontSize: "var(--t-l8)", fontWeight: 500,
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
  /** Original import domain — used to link back to the right build section. */
  domain?: string;
}

export function ChangeReviewTable() {
  const state = useBuildState();
  const [queue, setQueue]     = useState<QueueFilter>("ALL");
  const [section, setSection] = useState<SectionFilter>("ALL");
  const [openId, setOpenId]   = useState<string | undefined>(undefined);
  const [decisions, setDecisions] = useState<Record<string, DecisionStatus>>({});
  const setDecision = (id: string, st: DecisionStatus) => setDecisions((d) => ({ ...d, [id]: st }));

  const input = useMemo(() => ({
    imports: state.imports,
    productiveHours: state.productiveHours,
    operating: state.operating,
    volume: state.volume,
    services: state.services,
    capPools: state.capPools,
    comparisons: state.derived.comparisons,
    impact: state.derived.impact,
  }), [state]);

  const changes = useMemo(() => deriveAnnualChanges(input), [input]);
  const recovery = useMemo(() => deriveRecoveryDelta(input), [input]);
  const netImpact = useMemo(() => deriveNetImpact(input), [input]);

  // Enriched + pre-sorted by priority. The import log is already newest-
  // first; we layer a stable priority sort on top so urgent items lead.
  const enriched: Row[] = useMemo(() => {
    const pri = { high: 3, med: 2, low: 1, none: 0 };
    return changes
      .map((c): Row => {
        const domain = state.imports.find((e) => `change-${e.id}` === c.id)?.domain;
        return {
          ...c,
          domain,
          section: domain ? sectionCodeFor(domain) : "OPS",
          priority: priorityForBadge(c.badge),
        };
      })
      .sort((a, b) => (pri[b.priority] ?? 0) - (pri[a.priority] ?? 0));
  }, [changes, state.imports]);

  const counts = useMemo(() => ({
    ALL:      enriched.length,
    PENDING:  enriched.filter((r) => !decisions[r.id]).length,
    ACCEPTED: enriched.filter((r) => decisions[r.id] === "accepted").length,
    DEFERRED: enriched.filter((r) => decisions[r.id] === "deferred").length,
  }), [enriched, decisions]);

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
        { value: "VOL", label: "Volume" },
        { value: "CAP", label: "Overhead Cost Allocation" },
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "var(--ink)" }}>{r.change}</span>
          <span className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-4)", letterSpacing: "0.05em" }}>
            {r.affected}
          </span>
        </div>
      ),
    },
    {
      key: "result",
      label: "Result",
      width: "200px",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="num">{r.result}</span>
      ),
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
        <div onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
          <DecisionControl status={decisions[r.id]} onSet={(st) => setDecision(r.id, st)}/>
        </div>
      ),
    },
  ];

  const netImpactLabel = netImpact === 0
    ? "$0"
    : `${netImpact > 0 ? "+" : "−"}${fmt.dollarsK(Math.abs(netImpact))}/yr`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StatusRow items={[
        {
          label: "Net adoption impact",
          value: netImpactLabel,
          tone: netImpact > 0 ? "pos" : netImpact < 0 ? "neg" : undefined,
        },
        { label: "Changes", value: `${enriched.length}` },
        {
          label: "Blended recovery",
          value: `${recovery.currentBlended}% / ${recovery.policyTarget}% target`,
          tone: recovery.gapPts <= 0 ? "pos" : recovery.gapPts <= 10 ? "warn" : "neg",
        },
      ]}/>

      <div>
        <SectionLabel right={`${enriched.length} change${enriched.length === 1 ? "" : "s"}`}>
          Change decision queue
        </SectionLabel>
        <DataTable
          cols={cols}
          rows={filtered}
          filters={filters}
          openId={openId}
          drilldownIndicator
          onRowClick={(r) => setOpenId((cur) => cur === r.id ? undefined : r.id)}
          emptyState={
            enriched.length === 0
              ? "No imports yet — refresh sources to populate the change log."
              : "No changes match current filters."
          }
          getRowStyle={(r) => {
            const dec = decisions[r.id];
            if (dec === "accepted") return { bg: "var(--pos-tint)" };
            if (dec === "deferred") return { bg: "var(--paper-2)", style: { opacity: 0.65 } };
            if (dec === "rejected") return { bg: "var(--paper-2)" };
            return null;
          }}
          renderDrilldown={(r) => (
            <DrilldownShell>
              <DrilldownColumn marker="①" title="Change detail">
                <div style={{ fontSize: "var(--fs-ui)", lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 500 }}>{r.change}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Affects: {r.affected}</div>
                </div>
              </DrilldownColumn>

              <DrilldownColumn marker="②" title="Recommended action">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: "var(--fs-ui)", lineHeight: 1.6, color: "var(--ink-2)" }}>{r.action}</div>
                  <StatusPill kind={statusKindFor(r.badge)}>{r.badge}</StatusPill>
                  {(() => {
                    const d = r.domain ? asDomain(r.domain) : null;
                    if (!d) return null;
                    return (
                      <Link to={sectionHrefForDomain(d)} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                        Open {sectionLabelForDomain(d)} section →
                      </Link>
                    );
                  })()}
                </div>
              </DrilldownColumn>
            </DrilldownShell>
          )}
        />
      </div>

      <FeeChangeExplanations/>
    </div>
  );
}
