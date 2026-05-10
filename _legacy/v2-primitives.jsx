// New primitives for Afferent v2 — source badges, status pills, KPI tiles, formula card, progress bars

const { useState: uS2, useMemo: uM2 } = React;

// -- Source badge -----------------------------------------------------------
function SourceBadge({ children, kind = "default" }) {
  const palette = {
    default: { bg:"var(--paper-2)", fg:"var(--ink-2)", bd:"var(--rule)" },
    cap:     { bg:"var(--paper-2)", fg:"var(--ink)", bd:"var(--rule-strong)" },
    fee:     { bg:"var(--pos-tint)", fg:"var(--pos)", bd:"var(--rule-strong)" },
    budget:  { bg:"var(--warn-tint)", fg:"var(--warn)", bd:"var(--rule-strong)" },
  };
  const p = palette[kind] || palette.default;
  return (
    <span className="mono" style={{
      display:"inline-flex", alignItems:"center", gap: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
      padding:"2px 6px", textTransform:"uppercase",
      background: p.bg, color: p.fg, border:`1px solid ${p.bd}`,
    }}>{children}</span>
  );
}

// -- Status pill ------------------------------------------------------------
function StatusPill({ kind, children }) {
  const map = {
    ok:        { bg:"var(--pos-tint)",  fg:"var(--pos)",  dot:"var(--pos)" },
    warn:      { bg:"var(--warn-tint)", fg:"var(--warn)", dot:"var(--warn)" },
    bad:       { bg:"var(--neg-tint)",  fg:"var(--neg)",  dot:"var(--neg)" },
    review:    { bg:"var(--warn-tint)", fg:"var(--warn)", dot:"var(--warn)" },
    legal:     { bg:"var(--neg-tint)",  fg:"var(--neg)",  dot:"var(--neg)" },
    confirm:   { bg:"var(--paper-2)",   fg:"var(--ink-2)",        dot:"var(--ink-3)" },
    info:      { bg:"var(--paper-2)", fg:"var(--ink-2)", dot:"var(--ink)" },
    locked:    { bg:"var(--paper-3)",   fg:"var(--ink-2)",        dot:"var(--ink-2)" },
  };
  const p = map[kind] || map.confirm;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap: 5,
      fontSize: 11, fontWeight: 500,
      padding:"2px 8px", border:`1px solid ${p.dot}`,
      background: p.bg, color: p.fg,
      borderRadius: 999,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: p.dot }}/>
      {children}
    </span>
  );
}

// Map common labels -> kinds
function statusKindFor(label) {
  const l = (label || "").toLowerCase();
  if (l.includes("legal")) return "legal";
  if (l.includes("review") || l.includes("needs"))  return "review";
  if (l.includes("high impact") || l.includes("missing") || l.includes("excluded")) return "bad";
  if (l.includes("low confidence") || l.includes("validate")) return "warn";
  if (l.includes("locked") || l.includes("reused"))  return "locked";
  if (l.includes("confirm") || l.includes("validated") || l.includes("imported")) return "confirm";
  if (l.includes("on track") || l.includes("ok"))    return "ok";
  return "info";
}

// -- Metric row -------------------------------------------------------------
// Flat horizontal row of metrics with no card borders. Used as the
// "output anchor" at the top of each input-node page (Salary, Operating, CAP,
// Workload, Services) and on Cost of Service / Fee Schedule.
//
// Visual logic:
//   - the FIRST metric is the "produced output" — large, ink, mono numerals
//   - subsequent metrics are supporting context — smaller, ink-2
//   - a thin baseline rule sits underneath to anchor the row
//   - tone="policy" tints the primary value blue (for Fee Schedule revenue)
//   - tone="computed" keeps it neutral ink (for fact / read-only outputs)
//
// items: [{ label, value, sub?, tone? }]
//
function MetricRow({ items, eyebrow }) {
  return (
    <div style={{
      paddingTop: 4, paddingBottom: 22,
      borderBottom: "1px solid var(--rule)",
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      {eyebrow && (
        <div className="mono" style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>{eyebrow}</div>
      )}
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 48, flexWrap: "wrap",
      }}>
        {items.map((m, i) => {
          const primary = i === 0;
          const valueColor =
            m.tone === "policy" ? "var(--accent)" :
            m.tone === "pos"    ? "var(--pos)" :
            m.tone === "neg"    ? "var(--neg)" :
            m.tone === "warn"   ? "var(--warn)" :
                                  "var(--ink)";
          return (
            <div key={i} style={{
              display: "flex", flexDirection: "column", gap: 6,
              minWidth: 0, flexShrink: 0,
            }}>
              <div className="mono" style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                color: "var(--ink-3)", textTransform: "uppercase",
              }}>{m.label}</div>
              <div className="display num" style={{
                fontSize: primary ? 38 : 22,
                fontWeight: primary ? 600 : 500,
                letterSpacing: "-0.02em",
                lineHeight: 1.15, color: valueColor,
                fontFeatureSettings: '"tnum" 1, "zero" 1',
              }}>{m.value}</div>
              {m.sub && (
                <div style={{
                  fontSize: 11.5, color: "var(--ink-3)",
                  lineHeight: 1.4, maxWidth: 260,
                }}>{m.sub}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- KPI tile ---------------------------------------------------------------
// Visual hierarchy:
//   tier 1 — primary $ amounts (CAP total, revenue impact, total cost). 28px bold ink.
//   tier 2 — rates, counts (default). 22px ink.
//   tier 3 — small/secondary. 17px ink-2.
function KpiTile({ label, value, sub, tone, source, tier = 2 }) {
  const color = tone === "pos" ? "var(--pos)" : tone === "neg" ? "var(--neg)" : tone === "warn" ? "var(--warn)" : "var(--ink)";
  const valueSize = tier === 1 ? 30 : tier === 3 ? 17 : 22;
  const valueWeight = tier === 1 ? 700 : 600;
  return (
    <div style={{
      background:"var(--paper)", border:"1px solid var(--rule)",
      padding:"14px 16px",
      display:"flex", flexDirection:"column", gap: 4, minHeight: 96,
    }}>
      <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase" }}>
        {label}
      </div>
      <div className="display num" style={{
        fontSize: valueSize, fontWeight: valueWeight,
        letterSpacing: "-0.02em", color, lineHeight: 1.0, marginTop: 4,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color:"var(--ink-3)", marginTop: 4 }}>{sub}</div>}
      {source && <div style={{ marginTop:"auto", paddingTop: 8 }}><SourceBadge>{source}</SourceBadge></div>}
    </div>
  );
}

// -- Formula card -----------------------------------------------------------
// Variants:
//   - default (Cost of Service / Fee Schedule): always-visible, bordered, full footnote
//   - collapsed: thin "Show formula" toggle bar; expands to default appearance on click
function FormulaCard({ parts, equals, footnote, collapsible = false, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const showCollapsed = collapsible && !open;

  if (showCollapsed) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 14px", height: 34,
          background: "transparent", border: "1px dashed var(--rule)",
          textAlign: "left", cursor: "pointer", width: "100%",
        }}
      >
        <span className="mono" style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Formula</span>
        <span style={{
          fontSize: 11.5, color: "var(--ink-3)",
          fontFamily: "var(--ff-mono)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
        }}>{parts.join(" + ")} = {equals}</span>
        <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500, flexShrink: 0 }}>
          Show ▾
        </span>
      </button>
    );
  }

  return (
    <div style={{
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      padding: "14px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="mono" style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Formula</span>
        {collapsible && (
          <button
            onClick={() => setOpen(false)}
            style={{ fontSize: 11, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer" }}
          >Hide ▴</button>
        )}
      </div>
      <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap: 8, fontFamily:"var(--ff-mono)", fontSize: 12, color:"var(--ink-2)" }}>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            <span style={{
              padding:"4px 8px", background:"var(--paper)",
              border:"1px solid var(--rule)", color:"var(--ink)",
            }}>{p}</span>
            {i < parts.length - 1 && <span style={{ color:"var(--ink-3)" }}>+</span>}
          </React.Fragment>
        ))}
        <span style={{ color:"var(--ink-3)" }}>=</span>
        <span style={{
          padding:"4px 8px", background:"var(--accent-tint)",
          border:"1px solid var(--accent)", color:"var(--accent)",
          fontWeight: 600,
        }}>{equals}</span>
      </div>
      {footnote && <div style={{ fontSize: 11.5, color:"var(--ink-3)", marginTop: 10, lineHeight: 1.5 }}>{footnote}</div>}
    </div>
  );
}

// -- Progress bar (linear) --------------------------------------------------
function ProgressBar({ pct, height = 6, color }) {
  return (
    <div style={{
      position:"relative", height, background:"var(--paper-3)",
      boxShadow:"inset 0 0 0 1px var(--rule)",
    }}>
      <div style={{
        position:"absolute", left:0, top:0, bottom:0,
        width: `${Math.max(0, Math.min(100, pct))}%`,
        background: color || "var(--accent)",
      }}/>
    </div>
  );
}

// -- Step list (numbered) ---------------------------------------------------
function StepList({ steps }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 0 }}>
      {steps.map((s, i) => (
        <div key={s.k || i} style={{
          display:"grid", gridTemplateColumns:"30px 1fr auto",
          alignItems:"center", gap: 12,
          padding:"10px 0",
          borderBottom: i < steps.length - 1 ? "1px solid var(--rule)" : "none",
        }}>
          <div className="mono" style={{
            fontSize: 11, fontWeight: 600, color: s.done ? "var(--pos)" : "var(--ink-3)",
            width: 22, height: 22, borderRadius: "50%",
            border: s.done ? "1px solid var(--pos)" : "1px solid var(--rule-strong)",
            display:"flex", alignItems:"center", justifyContent:"center",
            background: s.done ? "var(--pos-tint)" : "var(--paper)",
          }}>
            {s.done ? <Icon name="check" size={11} color="var(--pos)"/> : i + 1}
          </div>
          <div style={{ fontSize: 13, color: s.done ? "var(--ink-3)" : "var(--ink)" }}>{s.label}</div>
          {s.done ? <span style={{ fontSize: 11, color:"var(--ink-3)" }}>Done</span> :
            <span style={{ fontSize: 11, color:"var(--accent)" }}>In progress</span>}
        </div>
      ))}
    </div>
  );
}

// -- Page header ------------------------------------------------------------
function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap: 24, marginBottom: 18 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 8 }}>{eyebrow}</div>}
        <div className="display" style={{ fontSize: 28, fontWeight: 600, letterSpacing:"-0.02em", lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 14, color:"var(--ink-2)", marginTop: 10, maxWidth: 720, textWrap:"pretty", lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display:"flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

// -- Source rail ------------------------------------------------------------
function SourceRail({ sources }) {
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", padding: 18 }}>
      <SectionLabel>Source documents</SectionLabel>
      <div style={{ display:"flex", flexDirection:"column", gap: 10 }}>
        {sources.map((s, i) => (
          <div key={i} style={{ paddingBottom: 10, borderBottom: i < sources.length-1 ? "1px dashed var(--rule)" : "none" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color:"var(--ink)" }}>{s.name}</div>
              <SourceBadge kind={s.kind}>{s.short}</SourceBadge>
            </div>
            <div style={{ fontSize: 11.5, color:"var(--ink-3)", marginTop: 4, lineHeight: 1.5 }}>{s.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Generic data table -----------------------------------------------------
function DataTable({ cols, rows, footer }) {
  // cols: [{ key, label, align, width, render(row) }]
  const grid = cols.map(c => c.width || "1fr").join(" ");
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", overflow:"hidden" }}>
      <div style={{
        display:"grid", gridTemplateColumns: grid, gap: 14,
        padding:"10px 16px",
        borderBottom:"1px solid var(--rule-strong)",
        background:"var(--paper-2)",
        fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
        letterSpacing:"0.08em", color:"var(--ink-3)", textTransform:"uppercase",
      }}>
        {cols.map(c => (
          <div key={c.key} style={{ textAlign: c.align || "left" }}>{c.label}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.id || i} style={{
          display:"grid", gridTemplateColumns: grid, gap: 14,
          padding:"11px 16px", alignItems:"center",
          borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : "none",
          background: i % 2 === 1 ? "var(--paper)" : "var(--paper)",
          fontSize: 12.5,
        }}>
          {cols.map(c => (
            <div key={c.key} style={{ textAlign: c.align || "left", color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis" }}>
              {c.render ? c.render(r) : r[c.key]}
            </div>
          ))}
        </div>
      ))}
      {footer}
    </div>
  );
}

// -- Confidence dots --------------------------------------------------------
function Confidence({ level }) {
  const lvl = (level || "").toLowerCase();
  let n = 1;
  if (lvl.includes("high")) n = lvl.includes("medium") ? 2 : 3;
  else if (lvl.includes("medium")) n = 2;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap: 4 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: i < n ? (n === 3 ? "var(--pos)" : n === 2 ? "var(--warn)" : "var(--neg)") : "var(--paper-3)",
          border: "1px solid var(--rule)",
        }}/>
      ))}
      <span style={{ fontSize: 11.5, color:"var(--ink-2)", marginLeft: 4 }}>{level}</span>
    </span>
  );
}

Object.assign(window, {
  SourceBadge, StatusPill, statusKindFor, KpiTile, FormulaCard, MetricRow,
  ProgressBar, StepList, PageHeader, SourceRail, DataTable, Confidence,
});
