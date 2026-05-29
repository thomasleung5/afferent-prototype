import type { CSSProperties, ReactNode } from "react";
import { MonoLabel } from "./MonoLabel";

export interface MiniTableColumn {
  /** Stable column identifier. */
  key: string;
  /** Header label. Plain string renders inside a MonoLabel; pass a
   *  ReactNode for custom layouts. */
  label: ReactNode;
  /** CSS grid track size — e.g. "1fr", "90px", "minmax(220px, 1.5fr)". */
  width: string;
  /** Cell text alignment. Defaults to "left". */
  align?: "left" | "right" | "center";
}

interface Props<R> {
  columns: MiniTableColumn[];
  rows: R[];
  /** Stable React key per row. Defaults to `row-${i}`. */
  rowKey?: (row: R, i: number) => string;
  /** Render one cell. Receives the column and the row. */
  renderCell: (col: MiniTableColumn, row: R, i: number) => ReactNode;
  /** When set, a footer row is rendered with `var(--paper-2)` background
   *  and a strong top border. Receives each column, returns its cell
   *  contents (commonly a Total label or a sum). */
  renderFooter?: (col: MiniTableColumn) => ReactNode;
  /** Slot rendered below the footer row, still inside the outer border.
   *  Use for "+ Add row" affordances; ignored when no children. */
  footerSlot?: ReactNode;
  /** Shown in place of the body rows when `rows` is empty. */
  emptyState?: ReactNode;
  /** Outer container background. Defaults to `var(--paper)`. The Formula
   *  Editor tier table uses `var(--paper-2)` to differentiate it from
   *  the surrounding drilldown chrome. */
  outerBackground?: string;
  /** Row density — controls header / body / footer padding + column gap.
   *  "default" matches the Services + Productive Hours drilldowns;
   *  "compact" matches the Formula Editor tier table (tighter spacing
   *  for form-input rows). */
  density?: "default" | "compact";
}

const DENSITY = {
  default: { gap: 12, header: "8px 12px", body: "7px 12px", footer: "8px 12px" },
  compact: { gap: 8,  header: "5px 8px",  body: "4px 8px",  footer: "8px 12px" },
} as const;

/** Compact bordered table used inside drilldown columns. Header + body +
 *  optional footer + optional add-row slot share a single outer border
 *  and a CSS grid. Configurable per-row density. Not a replacement for
 *  DataTable — that primitive owns sorting / filtering / multi-section
 *  full-page tables. */
export function MiniTable<R>({
  columns, rows, rowKey, renderCell,
  renderFooter, footerSlot, emptyState,
  outerBackground = "var(--paper)",
  density = "default",
}: Props<R>) {
  const d = DENSITY[density];
  const grid = columns.map((c) => c.width).join(" ");
  const gridStyle: CSSProperties = {
    display: "grid", gridTemplateColumns: grid, gap: d.gap,
    alignItems: "baseline",
  };

  return (
    <div style={{
      border: "1px solid var(--rule)",
      background: outerBackground,
    }}>
      {/* Header */}
      <div style={{
        ...gridStyle,
        padding: d.header,
        background: "var(--paper-2)",
        borderBottom: "1px solid var(--rule)",
      }}>
        {columns.map((c) => (
          <span key={c.key} style={{ textAlign: c.align ?? "left" }}>
            {typeof c.label === "string"
              ? <MonoLabel>{c.label}</MonoLabel>
              : c.label}
          </span>
        ))}
      </div>

      {/* Body */}
      {rows.length === 0 && emptyState != null ? (
        <div style={{
          padding: "12px",
          fontSize: "var(--t-l7)",
          color: "var(--ink-3)",
          textAlign: "center",
        }}>{emptyState}</div>
      ) : rows.map((r, i) => (
        <div
          key={rowKey ? rowKey(r, i) : `row-${i}`}
          style={{
            ...gridStyle,
            padding: d.body,
            borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : "none",
            fontSize: 12,
          }}
        >
          {columns.map((c) => (
            <span key={c.key} style={{
              textAlign: c.align ?? "left",
              fontVariantNumeric: c.align === "right" ? "tabular-nums" : undefined,
            }}>
              {renderCell(c, r, i)}
            </span>
          ))}
        </div>
      ))}

      {/* Footer */}
      {renderFooter && (
        <div style={{
          ...gridStyle,
          padding: d.footer,
          background: "var(--paper-2)",
          borderTop: "1px solid var(--rule-strong)",
          fontSize: 12, fontWeight: 600,
        }}>
          {columns.map((c) => (
            <span key={c.key} style={{
              textAlign: c.align ?? "left",
              fontVariantNumeric: c.align === "right" ? "tabular-nums" : undefined,
            }}>
              {renderFooter(c)}
            </span>
          ))}
        </div>
      )}

      {/* Add-row slot */}
      {footerSlot}
    </div>
  );
}
