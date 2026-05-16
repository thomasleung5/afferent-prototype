import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { TableToolbar, StatusPill, DrilldownShell, DrilldownColumn } from "@/components/ui";
import { ConfReason } from "@/features/build/StateChip";
import { SECTIONS, SECTION_DATA, type SectionKey, type SectionRow } from "@/lib/data/annual";

type DecisionStatus = "accepted" | "deferred" | "rejected" | undefined;
type Filter = "NEEDS" | "HIGH" | "LOW_CONF" | "ACCEPTED" | "ALL";

const BUILD_LINK: Record<SectionKey, string> = {
  services:  "/build/services",
  salary:    "/build/salary",
  operating: "/build/operating",
  cap:       "/build/cap",
  workload:  "/build/workload",
  costs:     "/build/costs",
  policy:    "/build/policy",
  fees:      "/build/feestudy",
};

function priorityFor(status: SectionRow["status"]): "high" | "med" | "none" {
  if (status === "unmapped" || status === "low-confidence") return "high";
  if (status === "needs-review") return "med";
  return "none";
}

function statusKind(status: SectionRow["status"]) {
  if (status === "unmapped")       return { kind: "bad"    as const, label: "Unmapped" };
  if (status === "low-confidence") return { kind: "warn"   as const, label: "Limited data" };
  if (status === "needs-review")   return { kind: "review" as const, label: "Review" };
  return                                  { kind: "ok"     as const, label: "Auto" };
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

interface Props {
  sectionKey: SectionKey;
}

export function SectionReviewTable({ sectionKey }: Props) {
  const meta = SECTIONS.find((s) => s.k === sectionKey)!;
  const data = SECTION_DATA[sectionKey];
  const [filter, setFilter] = useState<Filter>("NEEDS");
  const [openId, setOpenId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionStatus>>({});
  const setDecision = (id: string, st: DecisionStatus) => setDecisions((d) => ({ ...d, [id]: st }));

  const enriched = useMemo(() =>
    data.rows.map((r) => ({ ...r, priority: priorityFor(r.status) })),
  [data.rows]);

  const counts = useMemo(() => ({
    ALL:      enriched.length,
    NEEDS:    enriched.filter((r) => r.status !== "auto" && !decisions[r.id]).length,
    HIGH:     enriched.filter((r) => r.priority === "high").length,
    LOW_CONF: enriched.filter((r) => r.confidence.toLowerCase() === "low").length,
    ACCEPTED: enriched.filter((r) => decisions[r.id] === "accepted").length,
  }), [enriched, decisions]);

  const filtered = enriched.filter((r) => {
    if (filter === "NEEDS")    return r.status !== "auto" && !decisions[r.id];
    if (filter === "HIGH")     return r.priority === "high";
    if (filter === "LOW_CONF") return r.confidence.toLowerCase() === "low";
    if (filter === "ACCEPTED") return decisions[r.id] === "accepted";
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const pri = { high: 3, med: 2, none: 0 };
    const conf = { low: 3, medium: 2, high: 1 };
    const aScore = pri[a.priority] * 10 + (conf[(a.confidence.toLowerCase() as "low" | "medium" | "high")] || 0);
    const bScore = pri[b.priority] * 10 + (conf[(b.confidence.toLowerCase() as "low" | "medium" | "high")] || 0);
    return bScore - aScore;
  });

  const pending  = enriched.filter((r) => r.status !== "auto" && !decisions[r.id]).length;
  const accepted = enriched.filter((r) => decisions[r.id] === "accepted").length;

  const COLS = "minmax(280px, 2fr) 130px 120px 120px 130px 200px 28px";

  const deltaColor = (tone: SectionRow["deltaTone"]) =>
    tone === "neg" ? "var(--neg)" : tone === "pos" ? "var(--pos)" : tone === "warn" ? "var(--warn)" : "var(--ink-3)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Section header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 8 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6 }}>
              {data.summary.impact}
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
              <b style={{ color: "var(--ink)", fontWeight: 600 }}>{data.summary.autoPct}%</b> auto-mapped
              {" · "}
              <b style={{ color: "var(--ink)", fontWeight: 600 }}>{data.summary.needsReview}</b> review
              {" · "}confidence <b style={{ color: "var(--ink)", fontWeight: 600 }}>{data.summary.conf}</b>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: pending > 0 ? "var(--warn)" : "var(--pos)" }}>
            {pending > 0 ? `${pending} pending` : "Section reviewed"}
            <div style={{ fontSize: 11, fontWeight: 400, color: "var(--ink-3)" }}>
              {pending > 0 ? "Review before continuing" : "All items resolved"}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 700 }}>
          {data.summary.narrative}
        </div>
      </div>

      {/* Decision queue */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
        <TableToolbar
          title={`${meta.label} decision queue`}
          shownCount={sorted.length}
          totalCount={enriched.length}
          filters={[{
            id: "queue", label: "Queue",
            options: [
              { value: "ALL",      label: "All rows",      count: counts.ALL },
              { value: "NEEDS",    label: "Needs review",  count: counts.NEEDS },
              { value: "HIGH",     label: "High priority", count: counts.HIGH },
              { value: "LOW_CONF", label: "Limited data",  count: counts.LOW_CONF },
              { value: "ACCEPTED", label: "Accepted",      count: counts.ACCEPTED },
            ],
            value: filter,
            onChange: (v) => setFilter(v as Filter),
          }]}
        />

        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: COLS,
          padding: "10px 14px", background: "var(--paper-2)",
          borderBottom: "1px solid var(--rule-strong)",
          fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
          letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
          alignItems: "end",
        }}>
          <div>Item</div><div>Status</div>
          <div style={{ textAlign: "right" }}>Prior</div>
          <div style={{ textAlign: "right" }}>Current</div>
          <div style={{ textAlign: "right" }}>Delta</div>
          <div style={{ textAlign: "right" }}>Decision</div>
          <div/>
        </div>

        {sorted.map((r) => {
          const open    = openId === r.id;
          const dec     = decisions[r.id];
          const { kind, label: stLabel } = statusKind(r.status);

          return (
            <div key={r.id}>
              <div
                style={{
                  display: "grid", gridTemplateColumns: COLS,
                  padding: "10px 14px", borderBottom: "1px solid var(--rule)",
                  alignItems: "center",
                  background: open ? "var(--paper-2)" : dec === "accepted" ? "oklch(98% 0.015 155)" : dec ? "var(--paper-2)" : "transparent",
                  opacity: dec === "deferred" ? 0.65 : r.status === "auto" ? 0.85 : 1,
                  cursor: "pointer",
                }}
                onClick={() => setOpenId(open ? null : r.id)}
              >
                <div>
                  <div style={{ fontWeight: r.status === "auto" ? 400 : 500, fontSize: 13 }}>{r.item}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3 }}>{r.id}</div>
                </div>
                <div><StatusPill kind={kind}>{stLabel}</StatusPill></div>
                <div className="mono num" style={{ textAlign: "right", fontSize: 11.5, color: "var(--ink-3)" }}>{r.prior}</div>
                <div className="mono num" style={{ textAlign: "right", fontSize: 11.5 }}>{r.current}</div>
                <div className="mono num" style={{ textAlign: "right", fontSize: 12, color: deltaColor(r.deltaTone), fontWeight: 500 }}>{r.delta}</div>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", justifyContent: "flex-end" }}>
                  <DecisionControl status={dec} onSet={(st) => setDecision(r.id, st)}/>
                </div>
                <div style={{
                  color: "var(--ink-3)", fontSize: 9, textAlign: "right",
                  transform: open ? "rotate(90deg)" : "none",
                  transition: "transform 120ms ease",
                }}>▶</div>
              </div>

              {open && (
                <DrilldownShell>
                  <DrilldownColumn marker="①" title="Prior vs. current">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid var(--rule)", background: "var(--paper)" }}>
                      <div style={{ padding: "12px 14px", borderRight: "1px solid var(--rule)" }}>
                        <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 4 }}>Prior · FY 25-26</div>
                        <div className="num" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-3)" }}>{r.prior}</div>
                      </div>
                      <div style={{
                        padding: "12px 14px",
                        background: r.deltaTone === "neg" ? "var(--neg-tint)" : r.deltaTone === "pos" ? "var(--pos-tint)" : r.deltaTone === "warn" ? "var(--warn-tint)" : "var(--paper-2)",
                      }}>
                        <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 4 }}>Current · FY 26-27</div>
                        <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>{r.current}</div>
                        <div className="mono" style={{ fontSize: 11, color: deltaColor(r.deltaTone), marginTop: 4, fontWeight: 500 }}>{r.delta}</div>
                      </div>
                    </div>
                  </DrilldownColumn>

                  <DrilldownColumn marker="②" title="Why this matters">
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
                      {r.note ?? "No additional notes. Status auto-derived from import diff."}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <Link to={BUILD_LINK[sectionKey]} style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                        Open in Build Model →
                      </Link>
                    </div>
                  </DrilldownColumn>

                  <DrilldownColumn marker="③" title="Confidence & flags">
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <ConfReason ok={r.confidence.toLowerCase() === "high"} text={`Source confidence: ${r.confidence}`}/>
                      <ConfReason ok={r.status !== "unmapped"} text={r.status === "unmapped" ? "Unmapped — no current data found" : "Mapped from import"}/>
                      <ConfReason ok={r.status !== "low-confidence"} text={r.status === "low-confidence" ? "Low-confidence flag — verify manually" : "No low-confidence flag"}/>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
                      Auto-flag rules driven by mapping completeness and historical variance.
                    </div>
                  </DrilldownColumn>
                </DrilldownShell>
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-3)", fontSize: 12.5 }}>
            {filter === "NEEDS"
              ? "All rows in this section were auto-mapped. Switch to \"All rows\" to view the full audit trail."
              : "No rows match current filter."}
          </div>
        )}
      </div>

      {/* Detail link */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderTop: "none" }}>
        <details>
          <summary style={{
            padding: "14px 18px", cursor: "pointer", fontSize: 13, fontWeight: 500,
            display: "flex", justifyContent: "space-between", alignItems: "center", listStyle: "none",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Drill into Build Model → {meta.label}
              <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(full editing UI)</span>
            </span>
          </summary>
          <div style={{ padding: "14px 18px", borderTop: "1px solid var(--rule)", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
            {data.detail}
            <div style={{ marginTop: 12 }}>
              <Link to={BUILD_LINK[sectionKey]} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                Open in Build Model →
              </Link>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
