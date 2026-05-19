
import { useState, type ReactNode } from "react";

interface DeptSummaryCol {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "right" | "center";
  mono?: boolean;
}

export interface DeptSummaryRow {
  key: string;
  cells: Record<string, ReactNode>;
  drilldown?: ReactNode;
}

interface Props {
  title?: string;
  focus?: ReactNode;
  cols: DeptSummaryCol[];
  rows: DeptSummaryRow[];
  footer?: Record<string, ReactNode>;
}

/** The single primary per-dept summary table shared across Direct Labor,
 *  Operating, Cost Allocation, and Cost of Service. Each row can expand to
 *  show a ledger + method/formula/source metadata grid. */
export function DeptSummaryTable({ title, focus, cols, rows, footer }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const grid = cols.map((c) => c.width ?? "1fr").join(" ");
  const colTpl = `${grid} 36px`;

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
      {(title || focus) && (
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--rule)",
          display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
        }}>
          {title && (
            <div className="display" style={{
              fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em",
            }}>{title}</div>
          )}
          {focus && (
            <div className="mono" style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              color: "var(--ink-3)", textTransform: "uppercase",
            }}>{focus}</div>
          )}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: colTpl, columnGap: 28,
        padding: "9px 16px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--paper-2)",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {cols.map((c) => (
          <div key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.label}</div>
        ))}
        <div/>
      </div>

      {rows.map((r, i) => {
        const isOpen = !!open[r.key];
        const canExpand = !!r.drilldown;
        return (
          <div key={r.key} style={{
            borderBottom:
              i === rows.length - 1 && !footer ? "none" : "1px solid var(--rule)",
          }}>
            <div
              onClick={() => canExpand && setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))}
              onMouseEnter={(e) => {
                if (canExpand && !isOpen) e.currentTarget.style.background = "var(--paper-2)";
              }}
              onMouseLeave={(e) => {
                if (canExpand && !isOpen) e.currentTarget.style.background = "transparent";
              }}
              style={{
                display: "grid", gridTemplateColumns: colTpl, columnGap: 28,
                padding: "12px 16px", alignItems: "center",
                cursor: canExpand ? "pointer" : "default",
                fontSize: 13,
                background: isOpen ? "var(--paper-2)" : "transparent",
                transition: "background 80ms",
              }}
            >
              {cols.map((c) => (
                <div key={c.key} style={{
                  textAlign: c.align ?? "left",
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

      {footer && (
        <div style={{
          display: "grid", gridTemplateColumns: colTpl, columnGap: 28,
          padding: "12px 16px", alignItems: "center",
          fontSize: 13, fontWeight: 600,
          borderTop: "1px solid var(--rule-strong)",
          background: "var(--paper-2)",
        }}>
          {cols.map((c) => (
            <div key={c.key} style={{
              textAlign: c.align ?? "left",
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

/** Compact category/position/pool ledger used inside DeptSummaryTable
 *  drilldowns. Header row + body rows + emphasized total. */
interface LedgerCol {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "right" | "center";
}

interface LedgerRow {
  key: string;
  cells: Record<string, ReactNode>;
}

interface LedgerProps {
  cols: LedgerCol[];
  rows: LedgerRow[];
  total: Record<string, ReactNode>;
}

export function Ledger({ cols, rows, total }: LedgerProps) {
  const grid = cols.map((c) => c.width ?? "1fr").join(" ");
  return (
    <div style={{ border: "1px solid var(--rule)", background: "var(--paper)" }}>
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid var(--rule)",
        background: "var(--paper-2)",
        display: "grid", gridTemplateColumns: grid, gap: 12,
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {cols.map((c) => (
          <div key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.label}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.key} style={{
          padding: "7px 12px",
          display: "grid", gridTemplateColumns: grid, gap: 12,
          borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : "none",
          fontSize: 12, alignItems: "baseline",
        }}>
          {cols.map((c) => (
            <div key={c.key} style={{
              textAlign: c.align ?? "left",
              fontVariantNumeric: c.align === "right" ? "tabular-nums" : "normal",
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
            }}>{r.cells[c.key]}</div>
          ))}
        </div>
      ))}
      <div style={{
        padding: "8px 12px",
        display: "grid", gridTemplateColumns: grid, gap: 12,
        borderTop: "1px solid var(--rule-strong)",
        background: "var(--paper-2)",
        fontSize: 12, fontWeight: 600, alignItems: "baseline",
      }}>
        {cols.map((c) => (
          <div key={c.key} style={{
            textAlign: c.align ?? "left",
            fontVariantNumeric: c.align === "right" ? "tabular-nums" : "normal",
          }}>{total[c.key]}</div>
        ))}
      </div>
    </div>
  );
}

/** Method / Formula / Source metadata grid that sits below the Ledger in each
 *  DeptSummaryTable drilldown. Two columns: mono uppercase label, prose value. */
interface MetaGridProps {
  rows: { label: string; value: ReactNode }[];
}

export function MetaGrid({ rows }: MetaGridProps) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "160px 1fr",
      gap: "6px 14px",
      fontSize: 12, lineHeight: 1.5,
    }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "contents" }}>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
            color: "var(--ink-3)", textTransform: "uppercase", paddingTop: 2,
          }}>{r.label}</div>
          <div style={{ color: "var(--ink-2)" }}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}
