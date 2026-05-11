
import { useState } from "react";
import { Icon, SectionLabel, SourcePill } from "@/components/ui";
import { useBuildState, type Domain } from "@/lib/store";
import type { AiSuggestion } from "@/lib/ai/types";

const REASON_LABEL: Record<string, string> = {
  "schema-mismatch":        "No matching service / record",
  "missing-required-field": "Missing required field",
  "ambiguous-dept":         "Couldn't resolve department",
  "blank":                  "Blank or unreadable row",
};

interface Props {
  domain: Domain;
}

/** Inline review card. Two sections, both backed by the BuildContext:
 *   (1) AI suggestions awaiting approval — accept/edit/reject per row
 *   (2) Unresolved unmapped rows — dismiss per row
 *  Empty + idle = the card is hidden entirely. */
export function ImportReview({ domain }: Props) {
  const {
    pendingReview, aiSuggestions, aiStatus,
    dismissUnmapped, clearReview,
    acceptAiSuggestion, rejectAiSuggestion,
  } = useBuildState();
  const unmapped = pendingReview[domain];
  const suggestions = aiSuggestions[domain];
  const status = aiStatus[domain];

  if (unmapped.length === 0 && suggestions.length === 0 && !status.running && !status.message) {
    return null;
  }

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--warn)",
      borderLeft: "3px solid var(--warn)",
      padding: 22,
    }}>
      <SectionLabel
        right={
          unmapped.length > 0 ? (
            <button
              onClick={() => clearReview(domain)}
              style={{
                fontSize: 11.5, color: "var(--ink-3)",
                background: "transparent", border: "none", cursor: "pointer",
              }}
            >Dismiss all</button>
          ) : null
        }
      >
        Review queue {totalCount(suggestions.length, unmapped.length)}
      </SectionLabel>

      {status.running && (
        <div style={{
          padding: "8px 14px", marginBottom: 12,
          background: "var(--accent-tint)", border: "1px solid var(--accent)",
          fontSize: 12, color: "var(--ink-2)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Spinner/>
          <span>{status.message ?? "Asking Claude…"}</span>
        </div>
      )}

      {!status.running && status.message && (
        <div style={{
          padding: "8px 14px", marginBottom: 12,
          background: "var(--paper-2)", border: "1px dashed var(--rule)",
          fontSize: 11.5, color: "var(--ink-3)",
        }}>
          {status.message}
        </div>
      )}

      {suggestions.length > 0 && (
        <SuggestionsSection
          suggestions={suggestions}
          onAccept={(s, override) => acceptAiSuggestion(domain, s.id, override)}
          onReject={(s) => rejectAiSuggestion(domain, s.id)}
        />
      )}

      {unmapped.length > 0 && (
        <UnmappedSection
          rows={unmapped}
          onDismiss={(i) => dismissUnmapped(domain, i)}
        />
      )}

      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--rule)",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 11.5, color: "var(--ink-3)",
      }}>
        <SourcePill tone="default">REVIEW</SourcePill>
        <span>
          Suggestions come from Claude after the deterministic extractor finishes.
          Accept to merge into the model · Edit to fix a field first · Reject to discard.
        </span>
      </div>
    </div>
  );
}

function totalCount(s: number, u: number): string {
  const parts: string[] = [];
  if (s > 0) parts.push(`${s} AI suggestion${s === 1 ? "" : "s"}`);
  if (u > 0) parts.push(`${u} unmapped`);
  return parts.length ? `· ${parts.join(" · ")}` : "";
}

// ============================================================================
// AI suggestions section
// ============================================================================

const CONF_TONE: Record<AiSuggestion["confidence"], { fg: string; bg: string; bd: string; label: string }> = {
  high: { fg: "var(--pos)",  bg: "var(--pos-tint)",  bd: "var(--pos)",  label: "HIGH"  },
  med:  { fg: "var(--ink-2)",bg: "var(--paper-2)",   bd: "var(--rule-strong)", label: "MED" },
  low:  { fg: "var(--warn)", bg: "var(--warn-tint)", bd: "var(--warn)", label: "LOW"   },
};

function SuggestionsSection({
  suggestions, onAccept, onReject,
}: {
  suggestions: AiSuggestion[];
  onAccept: (s: AiSuggestion, override?: Partial<AiSuggestion["entity"]>) => void;
  onReject: (s: AiSuggestion) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
        marginBottom: 8,
      }}>AI suggestions · {suggestions.length}</div>

      <div style={{
        background: "var(--paper-2)", border: "1px solid var(--rule)",
      }}>
        {suggestions.map((s, i) => (
          <SuggestionRow
            key={s.id}
            suggestion={s}
            isLast={i === suggestions.length - 1}
            onAccept={(override) => onAccept(s, override)}
            onReject={() => onReject(s)}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionRow({
  suggestion, isLast, onAccept, onReject,
}: {
  suggestion: AiSuggestion;
  isLast: boolean;
  onAccept: (override?: Partial<AiSuggestion["entity"]>) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<AiSuggestion["entity"]>>({});
  const tone = CONF_TONE[suggestion.confidence];

  const entries = Object.entries(suggestion.entity).filter(
    ([, v]) => v != null && v !== "",
  );
  const summary = entries
    .filter(([k]) => !/title|name|line|pool/i.test(k))
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");

  return (
    <div style={{
      padding: "12px 14px",
      borderBottom: isLast ? "none" : "1px solid var(--rule)",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span className="mono" style={{
              display: "inline-block",
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em",
              padding: "2px 6px",
              color: tone.fg, background: tone.bg,
              border: `1px solid ${tone.bd}`,
              textTransform: "uppercase",
            }}>AI · {tone.label}</span>
            <span style={{
              fontSize: 10.5, fontFamily: "var(--ff-mono)", color: "var(--ink-3)",
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}>{suggestion.domain}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
              {suggestion.label}
            </span>
          </div>
          {summary && (
            <div className="mono" style={{
              fontSize: 11, color: "var(--ink-3)", marginBottom: 6,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{summary}</div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
            {suggestion.reasoning}
          </div>
          <div style={{
            marginTop: 4, fontSize: 10.5, color: "var(--ink-3)",
            fontFamily: "var(--ff-mono)",
          }}>
            {formatLineage(suggestion)}
          </div>
        </div>

        <div style={{
          display: "flex", flexDirection: "column", gap: 4,
          alignItems: "flex-end", whiteSpace: "nowrap",
        }}>
          {!editing && (
            <>
              <RowBtn tone="accent" onClick={() => onAccept(draft)}>
                <Icon name="check" size={11}/> Accept
              </RowBtn>
              <RowBtn onClick={() => setEditing(true)}>Edit</RowBtn>
              <RowBtn tone="ghost" onClick={onReject}>Reject</RowBtn>
            </>
          )}
          {editing && (
            <>
              <RowBtn tone="accent" onClick={() => { onAccept(draft); setEditing(false); }}>
                <Icon name="check" size={11}/> Save &amp; accept
              </RowBtn>
              <RowBtn tone="ghost" onClick={() => { setEditing(false); setDraft({}); }}>
                Cancel
              </RowBtn>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: "1px dashed var(--rule)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}>
          {entries.map(([k, v]) => (
            <Field
              key={k}
              label={k}
              value={String((draft[k] ?? v) ?? "")}
              onChange={(next) => setDraft((d) => ({ ...d, [k]: next }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatLineage(s: AiSuggestion): string {
  const l = s.lineage;
  if (l.sheet) return `${l.file} · ${l.sheet} · row ${l.row}`;
  if (l.page != null) return `${l.file} · p.${l.page} · line ${l.row}`;
  return l.file;
}

function Field({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string | number) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="mono" style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</span>
      <input
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const num = Number(raw);
          onChange(raw !== "" && Number.isFinite(num) && !/[a-z]/i.test(raw) ? num : raw);
        }}
        style={{
          padding: "5px 8px",
          fontSize: 12.5, fontFamily: "var(--ff-ui)",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          color: "var(--ink)",
        }}
      />
    </label>
  );
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

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10,
      borderRadius: "50%",
      border: "1.5px solid var(--accent)",
      borderTopColor: "transparent",
      animation: "afspin 0.7s linear infinite",
    }}>
      <style>{`@keyframes afspin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

// ============================================================================
// Unmapped section (regex-extractor leftovers, still in the queue)
// ============================================================================

function UnmappedSection({
  rows, onDismiss,
}: {
  rows: ReturnType<typeof useBuildState>["pendingReview"][Domain];
  onDismiss: (i: number) => void;
}) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
        marginBottom: 8,
      }}>Unresolved · {rows.length}</div>

      <div style={{
        background: "var(--paper-2)", border: "1px solid var(--rule)",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "180px minmax(220px, 1fr) 140px 40px",
          gap: 14, padding: "8px 14px",
          borderBottom: "1px solid var(--rule-strong)",
          background: "var(--paper)",
          fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 600,
          letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase",
        }}>
          <div>Reason</div>
          <div>Raw row</div>
          <div>Source</div>
          <div/>
        </div>
        {rows.slice(0, 12).map((r, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "180px minmax(220px, 1fr) 140px 40px",
            gap: 14, padding: "9px 14px",
            borderBottom: i < Math.min(rows.length, 12) - 1 ? "1px solid var(--rule)" : "none",
            alignItems: "center",
            fontSize: 12,
          }}>
            <span style={{ color: "var(--ink-2)" }}>
              {REASON_LABEL[r.reason] ?? r.reason}
            </span>
            <span className="mono" style={{
              color: "var(--ink-3)", fontSize: 11.5,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }} title={r.raw.join(" · ")}>
              {r.raw
                .filter((c) => c != null && c !== "")
                .slice(0, 6)
                .map((c) => String(c).slice(0, 24))
                .join(" · ")}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {r.lineage.sheet
                ? `${r.lineage.sheet} · row ${r.lineage.row}`
                : r.lineage.page != null
                  ? `p.${r.lineage.page} · line ${r.lineage.row}`
                  : `row ${r.lineage.row}`}
            </span>
            <button
              onClick={() => onDismiss(i)}
              aria-label="Dismiss row"
              title="Dismiss"
              style={{
                width: 22, height: 22,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                color: "var(--ink-3)", background: "transparent",
                border: "1px solid var(--rule)", cursor: "pointer",
              }}
            >
              <Icon name="close" size={10}/>
            </button>
          </div>
        ))}
        {rows.length > 12 && (
          <div style={{
            padding: "8px 14px", fontSize: 11.5, color: "var(--ink-3)",
            borderTop: "1px solid var(--rule)",
          }}>
            + {rows.length - 12} more unmapped rows
          </div>
        )}
      </div>
    </div>
  );
}
