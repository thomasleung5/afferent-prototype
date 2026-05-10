// screens-cost-of-service.jsx — NBS-style Cost of Service page.
//
// Three layers, in order:
//   ① Rate Derivation        Direct $/hr  +  CAP $/hr  =  Fully Burdened $/hr
//   ② Cost of Service        Hours × FBHR = Total cost. Annual = Total × Volume.
//   ③ Row-level audit trail  Service → Rate → CAP pools → Drivers
//
// The trail terminates at primary inputs:
//   Salary module   → direct $/hr, productive hours
//   CAP module      → allocated $ per direct department, broken down by pool & basis
//   Services module → hours and volume per service
//
// No overhead %. No multipliers. CAP flows as $ → $/hr → applied to hours.

const { useState: uSC, useMemo: uMC } = React;

// =========================================================================
// Local helpers
// =========================================================================

// Dept display name resolved from CAP model (the single source of truth for
// department metadata).
function deptName(capModel, deptId) {
  const list = capModel?.departments || capModel?.depts || capModel?.directDepts || [];
  const d = list.find((x) => x.id === deptId);
  return d?.name || deptId;
}

// Tiny inline pill for source attribution
function SourcePill({ children, tone = "default" }) {
  const colors = {
    default: { bg: "var(--paper-2)", fg: "var(--ink-3)", border: "var(--rule)" },
    cap: { bg: "var(--paper-2)", fg: "var(--accent)", border: "var(--rule)" },
    salary: { bg: "var(--paper-2)", fg: "var(--ink-2)", border: "var(--rule)" }
  }[tone];
  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 6px",
      fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
      color: colors.fg, background: colors.bg, border: `1px solid ${colors.border}`,
      whiteSpace: "nowrap"
    }}>{children}</span>);

}

// Formula chip: a small monospace expression with optional equals
function FormulaInline({ children }) {
  return (
    <span className="mono" style={{
      fontSize: 11.5, color: "var(--ink-2)",
      background: "var(--paper-2)", padding: "2px 6px",
      border: "1px solid var(--rule)",
      whiteSpace: "nowrap"
    }}>{children}</span>);

}

// =========================================================================
// SECTION 1 — Rate Derivation
// =========================================================================
function RateDerivationTable({ model, capModel, onPickDept, pickedDept }) {
  const directDepts = capModel?.directDepts || [];
  const [sortKey, setSortKey] = uSC("deptName");
  const [sortDir, setSortDir] = uSC("asc");
  const onSort = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };
  // Only show depts the salary model actually has (fee-modeled depts).
  // FBHR map is keyed by short codes used in the salary store: PLAN/BLDG/ENG.
  const rows = uMC(() => {
    const out = directDepts.
    filter((d) => model.fbhr[d.id]).
    map((d) => {
      const f = model.fbhr[d.id];
      const oh = capModel?.deptOH?.[d.id];
      return {
        deptId: d.id,
        deptName: d.name,
        direct: f.directFBHR,
        operating: f.operatingRate || 0,
        operatingDollars: f.operating || 0,
        cap: f.indirectRate,
        fbhr: f.fbhr,
        productiveHours: f.productiveHours,
        allocatedCAP: oh?.allocatedCAP || 0
      };
    });
    out.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      let c = 0;
      if (typeof va === "number" && typeof vb === "number") c = va - vb;
      else c = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "desc" ? -c : c;
    });
    return out;
  }, [directDepts, model.fbhr, capModel?.deptOH, sortKey, sortDir]);

  const COLS = [
    { key: "deptName",        label: "Department",         w: "minmax(220px, 2fr)", align: "left",  sortable: true },
    { key: "direct",          label: "Direct labor $/hr",  w: "150px", align: "right", sortable: true },
    { key: "operating",       label: "Operating $/hr",     w: "130px", align: "right", sortable: true },
    { key: "cap",             label: "Overhead $/hr",      w: "130px", align: "right", sortable: true },
    { key: "fbhr",            label: "FBHR",               w: "110px", align: "right", sortable: true },
    { key: "productiveHours", label: "Prod hrs/yr",        w: "110px", align: "right", sortable: true },
    { key: "_chev",           label: "",                   w: "36px",  align: "right", sortable: false },
  ];
  const grid = COLS.map(c => c.w).join(" ");

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
      {/* Toolbar */}
      <window.TableToolbar
        title="Fully Burdened Hourly Rate by Department"
        shownCount={rows.length}
        totalCount={rows.length}
      />

      {/* Column headers (sortable) */}
      <div style={{
        display: "grid", gridTemplateColumns: grid, gap: 28,
        padding: "9px 16px",
        background: "var(--paper-2)", borderBottom: "1px solid var(--rule)",
        fontSize: 11, fontWeight: 600,
        letterSpacing: "0.04em", color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {COLS.map(c => {
          const isSorted = sortKey === c.key;
          return (
            <div key={c.key}
              onClick={c.sortable ? () => onSort(c.key) : undefined}
              style={{
                textAlign: c.align,
                cursor: c.sortable ? "pointer" : "default",
                color: isSorted ? "var(--ink)" : "var(--ink-3)",
                userSelect: "none",
                display: "flex",
                justifyContent: c.align === "right" ? "flex-end" : "flex-start",
                alignItems: "baseline",
              }}>
              <span>{c.label}</span>
              {c.sortable && (isSorted
                ? <span style={{ marginLeft: 4, color: "var(--accent)", fontSize: 10, fontWeight: 700 }}>{sortDir === "asc" ? "▴" : "▾"}</span>
                : <span style={{ marginLeft: 4, opacity: 0.25, fontSize: 9 }}>▴▾</span>)}
            </div>
          );
        })}
      </div>

      {/* Rows */}
      {rows.length === 0 ?
      <div style={{ padding: "20px 16px", color: "var(--ink-4)", fontSize: 12 }}>
          No salaried departments yet — add positions in the Salary module.
        </div> :
      rows.map((r, i) => {
        const isOpen = pickedDept === r.deptId;
        return (
          <React.Fragment key={r.deptId}>
            <div
              onClick={() => onPickDept?.(r.deptId)}
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                gap: 28,
                padding: "12px 16px",
                borderBottom: isOpen ? "1px solid var(--accent)" : i < rows.length - 1 ? "1px solid var(--rule)" : "none",
                alignItems: "center",
                cursor: onPickDept ? "pointer" : "default",
                background: isOpen ? "var(--paper-2)" : "transparent",
                transition: "background 100ms"
              }}
              onMouseEnter={(e) => {if (onPickDept && !isOpen) e.currentTarget.style.background = "var(--paper-2)";}}
              onMouseLeave={(e) => {if (!isOpen) e.currentTarget.style.background = "transparent";}}>
              
              <div style={{ minWidth: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <DeptChip code={r.deptId}/>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.deptName}</span>
              </div>
              <div style={{ textAlign: "right", fontFamily: "var(--ff-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                ${Math.round(r.direct)}
              </div>
              <div style={{ textAlign: "right", fontFamily: "var(--ff-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                ${Math.round(r.operating)}
              </div>
              <div style={{ textAlign: "right", fontFamily: "var(--ff-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                ${Math.round(r.cap)}
              </div>
              <div style={{
                textAlign: "right", fontFamily: "var(--ff-mono)", fontSize: 13,
                fontVariantNumeric: "tabular-nums"
              }}>
                ${Math.round(r.fbhr)}
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>/hr</span>
              </div>
              <div style={{
                textAlign: "right", fontFamily: "var(--ff-mono)", fontSize: 13,
                fontVariantNumeric: "tabular-nums"
              }}>
                {r.productiveHours.toFixed(0)}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{
                  display: "inline-block", fontSize: 9, color: "var(--ink-3)",
                  transform: isOpen ? "rotate(90deg)" : "none",
                  transition: "transform 100ms",
                  fontFamily: "var(--ff-mono)", lineHeight: 1,
                }}>▶</span>
              </div>
            </div>
            {isOpen &&
            <FBHRTrace
              row={r}
              capModel={capModel}
              model={model}
              isLast={i === rows.length - 1} />

            }
          </React.Fragment>);

      })}

      {/* Footnote */}
    </div>);

}

// =========================================================================
// SHARED — Drilldown shell. All three tables (FBHR, Cost of Service, Fee
// Schedule) use this same wrapper for visual consistency.
// =========================================================================
function DrilldownShell({ children, isLast }) {
  return (
    <div style={{
      padding: "20px 24px 22px",
      background: "var(--paper-2)",
      borderBottom: isLast ? "none" : "1px solid var(--rule)",
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 24
    }}>
      {children}
    </div>);

}

function DrilldownColumn({ marker, title, children }) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 10
      }}>
        {marker} {title}
      </div>
      {children}
    </div>);

}

// =========================================================================
// SECTION 1 — FBHR row drill-down (Direct → Operating+CAP → Pools)
// =========================================================================
function FBHRTrace({ row, capModel, model, isLast }) {
  const dept = capModel?.depts?.find((d) => d.id === row.deptId);
  const f = model.fbhr[row.deptId];
  const allocRows = (capModel?.allocRows || []).
  filter((r) => r.dept === row.deptId && r.allocated > 0.5).
  sort((a, b) => b.allocated - a.allocated);
  const totalCAP = allocRows.reduce((a, r) => a + r.allocated, 0);

  if (!f) return null;

  return (
    <DrilldownShell isLast={isLast}>
      {/* ① Direct labor rate */}
      <DrilldownColumn marker="①" title="Direct $/hr · from salary">
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 500 }}>{row.deptName}</div>
          <div style={{ color: "var(--ink-3)", fontSize: 11.5, marginTop: 2 }}>
            {row.deptId}
          </div>
        </div>
        <div style={{
          marginTop: 14, padding: "12px 14px", background: "var(--paper)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9
        }}>
          <div>salary + benefits:    <b>${Math.round(row.direct * row.productiveHours).toLocaleString()}</b></div>
          <div>÷ productive hours:   <b>{row.productiveHours.toFixed(0)}</b></div>
          <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
            direct $/hr = <b>${Math.round(row.direct)}</b>
          </div>
        </div>
      </DrilldownColumn>

      {/* ② Rate composition (mirror of ServiceTrace ②) */}
      <DrilldownColumn marker="②" title="Rate composition">
        <div style={{
          padding: "12px 14px", background: "var(--paper)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>direct $/hr</span>
            <b>${Math.round(row.direct)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>+ operating $/hr</span>
            <b>${Math.round(row.operating)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>+ cost allocation $/hr</span>
            <b>${Math.round(row.cap)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
            <span>FBHR</span>
            <b style={{ color: "var(--accent)" }}>${Math.round(row.fbhr)}</b>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          Operating + cost allocation = ${Math.round(row.operatingDollars + row.allocatedCAP).toLocaleString()} ÷ {row.productiveHours.toFixed(0)} hrs.
        </div>
        <div style={{
          marginTop: 14, padding: "12px 14px", background: "var(--paper)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>direct labor</span>
            <b>{fmt.dollars(Math.round(row.direct * row.productiveHours))}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>+ operating</span>
            <b>{fmt.dollars(Math.round(row.operatingDollars))}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>+ cost allocation</span>
            <b>{fmt.dollars(Math.round(row.allocatedCAP))}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
            <span>total cost</span>
            <b>{fmt.dollars(Math.round(row.direct * row.productiveHours + row.operatingDollars + row.allocatedCAP))}</b>
          </div>
        </div>
      </DrilldownColumn>

      {/* ③ Cost allocation pools feeding this rate */}
      <DrilldownColumn marker="③" title="Cost allocation pools feeding this rate">
        {!capModel ?
        <div style={{ color: "var(--ink-4)", fontSize: 12 }}>Cost allocation engine not loaded</div> :

        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 11.5, lineHeight: 1.5
        }}>
            {allocRows.slice(0, 6).map((ar, i) =>
          <div key={ar.poolId} style={{
            display: "flex", justifyContent: "space-between",
            gap: 10, padding: "7px 12px",
            borderBottom: i < Math.min(allocRows.length, 6) - 1 ? "1px solid var(--rule)" : "none",
            alignItems: "baseline"
          }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  {ar.poolName}
                  <span style={{ color: "var(--ink-4)", marginLeft: 5 }}>· {ar.basis}</span>
                </span>
                <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{fmt.dollarsK(ar.allocated)}</span>
              </div>
          )}
            {allocRows.length > 6 &&
          <div style={{ padding: "7px 12px", color: "var(--ink-4)", fontSize: 10.5 }}>
                + {allocRows.length - 6} smaller pools
              </div>
          }
            <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "10px 12px", borderTop: "2px solid var(--ink)",
            fontWeight: 700
          }}>
              <span>Total cost allocation → {dept?.name || row.deptName}</span>
              <span>{fmt.dollarsK(totalCAP)}</span>
            </div>
          </div>
        }
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="arrow-right" size={11} />
          <span>Drill further on the Cost allocation page to see drivers and pass-2 contributions.</span>
        </div>
      </DrilldownColumn>
    </DrilldownShell>);

}

// =========================================================================
// SECTION 2 — Cost of Service (primary table)
// =========================================================================
function CostOfServiceTable({ model, capModel, expandedId, setExpandedId }) {
  const allRows = model.services;
  const [deptFilter, setDeptFilter] = uSC("ALL");
  const [sortKey, setSortKey] = uSC(null);
  const [sortDir, setSortDir] = uSC("asc");
  const onSort = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const deptOptions = uMC(() => {
    const counts = {};
    for (const r of allRows) counts[r.dept] = (counts[r.dept] || 0) + 1;
    const labels = { PLAN: "Planning", BLDG: "Building", ENG: "Engineering" };
    const opts = [{ value: "ALL", label: "All", count: allRows.length }];
    for (const [k, v] of Object.entries(counts)) {
      opts.push({ value: k, label: labels[k] || k, count: v });
    }
    return opts;
  }, [allRows]);

  const rows = uMC(() => {
    let out = deptFilter === "ALL" ? [...allRows] : allRows.filter(r => r.dept === deptFilter);
    if (sortKey) {
      out.sort((a, b) => {
        let va, vb;
        if (sortKey === "fbhr") {
          va = model.fbhr[a.dept]?.fbhr || 0;
          vb = model.fbhr[b.dept]?.fbhr || 0;
        } else if (sortKey === "annual") {
          va = (a.cost || 0) * (a.volume || 0);
          vb = (b.cost || 0) * (b.volume || 0);
        } else {
          va = a[sortKey]; vb = b[sortKey];
        }
        let c = 0;
        if (typeof va === "number" && typeof vb === "number") c = va - vb;
        else c = String(va).localeCompare(String(vb), undefined, { numeric: true });
        return sortDir === "desc" ? -c : c;
      });
    }
    return out;
  }, [allRows, deptFilter, sortKey, sortDir, model.fbhr]);

  const COLS = [
    { key: "name",   label: "Service",    w: "minmax(220px, 2fr)", align: "left",  sortable: true },
    { key: "dept",   label: "Dept",       w: "80px",               align: "left",  sortable: true },
    { key: "hours",  label: "Hours",      w: "60px",               align: "right", sortable: true },
    { key: "fbhr",   label: "FBHR",       w: "110px",              align: "right", sortable: true },
    { key: "cost",   label: "Total cost", w: "110px",              align: "right", sortable: true },
    { key: "volume", label: "Vol/yr",     w: "90px",               align: "right", sortable: true },
    { key: "annual", label: "Annual",     w: "110px",              align: "right", sortable: true },
    { key: "_chev",  label: "",           w: "36px",               align: "right", sortable: false },
  ];
  const grid = COLS.map(c => c.w).join(" ");

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
      {/* Toolbar */}
      <window.TableToolbar
        title="Cost of Service"
        filters={[{
          id: "dept", label: "Dept", options: deptOptions,
          value: deptFilter, onChange: setDeptFilter,
        }]}
        shownCount={rows.length}
        totalCount={allRows.length}
      />

      {/* Column headers (sortable) */}
      <div style={{
        display: "grid", gridTemplateColumns: grid, gap: 10,
        padding: "10px 18px",
        background: "var(--paper-2)", borderBottom: "1px solid var(--rule-strong)",
        fontFamily: "var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
        letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {COLS.map(c => {
          const isSorted = sortKey === c.key;
          return (
            <div key={c.key}
              onClick={c.sortable ? () => onSort(c.key) : undefined}
              style={{
                textAlign: c.align,
                cursor: c.sortable ? "pointer" : "default",
                color: isSorted ? "var(--ink)" : "var(--ink-3)",
                userSelect: "none",
                display: "flex",
                justifyContent: c.align === "right" ? "flex-end" : "flex-start",
                alignItems: "baseline",
              }}>
              <span>{c.label}</span>
              {c.sortable && (isSorted
                ? <span style={{ marginLeft: 4, color: "var(--accent)", fontSize: 10, fontWeight: 700 }}>{sortDir === "asc" ? "▴" : "▾"}</span>
                : <span style={{ marginLeft: 4, opacity: 0.25, fontSize: 9 }}>▴▾</span>)}
            </div>
          );
        })}
      </div>

      {/* Rows */}
      {rows.map((r, i) => {
        const open = expandedId === r.id;
        const f = model.fbhr[r.dept];
        const total = r.cost;
        const annual = total * (r.volume || 0);
        return (
          <React.Fragment key={r.id}>
            <div onClick={() => setExpandedId(open ? null : r.id)} style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 2fr) 80px 60px 110px 110px 90px 110px 36px",
              gap: 10,
              padding: "11px 18px",
              borderBottom: open ? "1px solid var(--accent)" : i < rows.length - 1 ? "1px solid var(--rule)" : "none",
              alignItems: "center",
              cursor: "pointer",
              background: open ? "var(--paper-2)" : "transparent",
              transition: "background 100ms"
            }}
            onMouseEnter={(e) => {if (!open) e.currentTarget.style.background = "var(--paper-2)";}}
            onMouseLeave={(e) => {if (!open) e.currentTarget.style.background = "transparent";}}>
              
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{r.id}</div>
              </div>
              <div>
                <DeptChip code={r.dept} />
              </div>
              <div className="num" style={{ textAlign: "right", fontSize: 12.5 }}>
                {r.hours}
              </div>
              <div className="num" style={{ textAlign: "right", fontSize: 12.5 }}>
                ${f ? Math.round(f.fbhr) : "—"}
              </div>
              <div className="num" style={{ textAlign: "right", fontSize: 12.5 }}>
                {fmt.dollars(total)}
              </div>
              <div className="num" style={{ textAlign: "right", fontSize: 12.5 }}>
                {r.volume}
              </div>
              <div className="num" style={{ textAlign: "right", fontSize: 12.5 }}>
                {fmt.dollarsK(annual)}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{
                  display: "inline-block", fontSize: 9, color: open ? "var(--accent)" : "var(--ink-3)",
                  transform: open ? "rotate(90deg)" : "none",
                  transition: "transform 100ms",
                  fontFamily: "var(--ff-mono)", lineHeight: 1,
                }}>▶</span>
              </div>
            </div>

            {open && f &&
            <ServiceTrace row={r} f={f} capModel={capModel} model={model}
            isLast={i === rows.length - 1} />
            }
          </React.Fragment>);

      })}
    </div>);

}

// =========================================================================
// SECTION 3 — Row drill-down (full audit trail)
// =========================================================================
function ServiceTrace({ row, f, capModel, model, isLast }) {
  const allocRows = (capModel?.allocRows || []).
  filter((r) => r.dept === row.dept && r.allocated > 0.5).
  sort((a, b) => b.allocated - a.allocated);
  const totalCAPForDept = allocRows.reduce((a, r) => a + r.allocated, 0);
  const totalDirectLabor = Math.round(row.hours * f.directFBHR);
  const totalOperating = Math.round(row.hours * (f.operatingRate || 0));
  const totalCAPCost = Math.round(row.hours * f.indirectRate);
  const total = Math.round(row.hours * f.fbhr);
  const annual = total * (row.volume || 0);

  return (
    <DrilldownShell isLast={isLast}>
      {/* Column 1 — Service → Hours → FBHR */}
      <DrilldownColumn marker="①" title="Service · Hours · Rate">
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 500 }}>{row.name}</div>
          <div style={{ color: "var(--ink-3)", fontSize: 11.5, marginTop: 2 }}>
            {row.id} · {deptName(capModel, row.dept)}
          </div>
        </div>
        <div style={{
          marginTop: 14, padding: "12px 14px", background: "var(--paper)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9
        }}>
          <div>hours per unit:        <b>{row.hours}</b></div>
          <div>fully burdened rate:   <b style={{ color: "var(--accent)" }}>${Math.round(f.fbhr)}/hr</b></div>
          <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
            unit cost = <b>{fmt.dollars(total)}</b>
          </div>
          <div>× volume <b>{row.volume}</b>/yr</div>
          <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
            annual = <b>{fmt.dollars(annual)}</b>
          </div>
        </div>
      </DrilldownColumn>

      {/* Column 2 — FBHR composition (Direct + CAP $/hr) */}
      <DrilldownColumn marker="②" title="Rate composition">
        <div style={{
          padding: "12px 14px", background: "var(--paper)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>direct $/hr</span>
            <b>${Math.round(f.directFBHR)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>+ operating $/hr</span>
            <b>${Math.round(f.operatingRate || 0)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>+ cost allocation $/hr</span>
            <b>${Math.round(f.indirectRate)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
            <span>FBHR</span>
            <b style={{ color: "var(--accent)" }}>${Math.round(f.fbhr)}</b>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          Operating + cost allocation = ${Math.round((f.operating || 0) + totalCAPForDept).toLocaleString()} ÷ {f.productiveHours.toFixed(0)} hrs.
        </div>
        <div style={{
          marginTop: 14, padding: "12px 14px", background: "var(--paper)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>direct labor</span>
            <b>{fmt.dollars(totalDirectLabor)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>+ operating</span>
            <b>{fmt.dollars(totalOperating)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--ink-3)" }}>+ cost allocation</span>
            <b>{fmt.dollars(totalCAPCost)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
            <span>total cost</span>
            <b>{fmt.dollars(totalDirectLabor + totalOperating + totalCAPCost)}</b>
          </div>
        </div>
      </DrilldownColumn>

      {/* Column 3 — Cost allocation pool sources (top contributors) */}
      <DrilldownColumn marker="③" title="Cost allocation pools feeding this rate">
        {!capModel ?
        <div style={{ color: "var(--ink-4)", fontSize: 12 }}>Cost allocation engine not loaded</div> :

        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)", fontSize: 11.5, lineHeight: 1.5
        }}>
            {allocRows.slice(0, 6).map((ar, i) =>
          <div key={ar.poolId} style={{
            display: "flex", justifyContent: "space-between",
            gap: 10, padding: "7px 12px",
            borderBottom: i < Math.min(allocRows.length, 6) - 1 ? "1px solid var(--rule)" : "none",
            alignItems: "baseline"
          }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  {ar.poolName}
                  <span style={{ color: "var(--ink-4)", marginLeft: 5 }}>· {ar.basis}</span>
                </span>
                <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{fmt.dollarsK(ar.allocated)}</span>
              </div>
          )}
            {allocRows.length > 6 &&
          <div style={{ padding: "7px 12px", color: "var(--ink-4)", fontSize: 10.5 }}>
                + {allocRows.length - 6} smaller pools
              </div>
          }
            <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "10px 12px", borderTop: "2px solid var(--ink)",
            fontWeight: 700
          }}>
              <span>Total cost allocation → {deptName(capModel, row.dept)}</span>
              <span>{fmt.dollarsK(totalCAPForDept)}</span>
            </div>
          </div>
        }
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="arrow-right" size={11} />
          <span>Drill further on the Cost allocation page to see drivers and pass-2 contributions.</span>
        </div>
      </DrilldownColumn>
    </DrilldownShell>);

}

// =========================================================================
// SECTION 4 — Persistent traceability footer
// =========================================================================
function TraceabilityFooter({ model, capModel }) {
  const t = capModel?.totals || { totalCAP: 0, totalAllocated: 0, unallocated: 0 };
  const balanced = Math.abs(t.unallocated) < 1;
  const totalServices = model.services.length;
  const totalAnnual = model.services.reduce((a, s) => a + s.cost * (s.volume || 0), 0);

  return (
    <div style={{
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      padding: "16px 20px",
      display: "grid",
      gridTemplateColumns: "minmax(220px, 1fr) repeat(3, auto)",
      gap: 24,
      alignItems: "center"
    }}>
      <div>
        <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--ink-2)", textTransform: "uppercase" }}>
          Every number is traceable to source inputs
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.5 }}>
          Fee → Service → FBHR → Cost allocation $ → Pools → Drivers → Salary &amp; Budget inputs.
        </div>
      </div>
      <div>
        <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>
          Services
        </div>
        <div className="num" style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--ff-mono)" }}>
          {totalServices}
        </div>
      </div>
      <div>
        <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>
          Annualized cost
        </div>
        <div className="num" style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--ff-mono)" }}>
          {fmt.dollarsK(totalAnnual)}
        </div>
      </div>
      <div>
        <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>
          Cost allocation conservation
        </div>
        <div className="num" style={{
          fontSize: 13, fontWeight: 600, fontFamily: "var(--ff-mono)",
          color: balanced ? "var(--pos)" : "var(--neg)"
        }}>
          {balanced ? "✓ Balanced" : `Δ ${fmt.dollars(t.unallocated)}`}
        </div>
      </div>
    </div>);

}

// =========================================================================
// PAGE
// =========================================================================
// =========================================================================
// Compute flags for the Cost of Service screen — actionable, prioritized.
// Critical = blocks defensible numbers. Warn = look at it. Info = FYI.
// =========================================================================
function computeCostFlags(model, capModel) {
  const flags = [];
  const services = model.services || [];
  const totals = model.totals || {};
  const recovery = totals.totalCost > 0 ? totals.currentRev / totals.totalCost * 100 : 0;

  // Missing cost calculations
  const uncosted = services.filter((s) => !s.calculated);
  if (uncosted.length > 0) {
    flags.push({
      id: "uncosted",
      severity: "critical",
      label: `${uncosted.length} service${uncosted.length > 1 ? "s" : ""} have no computed cost — rate build-up incomplete.`,
      impact: `${uncosted.length} svc`,
      action: "Resolve"
    });
  }

  // CAP allocation imbalance
  if (capModel) {
    const t = capModel.totals || {};
    const unallocated = Math.abs(t.unallocated || 0);
    if (unallocated > 1) {
      flags.push({
        id: "cap-unbalanced",
        severity: "critical",
        label: `Cost allocation off by ${fmt.dollarsK(unallocated)} — matrix isn't balanced.`,
        impact: fmt.dollarsK(unallocated),
        action: "Open Cost allocation",
        onClick: () => window.AFFERENT_NAV && window.AFFERENT_NAV("build-cap")
      });
    }
  }

  // Recovery gap > $1M citywide
  const gap = (totals.totalCost || 0) - (totals.currentRev || 0);
  if (gap > 1_000_000) {
    flags.push({
      id: "high-gap",
      severity: "warn",
      label: `Citywide recovery is ${recovery.toFixed(0)}% — significantly below 100% target.`,
      impact: `${fmt.dollarsK(gap)}/yr`,
      action: "Review fee schedule",
      onClick: () => window.AFFERENT_NAV && window.AFFERENT_NAV("fees")
    });
  }

  // Single dept under 50%
  Object.values(model.byDept || {}).forEach((d) => {
    if (d.recovery < 50 && d.totalCost > 100_000) {
      const DEPT_LABELS = { PLAN: "Planning", BLDG: "Building", ENG: "Engineering" };
      flags.push({
        id: `dept-low-${d.dept}`,
        severity: "warn",
        label: `${DEPT_LABELS[d.dept] || d.dept} is recovering only ${d.recovery.toFixed(0)}% of cost.`,
        impact: `${fmt.dollarsK(d.totalCost - d.currentRev)}/yr`,
        action: "Review dept fees",
        onClick: () => window.AFFERENT_NAV && window.AFFERENT_NAV("fees")
      });
    }
  });

  // CAP > 50% of cost — driver risk
  const totalDirect = Object.values(model.salary || {}).reduce((a, d) => a + (d.direct || 0), 0);
  const totalCAP = model.cap?.totalRecoverable || 0;
  const totalOp = model.operating?.totalIncluded || 0;
  const totalCost = totalDirect + totalCAP + totalOp;
  if (totalCost > 0 && totalCAP / totalCost > 0.50) {
    flags.push({
      id: "cap-dominant",
      severity: "info",
      label: `Cost allocation is ${(totalCAP / totalCost * 100).toFixed(0)}% of cost build-up — verify allocation matrix and drivers.`,
      action: "Open Cost allocation",
      onClick: () => window.AFFERENT_NAV && window.AFFERENT_NAV("build-cap")
    });
  }

  return flags;
}

function CostOfServiceScreen() {
  const model = window.AFFERENT_ENGINE.useModel();
  const CAP = window.AFFERENT_CAP;
  const capModel = CAP ? CAP.useCAPModel() : null;

  const [pickedDept, setPickedDept] = uSC(null);
  const [expandedServiceId, setExpandedServiceId] = uSC(null);

  // Augment capModel with driver lookups for the trace panel
  const capWithDrivers = uMC(() => {
    if (!capModel) return null;
    const driversById = capModel.drivers; // already keyed by deptId
    const driverTotalsByBasis = {};
    (capModel.bases || []).forEach((b) => {
      driverTotalsByBasis[b.id] = (capModel.depts || []).reduce(
        (a, d) => a + (capModel.drivers?.[d.id]?.[b.id] || 0), 0
      );
    });
    return { ...capModel, driversById, driverTotalsByBasis };
  }, [capModel]);

  // Citywide cost driver totals (for DriverBreakdown)
  const drivers = uMC(() => {
    const direct = Object.values(model.salary || {}).reduce((a, d) => a + (d.direct || 0), 0);
    const cap = model.cap?.totalRecoverable || 0;
    const operating = model.operating?.totalIncluded || 0;
    return { direct, operating, cap };
  }, [model.salary, model.cap, model.operating]);

  const flags = uMC(() => computeCostFlags(model, capModel), [model, capModel]);

  // Headline metrics for decision gravity
  const totalCost = model.totals?.totalCost || 0;
  const currentRev = model.totals?.currentRev || 0;
  const gap = totalCost - currentRev;
  const recovery = totalCost > 0 ? (currentRev / totalCost) * 100 : 0;
  const criticalCount = flags.filter(f => f.severity === "critical").length;
  const decisionStatus = criticalCount > 0
    ? { label: "Not yet defensible", sub: `${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} blocking sign-off` }
    : recovery < 80
    ? { label: "Defensible · low recovery", sub: "Numbers reconcile. Recovery below 80% — fee policy decisions required." }
    : { label: "Defensible", sub: "Numbers reconcile. Ready for council review." };

  // Top 5 service-level fee fixes by revenue impact
  const enrichedServices = uMC(() => {
    return (model.services || []).map((s) => {
      const recommended = s.cost * ((s.target || 100) / 100);
      const confidence = !s.calculated ? "low" : s.cost > 5000 ? "high" : "med";
      return { ...s, recommended, confidence };
    });
  }, [model.services]);

  return (
    <div className="page">
      <DecisionGravityHeader
        tier="analyze"
        eyebrow="Cost of Service"
        title="What does it cost — and what's the gap?"
        headline={fmt.dollarsK(gap)}
        headlineSub={
          <>
            Annual recovery gap. Total cost <b>{fmt.dollarsK(totalCost)}</b> against current revenue <b>{fmt.dollarsK(currentRev)}</b> — recovering <b>{recovery.toFixed(0)}%</b>. This is the convergence of every upstream input. Drill any row to source.
          </>
        }
        actions={<Btn kind="ghost"><Icon name="download" size={13} /> Export</Btn>}
      />

      {/* WHAT TO DO — issues to act on, only renders if non-empty. */}

      <RateDerivationTable
        model={model}
        capModel={capWithDrivers}
        pickedDept={pickedDept}
        onPickDept={(d) => setPickedDept(pickedDept === d ? null : d)} />
      

      <CostOfServiceTable
        model={model}
        capModel={capWithDrivers}
        expandedId={expandedServiceId}
        setExpandedId={setExpandedServiceId} />
    </div>);

}

Object.assign(window, {
  CostOfServiceScreen,
  DrilldownShell,
  DrilldownColumn
});