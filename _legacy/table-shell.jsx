// =========================================================================
// TableShell — unified chrome for every table in Afferent.
//
// Visual contract (consistent across Salary, Services, CAP, Fee Schedule):
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ TITLE                       [chip] [chip] [chip]   N of M shown      │  ← TableToolbar
//   ├─────────────────────────────────────────────────────────────────────┤
//   │ COL ▴   COL    COL ▾    COL                                         │  ← Sortable header
//   ├─────────────────────────────────────────────────────────────────────┤
//   │ row …                                                                │
//   │ row …                                                                │
//   ├─────────────────────────────────────────────────────────────────────┤
//   │ + Add row manually                                  Footer note      │  ← optional footer
//   └─────────────────────────────────────────────────────────────────────┘
//
// Columns:
//   { key, label, width?, align?, sortable?, sortKey?, render(row), fmt(val) }
//   - `width` accepts CSS grid track values ("1fr", "120px", "minmax(220px,2fr)")
//   - `sortKey` is what to sort on; falls back to `key`. Or pass a function (row) => v.
//   - `render(row)` for custom cell content; otherwise row[key] is shown.
//
// Filters (optional, declarative):
//   filters: [{ id, label, options: [{value, label, count?}], value, onChange }]
//   - If options is omitted and `field` provided, options auto-derive from rows.
//
// Rows are filtered + sorted internally. The shell renders a count footer.
// The actual row chrome (background, border-left flag accent, padding) is
// controlled by `rowStyle(row, i, sortedRows)` so editable variants can tint
// flagged rows. By default, alternating row backgrounds are off — Afferent
// uses tinted rows for state, not zebra.
// =========================================================================

const { useState: uTS_state, useMemo: uTS_memo } = React;

// ----- helpers -----
function defaultGetSortVal(col, row) {
  if (typeof col.sortKey === "function") return col.sortKey(row);
  const k = col.sortKey || col.key;
  return row[k];
}
function compareVals(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// ----- Sort indicator -----
function SortCaret({ dir }) {
  if (!dir) return (
    <span style={{ display: "inline-block", marginLeft: 4, opacity: 0.25, fontSize: 9 }}>▴▾</span>
  );
  return (
    <span style={{ display: "inline-block", marginLeft: 4, color: "var(--accent)", fontSize: 10, fontWeight: 700 }}>
      {dir === "asc" ? "▴" : "▾"}
    </span>
  );
}

// ----- Filter chip group -----
// Filter looks like: [Filter label: All ▾ chip1 chip2 chip3]
// Compact, single line. Counts shown when provided.
function FilterChipGroup({ id, label, options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {label && (
        <span className="mono" style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase", marginRight: 2,
        }}>{label}</span>
      )}
      <div style={{ display: "inline-flex", border: "1px solid var(--rule)", background: "var(--paper)" }}>
        {options.map((o, i) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              style={{
                padding: "4px 10px",
                fontSize: 11.5, fontWeight: active ? 600 : 500,
                color: active ? "var(--paper)" : "var(--ink-2)",
                background: active ? "var(--ink)" : "transparent",
                borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
                cursor: "pointer", whiteSpace: "nowrap",
                fontFeatureSettings: '"tnum" 1',
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

// ----- Toolbar (title + filters + count) -----
function TableToolbar({ title, eyebrow, filters, shownCount, totalCount, sortLabel, extraRight }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", flexWrap: "wrap",
      gap: 14, padding: "12px 16px",
      background: "var(--paper)",
      borderBottom: "1px solid var(--rule)",
    }}>
      {(title || eyebrow) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginRight: 6, minWidth: 0 }}>
          {eyebrow && (
            <div className="mono" style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: "0.14em", lineHeight: 1.3,
              color: "var(--ink-3)", textTransform: "uppercase",
            }}>{eyebrow}</div>
          )}
          {title && (
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em", lineHeight: 1.3 }}>
              {title}
            </div>
          )}
        </div>
      )}
      {filters && filters.map(f => (
        <FilterChipGroup key={f.id} id={f.id} label={f.label} options={f.options} value={f.value} onChange={f.onChange}/>
      ))}
      <div style={{ flex: 1 }}/>
      {extraRight}
      {(shownCount != null && totalCount != null && shownCount !== totalCount) && (
        <div className="num" style={{
          fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap",
          fontFeatureSettings: '"tnum" 1',
        }}>
          {`${shownCount} of ${totalCount}`}
        </div>
      )}
    </div>
  );
}

// ----- The main shell -----
// Props:
//   title, eyebrow             — toolbar identity
//   cols                       — column defs (see top)
//   rows                       — input rows
//   filters                    — array of filter chip groups (see above)
//   defaultSort                — { key, dir } — sets initial sort
//   stickySort                 — function (a, b) — pre-sort applied BEFORE the user sort
//                                (e.g. flagged rows always float to top)
//   getRowStyle(row, i, sorted) — returns {} for default, or { bg, accent } overrides
//   onAdd, addLabel             — optional inline-add footer button
//   footerNote                 — small grey text at footer right
//   selectedId                  — highlight a row (string match against row.id)
//   onRowClick(row)             — click handler for each row
//   minWidth                    — when set, table scrolls horizontally below this
//   children                    — fallback content if rows is empty (otherwise an "—" placeholder)
function TableShell({
  title, eyebrow,
  cols, rows,
  filters,
  defaultSort,
  stickySort,
  getRowStyle,
  onAdd, addLabel,
  footerNote,
  selectedId, onRowClick,
  minWidth,
  emptyState,
  openId, onToggleOpen,
  renderDrilldown,
}) {
  const [sortKey, setSortKey] = uTS_state(defaultSort?.key || null);
  const [sortDir, setSortDir] = uTS_state(defaultSort?.dir || "asc");

  const grid = cols.map(c => c.width || "1fr").join(" ");

  // Sort
  const sortedRows = uTS_memo(() => {
    const out = [...(rows || [])];
    if (sortKey) {
      const col = cols.find(c => ((typeof c.sortKey === "string" ? c.sortKey : c.key) === sortKey));
      if (col) {
        out.sort((a, b) => {
          const va = defaultGetSortVal(col, a);
          const vb = defaultGetSortVal(col, b);
          const c = compareVals(va, vb);
          return sortDir === "desc" ? -c : c;
        });
      }
    }
    if (stickySort) {
      out.sort(stickySort);
    }
    return out;
  }, [rows, sortKey, sortDir, cols, stickySort]);

  const onSort = (col) => {
    if (!col.sortable) return;
    const k = (typeof col.sortKey === "string") ? col.sortKey : col.key;
    if (sortKey === k) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const totalCount = (rows || []).length;
  const shownCount = sortedRows.length;
  const sortLabel = sortKey ? (cols.find(c => ((typeof c.sortKey === "string" ? c.sortKey : c.key) === sortKey))?.label || sortKey).toString().toLowerCase() : null;

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", overflow: "hidden" }}>
      {(title || eyebrow || filters) && (
        <TableToolbar
          title={title}
          eyebrow={eyebrow}
          filters={filters}
          shownCount={shownCount}
          totalCount={totalCount}
          sortLabel={sortLabel}
        />
      )}

      <div style={{ overflowX: minWidth ? "auto" : "visible" }}>
        <div style={{ minWidth: minWidth || "auto" }}>
          {/* Column header */}
          <div style={{
            display: "grid", gridTemplateColumns: grid, gap: 14,
            padding: "10px 16px",
            borderBottom: "1px solid var(--rule-strong)",
            background: "var(--paper-2)",
            fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
            letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
          }}>
            {cols.map(c => {
              const k = (typeof c.sortKey === "string") ? c.sortKey : c.key;
              const isSorted = sortKey === k;
              return (
                <div
                  key={c.key}
                  onClick={c.sortable ? () => onSort(c) : undefined}
                  style={{
                    textAlign: c.align || "left",
                    cursor: c.sortable ? "pointer" : "default",
                    color: isSorted ? "var(--ink)" : "var(--ink-3)",
                    userSelect: "none",
                    display: "flex",
                    justifyContent: c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start",
                    alignItems: "baseline",
                  }}
                >
                  <span>{c.label}</span>
                  {c.sortable && <SortCaret dir={isSorted ? sortDir : null}/>}
                </div>
              );
            })}
          </div>

          {/* Body */}
          {sortedRows.length === 0 ? (
            <div style={{
              padding: "32px 16px", textAlign: "center",
              fontSize: 12.5, color: "var(--ink-3)",
            }}>
              {emptyState || "No rows match the current filters."}
            </div>
          ) : sortedRows.map((r, i) => {
            const customStyle = getRowStyle ? getRowStyle(r, i, sortedRows) : null;
            const flagged = !!r.flag;
            const selected = selectedId != null && r.id === selectedId;
            const bg = customStyle?.bg ||
              (flagged ? "var(--warn-tint)" :
               selected ? "var(--paper-2)" :
               "var(--paper)");
            const accent = customStyle?.accent ||
              (flagged ? "3px solid var(--warn)" :
               selected ? "3px solid var(--accent)" :
               "3px solid transparent");
            const isOpen = openId != null && r.id === openId;
            return (
              <React.Fragment key={r.id || i}>
                <div
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  style={{
                    display: "grid", gridTemplateColumns: grid, gap: 14,
                    padding: "10px 16px 10px 13px",
                    alignItems: "center",
                    borderBottom: isOpen ? "1px solid var(--accent)" : i < sortedRows.length - 1 ? "1px solid var(--rule)" : "none",
                    background: isOpen ? "var(--paper-2)" : bg, borderLeft: accent,
                    fontSize: 12.5,
                    cursor: onRowClick ? "pointer" : "default",
                    ...((customStyle && customStyle.style) || {}),
                  }}
                >
                  {cols.map(c => (
                    <div key={c.key} style={{
                      textAlign: c.align || "left",
                      color: "var(--ink)",
                      overflow: "hidden",
                      minWidth: 0,
                    }}>
                      {c.render ? c.render(r) :
                       c.fmt ? c.fmt(r[c.key]) :
                       r[c.key]}
                    </div>
                  ))}
                </div>
                {isOpen && renderDrilldown && (
                  <div style={{
                    padding: "16px 20px",
                    background: "var(--paper-2)",
                    borderBottom: i < sortedRows.length - 1 ? "1px solid var(--rule)" : "none",
                  }}>
                    {renderDrilldown(r)}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* Footer */}
          {(onAdd || footerNote) && (
            <div style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--rule-strong)",
              background: "var(--paper-2)",
              display: "flex", justifyContent: "space-between",
              alignItems: "center", gap: 14,
            }}>
              {onAdd ? (
                <button onClick={onAdd} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 12, fontWeight: 500, color: "var(--accent)",
                  padding: "4px 8px", border: "1px dashed var(--rule-strong)",
                  background: "var(--paper)",
                  cursor: "pointer",
                }}>
                  <Icon name="plus" size={12}/> {addLabel || "Add row manually"}
                </button>
              ) : <div/>}
              {footerNote && (
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{footerNote}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Convenience: derive filter options from a field with auto-counts.
// Returns [{value: "ALL", label: "All", count: total}, ...optionList]
function deriveDeptFilter(rows, deptField = "dept", labels = { PLAN: "Planning", BLDG: "Building", ENG: "Engineering" }) {
  const counts = {};
  for (const r of rows) {
    const d = r[deptField];
    if (d) counts[d] = (counts[d] || 0) + 1;
  }
  const options = [{ value: "ALL", label: "All", count: rows.length }];
  for (const [k, v] of Object.entries(counts)) {
    options.push({ value: k, label: labels[k] || k, count: v });
  }
  return options;
}

// Filter rows by a field value, where "ALL" means no filter.
function applyFilter(rows, field, value) {
  if (!value || value === "ALL") return rows;
  return rows.filter(r => r[field] === value);
}

Object.assign(window, {
  TableShell, FilterChipGroup, TableToolbar,
  deriveDeptFilter, applyFilter,
});
