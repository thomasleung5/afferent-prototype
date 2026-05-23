
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AddRowButton } from "@/components/ui/AddRowButton";
import { ExpandIndicator } from "@/components/ui/ExpandIndicator";

type SortDir = "asc" | "desc";
type CellAlign = "left" | "right" | "center";

export interface Column<Row> {
  key: string;
  label: string;
  /** CSS grid track value: "1fr", "120px", "minmax(220px,2fr)" — defaults to "1fr". */
  width?: string;
  align?: CellAlign;
  sortable?: boolean;
  /** Override sort key. If a function, it derives the value to compare from a row. */
  sortKey?: string | ((row: Row) => unknown);
  /** Custom cell renderer. Defaults to `row[key]`. */
  render?: (row: Row) => ReactNode;
  /** Format the raw `row[key]` value (string/number) when `render` isn't provided. */
  fmt?: (val: unknown) => ReactNode;
}

export interface FilterGroup {
  id: string;
  label?: string;
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
}

interface DataTableRow {
  /** Stable identifier — used for selection, drilldown, and React keys. */
  id?: string;
  /** Truthy = highlight as flagged (warm tint, accent border). */
  flag?: boolean;
}

interface RowStyle {
  bg?: string;
  accent?: string;
  style?: CSSProperties;
}

interface Props<Row extends DataTableRow> {
  cols: Column<Row>[];
  rows: Row[];
  filters?: FilterGroup[];
  defaultSort?: { key: string; dir: SortDir };
  /** Pre-sort applied AFTER user sort — e.g. flagged rows always float. */
  stickySort?: (a: Row, b: Row) => number;
  getRowStyle?: (row: Row, i: number, sorted: Row[]) => RowStyle | null | undefined;
  onAdd?: () => void;
  addLabel?: string;
  onRowClick?: (row: Row) => void;
  /** When set, table scrolls horizontally below this px width. */
  minWidth?: number;
  emptyState?: ReactNode;
  openId?: string;
  renderDrilldown?: (row: Row) => ReactNode;
  /** Reserve a leading column for an open/closed chevron. Requires `renderDrilldown`. */
  drilldownIndicator?: boolean;
  /** Drag-and-drop row reordering. Indices passed to onReorderRow are
   *  positions in the currently-displayed (sortedRows) order. Callers
   *  should default-sort by their sequence column so the displayed
   *  indices match the underlying sequence. */
  onReorderRow?: (fromIdx: number, toIdx: number) => void;
}

function sortValue<Row>(col: Column<Row>, row: Row): unknown {
  if (typeof col.sortKey === "function") return col.sortKey(row);
  const k = (typeof col.sortKey === "string" ? col.sortKey : col.key) as keyof Row;
  return row[k];
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTable<Row extends DataTableRow>({
  cols, rows,
  filters,
  defaultSort,
  stickySort,
  getRowStyle,
  onAdd, addLabel,
  onRowClick,
  minWidth,
  emptyState,
  openId, renderDrilldown,
  drilldownIndicator,
  onReorderRow,
}: Props<Row>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort?.dir ?? "asc");
  // Active drag source/target indices for the reorderable mode. Source is
  // set on dragstart, target tracks the row currently hovered so we can
  // render a subtle drop indicator without clobbering existing row styles.
  const [dragSrc, setDragSrc] = useState<number | null>(null);
  const [dragTgt, setDragTgt] = useState<number | null>(null);
  const reorderable = !!onReorderRow;

  const showChevron = !!drilldownIndicator && !!renderDrilldown;
  const colTracks = cols.map((c) => c.width ?? "1fr").join(" ");
  const handlePrefix = reorderable ? "28px " : "";
  const grid = handlePrefix + colTracks + (showChevron ? " 36px" : "");

  const sortedRows = useMemo(() => {
    const out = [...rows];
    if (sortKey) {
      const col = cols.find((c) => {
        const k = typeof c.sortKey === "string" ? c.sortKey : c.key;
        return k === sortKey;
      });
      if (col) {
        out.sort((a, b) => {
          const cmp = compareValues(sortValue(col, a), sortValue(col, b));
          return sortDir === "desc" ? -cmp : cmp;
        });
      }
    }
    if (stickySort) out.sort(stickySort);
    return out;
  }, [rows, sortKey, sortDir, cols, stickySort]);

  const handleSort = (col: Column<Row>) => {
    if (!col.sortable) return;
    const k = typeof col.sortKey === "string" ? col.sortKey : col.key;
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const totalCount = rows.length;
  const shownCount = sortedRows.length;

  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      overflow: "hidden",
    }}>
      {filters && (
        <Toolbar
          filters={filters}
          shownCount={shownCount} totalCount={totalCount}
        />
      )}

      <div style={{ overflowX: minWidth ? "auto" : "visible" }}>
        <div style={{
          // When minWidth is set: inner fills the parent on wide
          // viewports (so the header underline and column tracks span
          // the full available width), but min-width enforces a floor
          // — when the parent is narrower than minWidth, the inner is
          // forced wider than the parent and the overflow-x: auto
          // wrapper above renders a scrollbar.
          //
          // Without minWidth: width: auto is parent-width as usual.
          width: minWidth ? "100%" : "auto",
          minWidth: minWidth ?? "auto",
        }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 14,
            padding: "10px 16px",
            borderBottom: "1px solid var(--rule-strong)",
            background: "var(--paper-2)",
            fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
            letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            {reorderable && <div aria-hidden="true"/>}
            {cols.map((c) => {
              const k = typeof c.sortKey === "string" ? c.sortKey : c.key;
              const sorted = sortKey === k;
              const justify = c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start";
              const ariaSort: "ascending" | "descending" | "none" | undefined = c.sortable
                ? (sorted ? (sortDir === "asc" ? "ascending" : "descending") : "none")
                : undefined;
              return (
                <div
                  key={c.key}
                  role="columnheader"
                  aria-sort={ariaSort}
                  style={{
                    color: sorted ? "var(--ink)" : "var(--ink-3)",
                    userSelect: "none",
                    display: "flex", justifyContent: justify, alignItems: "baseline",
                  }}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(c)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "inline-flex", alignItems: "baseline",
                        font: "inherit", color: "inherit",
                        letterSpacing: "inherit", textTransform: "inherit",
                      }}
                    >
                      <span>{c.label}</span>
                      <SortCaret dir={sorted ? sortDir : null}/>
                    </button>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </div>
              );
            })}
            {showChevron && <div/>}
          </div>

          {/* Body */}
          {sortedRows.length === 0 ? (
            <div style={{
              padding: "32px 16px", textAlign: "center",
              fontSize: 12.5, color: "var(--ink-3)",
            }}>
              {emptyState ?? "No rows match the current filters."}
            </div>
          ) : (
            sortedRows.map((r, i) => {
              const custom = getRowStyle?.(r, i, sortedRows) ?? null;
              const flagged = !!r.flag;
              const bg = custom?.bg ??
                (flagged ? "var(--warn-tint)" : "var(--paper)");
              const accent = custom?.accent ??
                (flagged ? "3px solid var(--warn)" : "3px solid transparent");
              const isOpen = openId != null && r.id === openId;
              const interactive = !!onRowClick || !!renderDrilldown;
              const restingBg = (custom?.style as CSSProperties | undefined)?.background as string | undefined
                ?? bg;

              const drilldownId = renderDrilldown && r.id ? `drilldown-${r.id}` : undefined;
              const isDragging = reorderable && dragSrc === i;
              const isDropTarget = reorderable && dragTgt === i && dragSrc !== null && dragSrc !== i;
              return (
                <div key={r.id ?? i} data-row-id={r.id}>
                  <div
                    draggable={reorderable || undefined}
                    onDragStart={reorderable ? (e) => {
                      setDragSrc(i);
                      e.dataTransfer.effectAllowed = "move";
                      // Firefox needs some data to actually start the drag.
                      e.dataTransfer.setData("text/plain", String(i));
                    } : undefined}
                    onDragOver={reorderable ? (e) => {
                      if (dragSrc === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragTgt !== i) setDragTgt(i);
                    } : undefined}
                    onDragLeave={reorderable ? () => {
                      if (dragTgt === i) setDragTgt(null);
                    } : undefined}
                    onDrop={reorderable ? (e) => {
                      e.preventDefault();
                      const from = dragSrc;
                      setDragSrc(null);
                      setDragTgt(null);
                      if (from === null || from === i) return;
                      onReorderRow?.(from, i);
                    } : undefined}
                    onDragEnd={reorderable ? () => {
                      setDragSrc(null);
                      setDragTgt(null);
                    } : undefined}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    onKeyDown={onRowClick ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(r);
                      }
                    } : undefined}
                    onMouseEnter={(e) => {
                      if (interactive && !isOpen) e.currentTarget.style.background = "var(--paper-2)";
                    }}
                    onMouseLeave={(e) => {
                      if (interactive && !isOpen) e.currentTarget.style.background = restingBg;
                    }}
                    role={onRowClick ? "button" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-expanded={renderDrilldown ? isOpen : undefined}
                    aria-controls={isOpen ? drilldownId : undefined}
                    style={{
                      display: "grid", gridTemplateColumns: grid, gap: 14,
                      padding: "10px 16px 10px 13px",
                      alignItems: "center",
                      borderTop: isDropTarget && dragSrc !== null && i < dragSrc
                        ? "2px solid var(--accent)" : undefined,
                      borderBottom: isDropTarget && dragSrc !== null && i > dragSrc
                        ? "2px solid var(--accent)"
                        : isOpen
                          ? "1px solid var(--accent)"
                          : i < sortedRows.length - 1 ? "1px solid var(--rule)" : "none",
                      background: isOpen ? "var(--paper-2)" : bg,
                      borderLeft: accent,
                      fontSize: 12.5,
                      cursor: onRowClick ? "pointer" : "default",
                      opacity: isDragging ? 0.45 : 1,
                      transition: "background 80ms",
                      ...(custom?.style ?? {}),
                    }}
                  >
                    {reorderable && (
                      <div
                        title="Drag to reorder"
                        aria-label="Drag to reorder"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--ink-2)", fontSize: 15, fontWeight: 700,
                          lineHeight: 1, letterSpacing: "-0.05em",
                          cursor: "grab", userSelect: "none",
                          fontFamily: "var(--ff-mono)",
                        }}
                      >⋮⋮</div>
                    )}
                    {cols.map((c) => {
                      const raw = (r as Record<string, unknown>)[c.key];
                      return (
                        <div key={c.key} style={{
                          textAlign: c.align ?? "left",
                          color: "var(--ink)",
                          overflow: "hidden", minWidth: 0,
                        }}>
                          {c.render
                            ? c.render(r)
                            : c.fmt
                              ? c.fmt(raw)
                              : (raw as ReactNode)}
                        </div>
                      );
                    })}
                    {showChevron && (
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <ExpandIndicator open={isOpen}/>
                      </div>
                    )}
                  </div>
                  {isOpen && renderDrilldown && (
                    <div
                      id={drilldownId}
                      role="region"
                      style={{
                        padding: "16px 20px",
                        background: "var(--paper-2)",
                        borderBottom: i < sortedRows.length - 1 ? "1px solid var(--rule)" : "none",
                      }}
                    >
                      {renderDrilldown(r)}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {onAdd && (
            <div style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--rule-strong)",
              background: "var(--paper-2)",
            }}>
              <AddRowButton label={addLabel ?? "Add row manually"} onClick={onAdd}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Pieces ----------

function SortCaret({ dir }: { dir: SortDir | null }) {
  if (!dir) return <span style={{ display: "inline-block", marginLeft: 4, opacity: 0.25, fontSize: 9 }}>▴▾</span>;
  return (
    <span style={{ display: "inline-block", marginLeft: 4, color: "var(--accent)", fontSize: 10, fontWeight: 700 }}>
      {dir === "asc" ? "▴" : "▾"}
    </span>
  );
}

function Toolbar({
  filters, shownCount, totalCount,
}: {
  filters?: FilterGroup[];
  shownCount: number;
  totalCount: number;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14,
      padding: "12px 16px",
      background: "var(--paper)",
      borderBottom: "1px solid var(--rule)",
    }}>
      {filters?.map((f) => <FilterChips key={f.id} f={f}/>)}
      <div style={{ flex: 1 }}/>
      {shownCount !== totalCount && (
        <div className="num" style={{
          fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap",
        }}>{shownCount} of {totalCount}</div>
      )}
    </div>
  );
}

function FilterChips({ f }: { f: FilterGroup }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {f.label && (
        <span className="mono" style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase", marginRight: 2,
        }}>{f.label}</span>
      )}
      <div style={{ display: "inline-flex", border: "1px solid var(--rule)", background: "var(--paper)" }}>
        {f.options.map((o, i) => {
          const active = o.value === f.value;
          return (
            <button
              key={o.value}
              onClick={() => f.onChange(o.value)}
              style={{
                padding: "4px 10px",
                fontSize: 12, fontWeight: active ? 600 : 500,
                color: active ? "var(--paper)" : "var(--ink-2)",
                background: active ? "var(--ink)" : "transparent",
                borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {o.label}
              {o.count != null && (
                <span style={{
                  marginLeft: 6, opacity: active ? 0.7 : 0.55,
                  fontSize: 10.5, fontWeight: 500,
                }}>{o.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Filter helpers (re-exported for callers) ----------

import { FEE_DEPTS, deptName } from "@/lib/data/departments";
import type { DeptCode } from "@/lib/types";

/** Build a department filter from a row set.
 *
 *  - Iterates in FEE_DEPTS order (canonical registry order) so chip
 *    layout is consistent across tables and survives switching demo
 *    workspaces. Departments with zero matching rows are omitted —
 *    chip set reflects the data actually present in the active
 *    jurisdiction.
 *  - Labels default to the dept registry's display name.
 *  - The optional `labels` argument overrides individual entries
 *    (e.g. for non-DeptCode field values like "SHARED:CDS"). */
export function deriveDeptFilter<Row>(
  rows: Row[],
  field: keyof Row = "dept" as keyof Row,
  labels: Record<string, string> = {},
) {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const d = String((r as Record<string, unknown>)[field as string] ?? "");
    if (d) counts[d] = (counts[d] ?? 0) + 1;
  }
  const options: FilterGroup["options"] = [{ value: "ALL", label: "All", count: rows.length }];
  for (const code of FEE_DEPTS) {
    const v = counts[code] ?? 0;
    if (v === 0) continue;
    options.push({ value: code, label: labels[code] ?? deptName(code as DeptCode), count: v });
    delete counts[code];
  }
  // Any other distinct values (e.g. "SHARED:CDS") append in insertion
  // order so callers' explicit labels still work.
  for (const [k, v] of Object.entries(counts)) {
    options.push({ value: k, label: labels[k] ?? k, count: v });
  }
  return options;
}

export function applyFilter<Row>(
  rows: Row[],
  field: keyof Row,
  value: string,
): Row[] {
  if (!value || value === "ALL") return rows;
  return rows.filter((r) => (r as Record<string, unknown>)[field as string] === value);
}
