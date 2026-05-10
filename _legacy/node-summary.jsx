// Compact summary primitives shared by Direct Labor / Operating / Cost Allocation.
// Replaces the old InputNodeAnswer KPI tiles + InputNodeContribution stacked bar
// with a calmer, more finance-native layout:
//   - StatusRow:        single line of pill stats
//   - DeptSummaryTable: ONE primary table per tab, dept-by-dept
//   - Drilldown:        expandable trace under a row (lineage / formulas /
//                       allocation basis / source references / step-down)
//
// Each consumer screen passes its own column set + drilldown content so this
// file stays presentation-only.

const { useState: uSNS } = React;

// ------------------------------------------------------------------
// StatusRow — one compact line.
// items: array of strings or { label, value, tone? }
// ------------------------------------------------------------------
function StatusRow({ items = [] }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap",
      padding: "10px 14px",
      background: "var(--paper)", border: "1px solid var(--rule)",
      fontSize: 12.5, color: "var(--ink-2)",
      lineHeight: 1.4,
    }}>
      {items.filter(Boolean).map((it, i) => {
        const isObj = typeof it === "object";
        const label = isObj ? it.label : null;
        const value = isObj ? it.value : it;
        const tone  = isObj ? it.tone  : null;
        const color = tone === "warn" ? "var(--warn)"
                    : tone === "neg"  ? "var(--neg)"
                    : tone === "pos"  ? "var(--pos)"
                    : "var(--ink)";
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <span aria-hidden style={{
                width: 1, height: 12, background: "var(--rule)",
                margin: "0 14px",
              }}/>
            )}
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
              {label && (
                <span className="mono" style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                  color: "var(--ink-3)", textTransform: "uppercase",
                }}>{label}</span>
              )}
              <span className="num" style={{
                color, fontFeatureSettings: '"tnum" 1',
                fontWeight: tone ? 600 : 500,
              }}>{value}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------
// DeptSummaryTable — single primary summary table.
// Props:
//   title       string
//   focus       string  (small label under title)
//   cols        [{ key, label, align?, width?, mono? }]
//   rows        [{ key, cells: [...], drilldown?: ReactNode }]
//                  cells: ReactNode or string per col
//   footer      optional totals row [{ ... }]
// ------------------------------------------------------------------
function DeptSummaryTable({ title, focus, cols, rows, footer }) {
  const [open, setOpen] = uSNS({});
  const grid = cols.map(c => c.width || "1fr").join(" ");
  const colTpl = `${grid} 36px`;

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
      {(title || focus) && (
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--rule)",
          display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
        }}>
          <div className="display" style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em" }}>
            {title}
          </div>
          {focus && (
            <div className="mono" style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              color: "var(--ink-3)", textTransform: "uppercase",
            }}>{focus}</div>
          )}
        </div>
      )}

      {/* Header row */}
      <div style={{
        display: "grid", gridTemplateColumns: colTpl, columnGap: 28,
        padding: "9px 16px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--paper-2)",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {cols.map(c => (
          <div key={c.key} style={{ textAlign: c.align || "left" }}>{c.label}</div>
        ))}
        <div/>
      </div>

      {/* Body rows */}
      {rows.map((r, i) => {
        const isOpen = !!open[r.key];
        const canExpand = !!r.drilldown;
        return (
          <div key={r.key} style={{
            borderBottom: i === rows.length - 1 && !footer ? "none" : "1px solid var(--rule)",
          }}>
            <div
              onClick={() => canExpand && setOpen(o => ({ ...o, [r.key]: !o[r.key] }))}
              style={{
                display: "grid", gridTemplateColumns: colTpl, columnGap: 28,
                padding: "12px 16px", alignItems: "center",
                cursor: canExpand ? "pointer" : "default",
                fontSize: 13,
                background: isOpen ? "var(--paper-2)" : "transparent",
                transition: "background 80ms",
              }}
              onMouseEnter={e => { if (canExpand && !isOpen) e.currentTarget.style.background = "var(--paper-2)"; }}
              onMouseLeave={e => { if (canExpand && !isOpen) e.currentTarget.style.background = "transparent"; }}
            >
              {cols.map(c => (
                <div key={c.key} style={{
                  textAlign: c.align || "left",
                  fontFamily: c.mono ? "var(--ff-mono)" : "inherit",
                  fontVariantNumeric: c.align === "right" ? "tabular-nums" : "normal",
                  minWidth: 0,
                }}>{r.cells[c.key]}</div>
              ))}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                {canExpand && (
                  <span style={{
                    display: "inline-block", fontSize: 9, color: "var(--ink-3)",
                    transform: isOpen ? "rotate(90deg)" : "none",
                    transition: "transform 100ms",
                    fontFamily: "var(--ff-mono)", lineHeight: 1,
                  }}>▶</span>
                )}
              </div>
            </div>
            {canExpand && isOpen && (
              <div style={{
                padding: "0 16px 16px 16px",
                background: "var(--paper-2)",
                borderTop: "1px dashed var(--rule)",
              }}>
                {r.drilldown}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer / totals */}
      {footer && (
        <div style={{
          display: "grid", gridTemplateColumns: colTpl, columnGap: 28,
          padding: "12px 16px", alignItems: "center",
          fontSize: 13, fontWeight: 600,
          borderTop: "1px solid var(--rule-strong)",
          background: "var(--paper-2)",
        }}>
          {cols.map(c => (
            <div key={c.key} style={{
              textAlign: c.align || "left",
              fontFamily: c.mono ? "var(--ff-mono)" : "inherit",
              fontVariantNumeric: c.align === "right" ? "tabular-nums" : "normal",
            }}>{footer[c.key]}</div>
          ))}
          <div/>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// TraceBlock — labelled lineage row used inside drilldowns
// ------------------------------------------------------------------
function TraceBlock({ label, children }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "140px 1fr", gap: 14,
      padding: "10px 0",
      borderBottom: "1px dashed var(--rule)",
      fontSize: 12, lineHeight: 1.55,
    }}>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase", paddingTop: 1,
      }}>{label}</div>
      <div style={{ color: "var(--ink-2)" }}>{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------
// Formula — inline mono chunk for showing computations
// ------------------------------------------------------------------
function Formula({ children }) {
  return (
    <span className="mono" style={{
      fontSize: 11.5, color: "var(--ink-2)",
      background: "var(--paper)", padding: "2px 6px",
      border: "1px solid var(--rule)",
    }}>{children}</span>
  );
}

Object.assign(window, { StatusRow, DeptSummaryTable, TraceBlock, Formula });
