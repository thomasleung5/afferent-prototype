/* The global Import Manager drawer body. Drop any file → classifier picks
 * the destination tab → existing extractor + AI assist pass run as if the
 * file had been dropped on that tab. */

import { useRef, useState } from "react";
import { Drawer, StatusPill, Icon } from "@/components/ui";
import { useBuildState } from "@/lib/store";
import type { Domain } from "@/lib/store";
import type { DocumentType } from "@/lib/import/types";
import { useImportQueue, type QueueItem } from "./useImportQueue";

const DOMAIN_LABEL: Record<Domain, string> = {
  positions: "Direct Labor",
  operating: "Operating",
  services:  "Services",
  fees:      "Fee Schedule",
  workload:  "Workload",
  cap:       "Cost Allocation",
};

const DOCTYPE_LABEL: Record<Exclude<DocumentType, "unknown">, string> = {
  fee_schedule:           "Fee Schedule",
  prior_fee_study:        "Prior Fee Study",
  budget_book:            "Budget Book",
  salary_roster:          "Salary Roster",
  operating_budget:       "Operating Budget",
  cost_allocation_plan:   "Cost Allocation Plan",
  workload_export:        "Workload Export",
  benchmark_fee_schedule: "Benchmark Fee Schedule",
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportManager({ open, onClose }: Props) {
  const queue = useImportQueue();
  const { imports } = useBuildState();
  const recent = [...imports].reverse().slice(0, 6);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Import manager"
      title="Imports"
      subtitle="Drop any file — the model figures out where it goes."
      width={580}
    >
      <DropArea onFiles={(fs) => fs.forEach((f) => void queue.addFile(f))}/>

      {queue.items.length > 0 && (
        <Section title={`This session · ${queue.items.length}`} right={
          <button
            onClick={queue.clear}
            style={{
              fontSize: 11.5, color: "var(--ink-3)",
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >Clear</button>
        }>
          <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)" }}>
            {queue.items.map((it, i) => (
              <QueueRow
                key={it.id}
                item={it}
                isLast={i === queue.items.length - 1}
                onPickDomain={(d) => void queue.pickDomain(it.id, d)}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title={`Recent imports · ${imports.length}`}>
        {recent.length === 0 ? (
          <Empty text="No imports yet this session. Drop a file above."/>
        ) : (
          <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)" }}>
            {recent.map((imp, i) => (
              <div key={imp.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 110px 70px 70px",
                gap: 12, padding: "9px 14px",
                borderBottom: i < recent.length - 1 ? "1px solid var(--rule)" : "none",
                alignItems: "baseline", fontSize: 12,
              }}>
                <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={imp.result.fileName}>
                  {imp.result.fileName}
                </span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                  {DOMAIN_LABEL[imp.domain]}
                </span>
                <span className="num" style={{ textAlign: "right", color: "var(--pos)" }}>
                  {imp.result.mapped}
                </span>
                <span className="num" style={{
                  textAlign: "right",
                  color: imp.result.unmapped + imp.result.lowConfidence > 0 ? "var(--warn)" : "var(--ink-3)",
                }}>
                  {imp.result.unmapped + imp.result.lowConfidence > 0
                    ? imp.result.unmapped + imp.result.lowConfidence
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Drawer>
  );
}

// ============================================================================
// Drop area
// ============================================================================

function DropArea({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
      style={{
        border: `1.5px dashed ${over ? "var(--accent)" : "var(--rule-strong)"}`,
        background: over ? "var(--accent-tint)" : "var(--paper-2)",
        padding: "22px 18px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        marginBottom: 18,
      }}
    >
      <input
        type="file"
        ref={inputRef}
        multiple
        accept=".xlsx,.csv,.pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
      <Icon name="download" size={16}/>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
        Drop a file — or{" "}
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            color: "var(--accent)", background: "transparent", border: "none",
            fontWeight: 500, cursor: "pointer", fontSize: "inherit", padding: 0,
            textDecoration: "underline", fontFamily: "inherit",
          }}
        >browse</button>
      </div>
      <div className="mono" style={{
        fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em",
      }}>
        xlsx · csv · pdf — auto-classified into Services, Direct Labor, Operating, CAP, Workload, Fees
      </div>
    </div>
  );
}

// ============================================================================
// Queue row — one per file in the session
// ============================================================================

const STAGE_PILL: Record<QueueItem["stage"], { kind: Parameters<typeof StatusPill>[0]["kind"]; label: string }> = {
  parsing:       { kind: "info",   label: "Parsing"     },
  classifying:   { kind: "info",   label: "Classifying" },
  "needs-domain":{ kind: "review", label: "Pick domain" },
  extracting:    { kind: "info",   label: "Extracting"  },
  merging:       { kind: "info",   label: "Merging"     },
  done:          { kind: "ok",     label: "Imported"    },
  error:         { kind: "bad",    label: "Error"       },
};

function QueueRow({
  item, isLast, onPickDomain,
}: {
  item: QueueItem;
  isLast: boolean;
  onPickDomain: (d: DocumentType) => void;
}) {
  const pill = STAGE_PILL[item.stage];
  const docTypeLabel = item.documentType && item.documentType !== "unknown"
    ? DOCTYPE_LABEL[item.documentType]
    : null;
  const auto = item.batch
    ? item.batch.mappings.filter((m) => m.status === "auto_accepted").length
    : 0;
  const review = item.batch
    ? item.batch.mappings.filter((m) => m.status !== "auto_accepted").length
    : 0;

  return (
    <div style={{
      padding: "10px 14px",
      borderBottom: isLast ? "none" : "1px solid var(--rule)",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "baseline", gap: 12, marginBottom: 4,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 500, color: "var(--ink)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={item.fileName}>
            {item.fileName}
          </div>
          {docTypeLabel && (
            <div className="mono" style={{
              marginTop: 3, fontSize: 10.5, color: "var(--ink-3)",
              letterSpacing: "0.04em",
            }}>
              {docTypeLabel}
              {item.classifyReason ? ` · ${item.classifyReason}` : ""}
            </div>
          )}
          {!docTypeLabel && item.classifyReason && (
            <div className="mono" style={{
              marginTop: 3, fontSize: 10.5, color: "var(--ink-3)",
              letterSpacing: "0.04em",
            }}>
              {item.classifyReason}
            </div>
          )}
          {item.error && (
            <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--neg)" }}>
              {item.error}
            </div>
          )}
          {item.batch && (
            <div className="mono" style={{
              marginTop: 3, fontSize: 10.5, color: "var(--ink-3)",
              letterSpacing: "0.04em",
            }}>
              {auto} auto · {review} for review
            </div>
          )}
        </div>
        <StatusPill kind={pill.kind}>{pill.label}</StatusPill>
      </div>

      {item.stage === "needs-domain" && (
        <div style={{
          marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6,
        }}>
          {(Object.entries(DOCTYPE_LABEL) as [DocumentType, string][]).map(([d, label]) => (
            <button
              key={d}
              onClick={() => onPickDomain(d)}
              style={{
                fontSize: 11, fontWeight: 500,
                padding: "4px 10px",
                background: "var(--paper)",
                border: "1px solid var(--rule-strong)",
                color: "var(--ink-2)", cursor: "pointer",
              }}
            >{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Layout helpers
// ============================================================================

function Section({
  title, right, children,
}: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 8,
      }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      padding: "16px 14px", fontSize: 12, color: "var(--ink-3)",
      background: "var(--paper-2)", border: "1px dashed var(--rule)",
    }}>{text}</div>
  );
}
