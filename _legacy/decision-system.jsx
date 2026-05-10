// Decision-system primitives — hierarchy, confidence, severity, scenarios.
// These are the visual language of the "enterprise financial decision engine":
// importance tiers, confidence scoring, severity rails, scenario scaffolding.

const { useState: uSDS, useMemo: uMDS } = React;

// =============================================================================
// IMPORTANCE TIER — global hierarchy of sections.
// HIGH:   Cost of Service, Fee Schedule, Review Changes (decision outputs)
// MEDIUM: Salary, Workload, CAP                          (model inputs)
// LOW:    Services                                       (foundation/metadata)
// =============================================================================
const IMPORTANCE = {
  high:    { label: "Decision",        bg: "var(--paper-2)", fg: "var(--ink)", bd: "var(--rule-strong)", dot: "var(--ink)" },
  analyze: { label: "Calculation",     bg: "var(--pos-tint)",  fg: "var(--pos)",  bd: "var(--rule-strong)", dot: "var(--pos)" },
  output:  { label: "Policy decision", bg: "var(--warn-tint)", fg: "var(--warn)", bd: "var(--rule-strong)", dot: "var(--warn)" },
  policy:  { label: "Policy decision", bg: "var(--paper-2)",   fg: "var(--ink-2)", bd: "var(--rule-strong)", dot: "var(--ink-2)" },
  medium:  { label: "Input",           bg: "var(--paper-2)",       fg: "var(--ink-2)",        bd: "var(--rule-strong)",  dot: "var(--ink-3)" },
  low:     { label: "Foundation",      bg: "transparent",          fg: "var(--ink-3)",        bd: "var(--rule)",         dot: "var(--ink-4)" },
};

const SECTION_TIER = {
  "cost-of-service": "high",
  "fee-schedule":    "high",
  "review-changes":  "high",
  "salary":          "medium",
  "workload":        "medium",
  "cap":             "medium",
  "operating":       "medium",
  "services":        "low",
};

function tierFor(sectionKey) {
  return SECTION_TIER[sectionKey] || "medium";
}

// Visual tier badge — small, mono, used in section cards and overview.
function TierBadge({ tier }) {
  const t = IMPORTANCE[tier] || IMPORTANCE.medium;
  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
      padding: "2px 7px", textTransform: "uppercase",
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
    }}>
      <span style={{ width: 5, height: 5, background: t.dot }}/>
      {t.label}
    </span>
  );
}

// =============================================================================
// CONFIDENCE — 0-100 score with discrete bands. Used per-row and per-section.
// HIGH: 85-100   MEDIUM: 60-84   LOW: <60
// =============================================================================
function confidenceBand(score) {
  if (score == null) return null;
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function ConfidenceBar({ score, label, width = 80, height = 4 }) {
  if (score == null) {
    return <span style={{ fontSize: 11, color: "var(--ink-4)" }}>—</span>;
  }
  const band = confidenceBand(score);
  const color = band === "high" ? "var(--pos)" : band === "medium" ? "var(--warn)" : "var(--neg)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <div style={{
        position: "relative", width, height,
        background: "var(--paper-3)", boxShadow: "inset 0 0 0 1px var(--rule)",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${score}%`, background: color,
        }}/>
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", fontWeight: 500 }}>
        {label || `${score}`}
      </span>
    </div>
  );
}

// Inline confidence dot — for compact table cells where a bar is too noisy.
function ConfidenceDot({ score }) {
  if (score == null) return <span style={{ fontSize: 11, color: "var(--ink-4)" }}>—</span>;
  const band = confidenceBand(score);
  const color = band === "high" ? "var(--pos)" : band === "medium" ? "var(--warn)" : "var(--neg)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, border: "1px solid var(--rule)" }}/>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-2)", fontWeight: 500 }}>{score}</span>
    </span>
  );
}

// =============================================================================
// SEVERITY RAIL — left-edge tinted bar on table rows that prioritizes attention.
// CRITICAL: red    HIGH: amber    MEDIUM: indigo dim    NONE: transparent
// =============================================================================
const SEVERITY = {
  critical: "var(--neg)",
  high:     "var(--warn)",
  medium:   "var(--accent-2)",
  low:      "var(--ink-4)",
  none:     "transparent",
};

function SeverityRail({ level, width = 3 }) {
  return (
    <div style={{
      width, alignSelf: "stretch",
      background: SEVERITY[level] || "transparent",
      flexShrink: 0,
    }}/>
  );
}

// Severity legend — appears once at the top of any table that uses the rail.
function SeverityLegend({ counts }) {
  // counts: { critical: n, high: n, medium: n }
  const items = [
    { k: "critical", label: "Critical", desc: "Blocks defensibility" },
    { k: "high",     label: "High impact", desc: "Material to outputs" },
    { k: "medium",   label: "Review",   desc: "Confirm assumption" },
  ];
  return (
    <div style={{
      display: "flex", gap: 22, padding: "10px 14px",
      background: "var(--paper)", border: "1px solid var(--rule)",
      borderBottom: "none",
      fontSize: 11, color: "var(--ink-3)",
    }}>
      <span className="mono" style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>Priority</span>
      {items.map(it => {
        const n = counts?.[it.k] ?? 0;
        return (
          <span key={it.k} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 3, height: 14, background: SEVERITY[it.k] }}/>
            <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{it.label}</span>
            {n > 0 && (
              <span className="mono" style={{
                fontSize: 10, color: "var(--ink-3)", fontWeight: 600,
                padding: "1px 5px", background: "var(--paper-2)", border: "1px solid var(--rule)",
              }}>{n}</span>
            )}
            <span style={{ color: "var(--ink-3)" }}>· {it.desc}</span>
          </span>
        );
      })}
    </div>
  );
}

// =============================================================================
// DECISION GRAVITY HEADER — heavy-weight page header for output sections
// (Cost of Service, Fee Schedule, Review Changes). Larger, more typographic,
// emphasizes that "this is the answer."
// =============================================================================
// ProvenanceStrip — subtle reconciliation/source metadata.
// Renders a mono row of LABEL · value pairs, separated by middle dots.
// Pass an array of { label, value, status?: "ok"|"warn"|"info" } objects.
function ProvenanceStrip({ items, dense }) {
  const live = (items || []).filter(Boolean);
  if (live.length === 0) return null;
  return (
    <div style={{
      marginTop: dense ? 12 : 18,
      paddingTop: dense ? 10 : 14,
      borderTop: "1px solid var(--rule)",
      display: "flex", flexWrap: "wrap", alignItems: "center",
      gap: "6px 18px",
      fontSize: 11, lineHeight: 1.5, color: "var(--ink-3)",
    }}>
      {live.map((it, i) => {
        const dotColor = it.status === "ok"   ? "var(--pos)"  :
                         it.status === "warn" ? "var(--warn)" :
                         it.status === "info" ? "var(--ink-3)": "var(--ink-4)";
        return (
          <React.Fragment key={i}>
            {i > 0 && <span aria-hidden="true" style={{ color: "var(--rule-strong)" }}>·</span>}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
              <span aria-hidden="true" style={{
                width: 5, height: 5, borderRadius: "50%",
                background: dotColor, flexShrink: 0,
              }}/>
              <span className="mono" style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>{it.label}</span>
              <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{it.value}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DecisionGravityHeader({
  eyebrow, title, headline, headlineSub, decisionStatus, actions, tier = "high", provenance,
}) {
  return (
    <div style={{
      paddingBottom: 12, marginBottom: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 22 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <TierBadge tier={tier}/>
            {eyebrow && (
              <span className="mono" style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>{eyebrow}</span>
            )}
          </div>
          <div className="display" style={{
            fontSize: 36, fontWeight: 600, letterSpacing: "-0.025em",
            lineHeight: 1.1, color: "var(--ink)",
          }}>{title}</div>
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
      {headline && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "flex-end",
        }}>
          <div>
            <div className="mono" style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 10,
            }}>Reconciled result</div>
            <div className="display num" style={{
              fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em",
              lineHeight: 1.0, color: "var(--ink)",
              fontFeatureSettings: '"tnum" 1, "zero" 1',
            }}>{headline}</div>
            {headlineSub && (
              <div style={{
                fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5,
                marginTop: 12, maxWidth: 640, textWrap: "pretty",
              }}>{headlineSub}</div>
            )}
            <ProvenanceStrip items={provenance}/>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PROGRESSIVE DISCLOSURE — collapsed-by-default detail block.
// Used in CAP to hide full allocation matrices until requested.
// =============================================================================
function ProgressiveDisclosure({
  summaryLabel = "Show detail",
  collapsedLabel = "Hide detail",
  defaultOpen = false,
  preview, // optional content shown alongside the toggle in collapsed state
  children,
}) {
  const [open, setOpen] = uSDS(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "12px 16px", background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderBottom: open ? "none" : "1px solid var(--rule)",
          textAlign: "left", cursor: "pointer",
        }}
      >
        <span style={{
          width: 18, height: 18, display: "inline-flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "var(--accent)",
        }}>{open ? "▾" : "▸"}</span>
        <span className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em",
          color: "var(--ink-2)", textTransform: "uppercase",
        }}>{open ? collapsedLabel : summaryLabel}</span>
        {!open && preview && (
          <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginLeft: "auto" }}>{preview}</span>
        )}
      </button>
      {open && (
        <div style={{ border: "1px solid var(--rule)", borderTop: "none" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SCENARIO SWITCHER — Current / Proposed / Adopted / Phased / CPI tabs.
// Visual scaffolding for fee schedule scenarios. Does not store state itself —
// caller passes value + onChange. Only "current" and "proposed" are typically
// active; the rest are placeholders that show what's coming.
// =============================================================================
function ScenarioSwitcher({ value, onChange, scenarios, eyebrow = "Scenario", onSaveCurrent, onSaveChanges, onRename, onDelete, onDuplicate, dirty }) {
  // scenarios: [{ k, label, desc?, disabled?, badge?, custom? }]
  // custom:true → renders the "…" menu (Rename / Duplicate / Delete)
  // dirty:true → shows an unsaved indicator on the active chip and a "Save changes" affordance
  const [menuFor, setMenuFor] = React.useState(null);

  React.useEffect(() => {
    if (!menuFor) return;
    const onDoc = () => setMenuFor(null);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuFor]);

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    }}>
      <span className="mono" style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
        color: "var(--ink-3)", textTransform: "uppercase", marginRight: 4,
      }}>{eyebrow}</span>
      {scenarios.map(s => {
        const on = s.k === value;
        const dis = !!s.disabled;
        const showDirtyDot = on && dirty && s.custom;
        return (
          <span key={s.k} style={{ position: "relative", display: "inline-flex" }}>
            <button
              disabled={dis}
              onClick={() => !dis && onChange(s.k)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 10px",
                paddingRight: s.custom ? 4 : 10,
                border: on ? "1px solid var(--accent)" : "1px solid var(--rule)",
                background: on ? "var(--accent-tint)" : (dis ? "transparent" : "var(--paper)"),
                color: on ? "var(--accent)" : (dis ? "var(--ink-4)" : "var(--ink-2)"),
                fontSize: 12, fontWeight: on ? 600 : 500,
                cursor: dis ? "default" : "pointer",
                opacity: dis ? 0.55 : 1,
              }}
            >
              {showDirtyDot && (
                <span title="Unsaved changes" style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--warn)", display: "inline-block",
                }}/>
              )}
              <span>{s.label}</span>
              {s.badge && (
                <span className="mono" style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  padding: "1px 5px", textTransform: "uppercase",
                  background: dis ? "var(--paper-2)" : "var(--paper)",
                  color: dis ? "var(--ink-4)" : "var(--ink-3)",
                  border: "1px solid var(--rule)",
                }}>{s.badge}</span>
              )}
              {s.custom && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === s.k ? null : s.k); }}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 18, height: 18, marginLeft: 2,
                    color: on ? "var(--accent)" : "var(--ink-3)",
                    fontSize: 14, lineHeight: 1, fontWeight: 700,
                    borderRadius: 2,
                  }}
                  title="Scenario actions"
                >⋯</span>
              )}
            </button>
            {menuFor === s.k && (
              <div onClick={e => e.stopPropagation()} style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                background: "var(--paper)", border: "1px solid var(--rule-strong)",
                boxShadow: "0 6px 20px -6px rgba(0,0,0,0.16)",
                minWidth: 160, padding: 4,
                display: "flex", flexDirection: "column",
              }}>
                {onRename && (
                  <button onClick={() => { setMenuFor(null); onRename(s.k); }} style={menuItemStyle}>Rename…</button>
                )}
                {onDuplicate && (
                  <button onClick={() => { setMenuFor(null); onDuplicate(s.k); }} style={menuItemStyle}>Duplicate</button>
                )}
                {onDelete && (
                  <button onClick={() => { setMenuFor(null); onDelete(s.k); }} style={{ ...menuItemStyle, color: "var(--neg)" }}>Delete</button>
                )}
              </div>
            )}
          </span>
        );
      })}
      {onSaveChanges && (
        <button
          onClick={onSaveChanges}
          title="Save edits to this scenario"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 10px",
            border: "1px solid var(--accent)",
            background: "var(--accent-tint)", color: "var(--accent)",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          Save changes
        </button>
      )}
      {onSaveCurrent && (
        <button
          onClick={onSaveCurrent}
          title="Save current scenario as a new one"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 10px",
            border: "1px dashed var(--rule-strong)",
            background: "transparent", color: "var(--ink-3)",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
            marginLeft: onSaveChanges ? 0 : "auto",
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          Save as scenario
        </button>
      )}
    </div>
  );
}

const menuItemStyle = {
  textAlign: "left", padding: "6px 10px",
  background: "transparent", border: "none",
  fontSize: 12, color: "var(--ink-2)", cursor: "pointer",
};

// =============================================================================
// IMPACT BAR — horizontal "what's driving this" visualization.
// Used in Cost of Service to show recovery gap composition, in Operating to
// show category contributions, in Review Changes to show delta contribution.
// =============================================================================
function ImpactBar({ segments, total, height = 22, showLabels = true }) {
  // segments: [{ label, value, color?, tone? }]
  const sum = total ?? segments.reduce((a, s) => a + Math.abs(s.value), 0);
  if (sum <= 0) return null;
  return (
    <div>
      <div style={{
        display: "flex", height, background: "var(--paper-3)",
        border: "1px solid var(--rule)", overflow: "hidden",
      }}>
        {segments.map((s, i) => {
          const pct = (Math.abs(s.value) / sum) * 100;
          const bg = s.color ||
            (s.tone === "neg" ? "var(--neg)" :
             s.tone === "warn" ? "var(--warn)" :
             s.tone === "pos" ? "var(--pos)" :
             i === 0 ? "var(--accent)" :
             i === 1 ? "var(--accent-2)" :
             `oklch(${65 - i * 4}% 0.10 ${265 + i * 12})`);
          return (
            <div key={i} title={`${s.label}: ${s.value}`} style={{
              width: `${pct}%`, background: bg,
              borderRight: i < segments.length - 1 ? "1px solid var(--paper)" : "none",
            }}/>
          );
        })}
      </div>
      {showLabels && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8 }}>
          {segments.map((s, i) => {
            const pct = (Math.abs(s.value) / sum) * 100;
            const bg = s.color ||
              (s.tone === "neg" ? "var(--neg)" :
               s.tone === "warn" ? "var(--warn)" :
               s.tone === "pos" ? "var(--pos)" :
               i === 0 ? "var(--accent)" :
               i === 1 ? "var(--accent-2)" :
               `oklch(${65 - i * 4}% 0.10 ${265 + i * 12})`);
            return (
              <span key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11, color: "var(--ink-2)",
              }}>
                <span style={{ width: 8, height: 8, background: bg }}/>
                {s.label}
                <span className="mono" style={{ color: "var(--ink-3)" }}>· {Math.round(pct)}%</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ANOMALY FLAG — inline indicator for unusual values (Operating).
// Goes beyond StatusPill: includes a comparison ("+34% vs prior", "outlier").
// =============================================================================
function AnomalyFlag({ kind, label, detail }) {
  // kind: "spike" | "drop" | "outlier" | "stale" | "new"
  const map = {
    spike:   { sym: "▲", color: "var(--neg)",  bg: "var(--neg-tint)" },
    drop:    { sym: "▼", color: "var(--accent)", bg: "var(--accent-tint)" },
    outlier: { sym: "◆", color: "var(--warn)", bg: "var(--warn-tint)" },
    stale:   { sym: "◷", color: "var(--ink-3)", bg: "var(--paper-2)" },
    new:     { sym: "+", color: "var(--accent)", bg: "var(--accent-tint)" },
  };
  const p = map[kind] || map.outlier;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "1px 7px",
      background: p.bg, color: p.color,
      border: `1px solid ${p.color}`,
      fontSize: 10.5, fontWeight: 500,
      borderRadius: 2,
    }}>
      <span className="mono" style={{ fontWeight: 700, fontSize: 10 }}>{p.sym}</span>
      <span>{label}</span>
      {detail && <span className="mono" style={{ fontSize: 10, opacity: 0.85 }}>{detail}</span>}
    </span>
  );
}

// =============================================================================
// DOWNSTREAM RIBBON — small contextual rail showing what the current section
// feeds into. Used in low-tier sections (Services) to give system context.
// =============================================================================
function DownstreamRibbon({ from, to }) {
  // to: [{ key, label, sub? }]
  return (
    <div style={{
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="mono" style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>This feeds</span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "var(--ink-2)",
          padding: "3px 9px", background: "var(--paper)",
          border: "1px solid var(--rule)",
        }}>{from}</span>
      </div>
      <span style={{ color: "var(--ink-4)", fontSize: 14 }}>→</span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
        {to.map(t => (
          <div key={t.key} style={{
            display: "flex", flexDirection: "column", gap: 2,
            padding: "4px 10px", background: "var(--paper)",
            border: "1px solid var(--rule)", minWidth: 0,
          }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)" }}>{t.label}</span>
            {t.sub && <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{t.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// AUDIT NOTE — terse, italicized, mono-prefixed statement of provenance/method.
// Used to signal "this is auditable, here's why." Preferred over verbose copy.
// =============================================================================
function AuditNote({ children }) {
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5,
    }}>
      <span className="mono" style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
        color: "var(--ink-2)", textTransform: "uppercase", flexShrink: 0,
        paddingTop: 2,
      }}>Method</span>
      <span style={{ textWrap: "pretty" }}>{children}</span>
    </div>
  );
}

Object.assign(window, {
  IMPORTANCE, SECTION_TIER, tierFor,
  TierBadge, ConfidenceBar, ConfidenceDot, confidenceBand,
  SEVERITY, SeverityRail, SeverityLegend,
  DecisionGravityHeader, ProvenanceStrip, ProgressiveDisclosure, ScenarioSwitcher,
  ImpactBar, AnomalyFlag, DownstreamRibbon, AuditNote,
});
