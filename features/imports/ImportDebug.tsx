/* Collapsible debug panel for an active ImportBatch. Surfaces every stage
 * of the pipeline so the user can see why a mapping landed where it did:
 *
 *   - classification result (documentType, jurisdiction, FY, sections, reason)
 *   - extracted document tree (sections + row types + counts)
 *   - validation counts by severity
 *
 * Read-only. No actions live here. */

import { useState } from "react";
import { Icon, StatusPill } from "@/components/ui";
import { useBuildState } from "@/lib/store";
import type { ImportBatch, ExtractedRowType } from "@/lib/import/types";

export function ImportDebug() {
  const { currentBatch } = useBuildState();
  const [open, setOpen] = useState(false);
  if (!currentBatch) return null;

  const c = currentBatch.classification;
  const sectionCount = currentBatch.extracted.sections.length;
  const rowCount =
    currentBatch.extracted.sections.reduce((a, s) => a + s.rows.length, 0) +
    currentBatch.extracted.unsectioned.length;
  const counts = currentBatch.issues.reduce(
    (a, i) => ({ ...a, [i.severity]: (a[i.severity] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <div style={{
      background: "var(--paper)",
      border: "1px dashed var(--rule-strong)",
      padding: 0,
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", textAlign: "left",
          padding: "11px 16px",
          background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "var(--ff-ui)",
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={11}/>
        <span className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Pipeline debug</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {c.documentType} · {sectionCount} section{sectionCount === 1 ? "" : "s"} · {rowCount} row{rowCount === 1 ? "" : "s"} · {currentBatch.mappings.length} mappings
        </span>
        <div style={{ flex: 1 }}/>
        <StatusPill kind={
          currentBatch.status === "ERROR" ? "bad" :
          currentBatch.status === "REVIEW" ? "review" :
          currentBatch.status === "READY" ? "ok" : "info"
        }>
          {currentBatch.status}
        </StatusPill>
      </button>

      {open && (
        <div style={{
          padding: "0 16px 16px",
          borderTop: "1px dashed var(--rule)",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <Block title="Classification">
            <FieldRow label="documentType" value={c.documentType}/>
            <FieldRow label="confidence" value={`${(c.confidence * 100).toFixed(0)}%`}/>
            {c.jurisdiction && <FieldRow label="jurisdiction" value={c.jurisdiction}/>}
            {c.fiscalYear   && <FieldRow label="fiscalYear" value={c.fiscalYear}/>}
            {c.department   && <FieldRow label="department" value={c.department}/>}
            <FieldRow
              label="detectedSections"
              value={c.detectedSections.length === 0
                ? "—"
                : c.detectedSections.slice(0, 6).join(" · ") + (c.detectedSections.length > 6 ? ` · +${c.detectedSections.length - 6} more` : "")}
            />
            <FieldRow label="reason" value={c.reason}/>
          </Block>

          <Block title="Extracted document">
            {currentBatch.extracted.sections.length === 0 && currentBatch.extracted.unsectioned.length === 0 && (
              <FieldRow label="(empty)" value="No rows extracted."/>
            )}
            {currentBatch.extracted.sections.map((s) => (
              <div key={s.label} style={{ marginTop: 6 }}>
                <div className="mono" style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                  color: "var(--ink-2)", textTransform: "uppercase",
                }}>
                  {s.label}
                  <span style={{ color: "var(--ink-3)", marginLeft: 8, letterSpacing: 0, fontWeight: 400, textTransform: "none" }}>
                    {s.rows.length} row{s.rows.length === 1 ? "" : "s"}
                    {s.subtotal ? ` · subtotal $${s.subtotal.amount.toLocaleString()}` : ""}
                  </span>
                </div>
                <RowTypeBreakdown rows={s.rows}/>
              </div>
            ))}
            {currentBatch.extracted.unsectioned.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div className="mono" style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                  color: "var(--ink-2)", textTransform: "uppercase",
                }}>(no section)
                  <span style={{ color: "var(--ink-3)", marginLeft: 8, letterSpacing: 0, fontWeight: 400, textTransform: "none" }}>
                    {currentBatch.extracted.unsectioned.length} row{currentBatch.extracted.unsectioned.length === 1 ? "" : "s"}
                  </span>
                </div>
                <RowTypeBreakdown rows={currentBatch.extracted.unsectioned}/>
              </div>
            )}
            {currentBatch.extracted.parseWarnings.length > 0 && (
              <FieldRow
                label="parseWarnings"
                value={currentBatch.extracted.parseWarnings.slice(0, 3).join(" · ") + (currentBatch.extracted.parseWarnings.length > 3 ? ` · +${currentBatch.extracted.parseWarnings.length - 3} more` : "")}
              />
            )}
          </Block>

          <Block title="Validation">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["ERROR", "REVIEW", "READY", "INFO"] as const).map((sev) => counts[sev] ? (
                <StatusPill key={sev} kind={
                  sev === "ERROR" ? "bad" : sev === "REVIEW" ? "review" : sev === "READY" ? "ok" : "info"
                }>{sev} · {counts[sev]}</StatusPill>
              ) : null)}
              {currentBatch.issues.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>No validation issues.</span>
              )}
            </div>
          </Block>
        </div>
      )}
    </div>
  );
}

function RowTypeBreakdown({ rows }: { rows: { rowType?: ExtractedRowType }[] }) {
  const byType: Record<string, number> = {};
  for (const r of rows) {
    const t = r.rowType ?? "unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  return (
    <div className="mono" style={{
      fontSize: 11, color: "var(--ink-3)",
      letterSpacing: "0.04em", marginTop: 3,
    }}>
      {Object.entries(byType).map(([k, v]) => `${k}:${v}`).join("  ·  ")}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
        marginBottom: 4,
      }}>{title}</div>
      <div style={{
        background: "var(--paper-2)", border: "1px solid var(--rule)",
        padding: "8px 12px",
        fontSize: 12, lineHeight: 1.5,
      }}>{children}</div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "140px 1fr",
      gap: 10,
      padding: "3px 0",
      fontSize: 12, alignItems: "baseline",
    }}>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ color: "var(--ink-2)", overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

/** Re-imported here to avoid circular import concerns from the types file. */
function _typecheckUnused(b: ImportBatch): ImportBatch { return b; }
void _typecheckUnused;
