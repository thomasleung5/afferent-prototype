/* MappingReview — the per-batch review surface for the new import pipeline.
 *
 * Renders the candidates grouped by status (auto_accepted → needs_review →
 * unresolved → rejected) with accept/edit/reject per row. Header shows
 * batch-level status and the "Apply N" action.
 *
 * Validation issues come from the same batch and render as a collapsible
 * block above the candidate groups.
 *
 * No new visual chrome — reuses StatusPill / SourcePill / SectionLabel from
 * the existing UI kit. */

import { useState } from "react";
import { Icon, SectionLabel, SourcePill, StatusPill } from "@/components/ui";
import { useBuildState } from "@/lib/store";
import type {
  ImportBatch, MappingCandidate, MappingStatus, ValidationIssue,
  ValidationSeverity,
} from "@/lib/import/types";

const STATUS_PILL: Record<MappingStatus, { kind: "ok" | "review" | "info" | "bad" | "locked"; label: string }> = {
  auto_accepted:       { kind: "ok",     label: "Auto-accepted"  },
  accepted_after_edit: { kind: "ok",     label: "Accepted · edited" },
  needs_review:        { kind: "review", label: "Needs review"   },
  unresolved:          { kind: "review", label: "Unresolved"     },
  rejected:            { kind: "locked", label: "Rejected"       },
};

const SEVERITY_PILL: Record<ValidationSeverity, { kind: "ok" | "review" | "bad" | "info"; label: string }> = {
  INFO:   { kind: "info",   label: "Info"   },
  REVIEW: { kind: "review", label: "Review" },
  ERROR:  { kind: "bad",    label: "Error"  },
  READY:  { kind: "ok",     label: "Ready"  },
};

export function MappingReview() {
  const {
    currentBatch, decisions, decideMapping, applyCurrentBatch, setCurrentBatch,
  } = useBuildState();

  if (!currentBatch) return null;
  return <MappingReviewBody
    batch={currentBatch}
    decisions={decisions}
    onDecide={decideMapping}
    onApply={() => {
      const { applied } = applyCurrentBatch();
      if (applied > 0) setCurrentBatch(null);
    }}
    onDismiss={() => setCurrentBatch(null)}
  />;
}

interface BodyProps {
  batch: ImportBatch;
  decisions: Record<string, { status: MappingStatus; override?: Record<string, unknown> }>;
  onDecide: (id: string, status: MappingStatus, override?: Record<string, string | number | boolean | null>) => void;
  onApply: () => void;
  onDismiss: () => void;
}

function MappingReviewBody({ batch, decisions, onDecide, onApply, onDismiss }: BodyProps) {
  const total = batch.mappings.length;
  const accepted = countBy(batch.mappings, decisions, (s) => s === "auto_accepted" || s === "accepted_after_edit");
  const review = countBy(batch.mappings, decisions, (s) => s === "needs_review");
  const unresolved = countBy(batch.mappings, decisions, (s) => s === "unresolved");
  const rejected = countBy(batch.mappings, decisions, (s) => s === "rejected");

  const groups: { title: string; rows: MappingCandidate[]; tone: MappingStatus }[] = [
    { title: "Auto-accepted", tone: "auto_accepted" as MappingStatus, rows: filterByEffective(batch.mappings, decisions, (s) => s === "auto_accepted" || s === "accepted_after_edit") },
    { title: "Needs review",  tone: "needs_review"  as MappingStatus, rows: filterByEffective(batch.mappings, decisions, (s) => s === "needs_review") },
    { title: "Unresolved",    tone: "unresolved"    as MappingStatus, rows: filterByEffective(batch.mappings, decisions, (s) => s === "unresolved") },
    { title: "Rejected",      tone: "rejected"      as MappingStatus, rows: filterByEffective(batch.mappings, decisions, (s) => s === "rejected") },
  ].filter((g) => g.rows.length > 0);

  const sev = SEVERITY_PILL[batch.status];

  return (
    <div style={{
      background: "var(--paper)",
      border: "1px solid var(--rule)",
      borderLeft: `3px solid var(--${batch.status === "ERROR" ? "neg" : batch.status === "REVIEW" ? "warn" : "pos"})`,
      padding: 22,
    }}>
      <SectionLabel right={
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <StatusPill kind={sev.kind}>{sev.label}</StatusPill>
          <button
            onClick={onApply}
            disabled={accepted === 0}
            style={{
              fontSize: 12, fontWeight: 500,
              padding: "5px 12px",
              background: accepted > 0 ? "var(--accent)" : "var(--paper-2)",
              color: accepted > 0 ? "white" : "var(--ink-3)",
              border: `1px solid ${accepted > 0 ? "var(--accent)" : "var(--rule)"}`,
              cursor: accepted > 0 ? "pointer" : "not-allowed",
            }}
          >
            Apply {accepted}{accepted === 1 ? " mapping" : " mappings"}
          </button>
          <button
            onClick={onDismiss}
            style={{
              fontSize: 11.5, color: "var(--ink-3)",
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >Dismiss</button>
        </div>
      }>
        Import review · {batch.sourceFile}
      </SectionLabel>

      <div style={{
        marginTop: 6, marginBottom: 14,
        display: "flex", gap: 14, flexWrap: "wrap",
        fontSize: 11.5, color: "var(--ink-3)",
      }}>
        <span><b style={{ color: "var(--ink-2)" }}>{total}</b> candidates</span>
        <span><b style={{ color: "var(--pos)" }}>{accepted}</b> accepted</span>
        <span><b style={{ color: "var(--warn)" }}>{review}</b> review</span>
        <span><b style={{ color: "var(--warn)" }}>{unresolved}</b> unresolved</span>
        {rejected > 0 && <span><b style={{ color: "var(--ink-3)" }}>{rejected}</b> rejected</span>}
      </div>

      {batch.issues.length > 0 && <IssuesBlock issues={batch.issues}/>}

      {groups.map((g) => (
        <GroupBlock
          key={g.tone}
          title={g.title}
          tone={g.tone}
          rows={g.rows}
          decisions={decisions}
          onDecide={onDecide}
        />
      ))}
    </div>
  );
}

function countBy(
  ms: MappingCandidate[],
  decisions: Record<string, { status: MappingStatus }>,
  pred: (s: MappingStatus) => boolean,
): number {
  return filterByEffective(ms, decisions, pred).length;
}

function filterByEffective(
  ms: MappingCandidate[],
  decisions: Record<string, { status: MappingStatus }>,
  pred: (s: MappingStatus) => boolean,
): MappingCandidate[] {
  return ms.filter((m) => pred(decisions[m.id]?.status ?? m.status));
}

// ============================================================================
// Validation issues block
// ============================================================================

function IssuesBlock({ issues }: { issues: ValidationIssue[] }) {
  const [open, setOpen] = useState(true);
  const counts = {
    ERROR:  issues.filter((i) => i.severity === "ERROR").length,
    REVIEW: issues.filter((i) => i.severity === "REVIEW").length,
    INFO:   issues.filter((i) => i.severity === "INFO").length,
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", textAlign: "left",
          padding: "8px 12px",
          background: "var(--paper-2)", border: "1px solid var(--rule)",
          cursor: "pointer", fontFamily: "var(--ff-ui)",
        }}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={11}/>
        <span className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Validation</span>
        <span style={{ display: "inline-flex", gap: 6, marginLeft: 6 }}>
          {counts.ERROR > 0  && <StatusPill kind="bad">{counts.ERROR} error</StatusPill>}
          {counts.REVIEW > 0 && <StatusPill kind="review">{counts.REVIEW} review</StatusPill>}
          {counts.INFO > 0   && <StatusPill kind="info">{counts.INFO} info</StatusPill>}
        </span>
      </button>
      {open && (
        <div style={{
          background: "var(--paper-2)", borderTop: "none",
          border: "1px solid var(--rule)", borderTopWidth: 0,
          maxHeight: 240, overflow: "auto",
        }}>
          {issues.slice(0, 50).map((i, idx) => (
            <div key={idx} style={{
              padding: "7px 12px",
              borderBottom: idx < issues.length - 1 ? "1px dashed var(--rule)" : "none",
              display: "flex", gap: 10, alignItems: "baseline", fontSize: 12,
            }}>
              <span className="mono" style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em",
                padding: "2px 6px",
                color: `var(--${i.severity === "ERROR" ? "neg" : i.severity === "REVIEW" ? "warn" : "ink-3"})`,
                background: `var(--${i.severity === "ERROR" ? "neg-tint" : i.severity === "REVIEW" ? "warn-tint" : "paper"})`,
                border: `1px solid var(--${i.severity === "ERROR" ? "neg" : i.severity === "REVIEW" ? "warn" : "rule"})`,
                textTransform: "uppercase", whiteSpace: "nowrap",
              }}>{i.severity}</span>
              <span style={{ color: "var(--ink-3)", fontFamily: "var(--ff-mono)", fontSize: 11 }}>
                {i.code}
              </span>
              <span style={{ color: "var(--ink-2)", flex: 1 }}>
                {i.message}
              </span>
            </div>
          ))}
          {issues.length > 50 && (
            <div style={{ padding: "7px 12px", fontSize: 11.5, color: "var(--ink-3)" }}>
              + {issues.length - 50} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Candidate group block
// ============================================================================

function GroupBlock({
  title, tone, rows, decisions, onDecide,
}: {
  title: string;
  tone: MappingStatus;
  rows: MappingCandidate[];
  decisions: Record<string, { status: MappingStatus; override?: Record<string, unknown> }>;
  onDecide: (id: string, status: MappingStatus, override?: Record<string, string | number | boolean | null>) => void;
}) {
  const pill = STATUS_PILL[tone];
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 6,
      }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>{title}</div>
        <StatusPill kind={pill.kind}>{rows.length}</StatusPill>
      </div>

      <div style={{
        background: "var(--paper-2)", border: "1px solid var(--rule)",
      }}>
        {rows.map((m, i) => (
          <CandidateRow
            key={m.id}
            candidate={m}
            currentStatus={decisions[m.id]?.status ?? m.status}
            isLast={i === rows.length - 1}
            onDecide={onDecide}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateRow({
  candidate, currentStatus, isLast, onDecide,
}: {
  candidate: MappingCandidate;
  currentStatus: MappingStatus;
  isLast: boolean;
  onDecide: (id: string, status: MappingStatus, override?: Record<string, string | number | boolean | null>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const confPct = (candidate.confidence * 100).toFixed(0);
  const confColor =
    candidate.confidence >= 0.85 ? "var(--pos)" :
    candidate.confidence >= 0.5  ? "var(--warn)" :
                                   "var(--neg)";

  const writable = candidate.proposedTargetTable != null
    && currentStatus !== "rejected";

  const entries = Object.entries(candidate.proposedEntity).filter(([, v]) => v != null && v !== "");

  return (
    <div style={{
      padding: "11px 14px",
      borderBottom: isLast ? "none" : "1px solid var(--rule)",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span className="mono" style={{
              padding: "2px 6px", fontSize: 9.5, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: confColor,
              border: `1px solid ${confColor}`,
              background: "var(--paper)",
            }}>
              {confPct}%
            </span>
            {candidate.proposedTargetTable && (
              <span className="mono" style={{
                fontSize: 10, color: "var(--ink-3)",
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}>→ {candidate.proposedTargetTable}</span>
            )}
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
              {candidate.sourceLabel}
            </span>
            {candidate.proposedTargetLabel !== candidate.sourceLabel && (
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                → {candidate.proposedTargetLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            {candidate.mappingReason}
          </div>
          {candidate.requiredMissingFields.length > 0 && (
            <div className="mono" style={{
              marginTop: 3, fontSize: 10.5, color: "var(--warn)",
              letterSpacing: "0.04em",
            }}>
              missing: {candidate.requiredMissingFields.join(", ")}
            </div>
          )}
        </div>
        <div style={{
          display: "flex", flexDirection: "column", gap: 4,
          alignItems: "flex-end", whiteSpace: "nowrap",
        }}>
          {!editing && (
            <>
              {writable && currentStatus !== "auto_accepted" && currentStatus !== "accepted_after_edit" && (
                <RowBtn tone="accent" onClick={() => onDecide(candidate.id, "auto_accepted")}>
                  <Icon name="check" size={11}/> Accept
                </RowBtn>
              )}
              {writable && (
                <RowBtn onClick={() => setEditing(true)}>Edit</RowBtn>
              )}
              {currentStatus !== "rejected" && (
                <RowBtn tone="ghost" onClick={() => onDecide(candidate.id, "rejected")}>Reject</RowBtn>
              )}
              {currentStatus === "rejected" && (
                <RowBtn onClick={() => onDecide(candidate.id, "needs_review")}>Undo reject</RowBtn>
              )}
            </>
          )}
          {editing && (
            <>
              <RowBtn tone="accent" onClick={() => {
                const overrideTyped: Record<string, string | number | boolean | null> = {};
                for (const [k, v] of Object.entries(draft)) {
                  const num = Number(v);
                  overrideTyped[k] = v !== "" && Number.isFinite(num) && !/[a-z]/i.test(v) ? num : v;
                }
                onDecide(candidate.id, "accepted_after_edit", overrideTyped);
                setEditing(false);
              }}>
                <Icon name="check" size={11}/> Save &amp; accept
              </RowBtn>
              <RowBtn tone="ghost" onClick={() => { setEditing(false); setDraft({}); }}>
                Cancel
              </RowBtn>
            </>
          )}
        </div>
      </div>

      {editing && entries.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: "1px dashed var(--rule)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}>
          {entries.map(([k, v]) => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="mono" style={{
                fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>{k}</span>
              <input
                value={draft[k] ?? String(v ?? "")}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                style={{
                  padding: "5px 8px",
                  fontSize: 12.5, fontFamily: "var(--ff-ui)",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  color: "var(--ink)",
                }}
              />
            </label>
          ))}
        </div>
      )}

      <div style={{
        marginTop: 6, fontSize: 10.5, color: "var(--ink-3)",
        fontFamily: "var(--ff-mono)", letterSpacing: "0.04em",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <SourcePill tone="default">SRC</SourcePill>
        <span>{formatLineage(candidate)}</span>
      </div>
    </div>
  );
}

function formatLineage(m: MappingCandidate): string {
  // We don't carry source on the candidate directly (it's on the extracted
  // row). The mappingReason already names the source matched against, so
  // this is a compact hint.
  return `id ${m.id} · ${m.requiredMissingFields.length === 0 ? "complete" : "partial"}`;
}

function RowBtn({
  children, onClick, tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "accent" | "ghost";
}) {
  const style = (() => {
    if (tone === "accent") return {
      color: "white", background: "var(--accent)",
      border: "1px solid var(--accent)",
    };
    if (tone === "ghost") return {
      color: "var(--ink-3)", background: "transparent",
      border: "1px solid var(--rule)",
    };
    return {
      color: "var(--ink)", background: "var(--paper)",
      border: "1px solid var(--rule-strong)",
    };
  })();
  return (
    <button
      onClick={onClick}
      style={{
        ...style,
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 9px",
        fontSize: 11.5, fontWeight: 500, fontFamily: "var(--ff-ui)",
        cursor: "pointer", whiteSpace: "nowrap",
        minWidth: 86, justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
