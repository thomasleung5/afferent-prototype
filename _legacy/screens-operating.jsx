// Operating Costs screen — Build Model · Step 4
// Department-direct non-labor costs (software, training, supplies, contracts, vehicles).
// Each line either includes in $/hr calc (default) or is greyed out for audit.
// Output: $/dept, then ÷ productive hours = Operating $/hr added to FBHR.

const { useState: uSO, useMemo: uMO } = React;
const { OPERATING_COSTS: SEED_OPERATING } = window.AFFERENT_EXT;

const OP_DEPT_LABEL = {
  PLAN: "Planning",
  BLDG: "Building",
  ENG:  "Engineering",
  "SHARED:CDS": "Shared (CDS)",
};

const OP_CATEGORIES = [
  "Software & subscriptions",
  "Professional services",
  "Training & travel",
  "Office & supplies",
  "Memberships & dues",
  "Vehicles & equipment",
  "Legal noticing",
  "Capital outlay",
  "Other",
];

// ---------- Compact dept chip used in table cells ----------
function OpDeptCell({ code }) {
  if (code && code.startsWith("SHARED")) {
    return (
      <span className="mono" style={{
        display:"inline-flex", alignItems:"center", gap: 4,
        padding:"2px 7px", border:"1px dashed var(--rule-strong)",
        background:"var(--paper-2)", fontSize: 10.5, fontWeight: 600,
        letterSpacing:"0.04em", color:"var(--ink-2)",
      }}>SHARED</span>
    );
  }
  return <DeptChip code={code}/>;
}

// ---------- Validation: surface soft warnings without blocking ----------
function useOperatingWarnings(rows, model) {
  return uMO(() => {
    const warnings = [];
    // Excluded items still flag if they have suspicious metadata
    const includedCount = rows.filter(r => r.include).length;
    if (includedCount === 0) {
      warnings.push({ severity: "high", text: "No operating lines included — Operating $/hr will be $0 across all departments." });
    }
    // Each fee dept should have at least one line
    ["PLAN", "BLDG", "ENG"].forEach(d => {
      const hasLine = rows.some(r => r.include && (r.dept === d || (r.dept || "").startsWith("SHARED")));
      if (!hasLine) warnings.push({ severity: "med", text: `${OP_DEPT_LABEL[d]} has no operating lines — only direct labor + CAP will load into its FBHR.` });
    });
    // Lines with no source
    rows.filter(r => r.include && !r.source).forEach(r => {
      warnings.push({ severity: "low", text: `Line "${r.line}" is missing a source citation.` });
    });
    // Dept ratio sanity check — operating > 50% of direct is unusual
    const fbhr = model.fbhr || {};
    Object.entries(fbhr).forEach(([d, f]) => {
      if (f.directFBHR > 0 && (f.operatingRate || 0) / f.directFBHR > 0.5) {
        warnings.push({ severity: "med", text: `${OP_DEPT_LABEL[d] || d}: Operating $/hr ($${Math.round(f.operatingRate)}) is more than half of direct $/hr ($${Math.round(f.directFBHR)}). Verify the lines included.` });
      }
    });
    return warnings;
  }, [rows, model.fbhr]);
}

function OperatingWarningsBanner({ warnings }) {
  if (warnings.length === 0) {
    return (
      <div style={{
        padding:"10px 14px", background:"var(--paper-2)", border:"1px solid var(--rule)",
        display:"flex", alignItems:"center", gap: 10, fontSize: 12, color:"var(--ink-2)",
      }}>
        <span style={{ width: 6, height: 6, borderRadius:"50%", background:"var(--pos)" }}/>
        Operating costs validation: <b style={{ color:"var(--ink)" }}>clean</b>. All fee-modeled depts have lines and sources.
      </div>
    );
  }
  const tone = warnings.some(w => w.severity === "high") ? "high" : warnings.some(w => w.severity === "med") ? "med" : "low";
  const color = tone === "high" ? "var(--neg)" : tone === "med" ? "var(--warn)" : "var(--ink-3)";
  return (
    <div style={{
      padding:"12px 14px", background:"var(--paper)", border:"1px solid var(--rule-strong)",
      borderLeft:`3px solid ${color}`,
      fontSize: 12.5, color:"var(--ink-2)",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 6 }}>
        <Icon name="alert" size={13} color={color}/>
        <b style={{ color:"var(--ink)" }}>{warnings.length} validation {warnings.length === 1 ? "note" : "notes"}</b>
        <span style={{ color:"var(--ink-3)", fontSize: 11.5 }}>· soft warnings, calc still runs</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
        {warnings.slice(0, 5).map((w, i) => (
          <li key={i} style={{ color: w.severity === "high" ? "var(--neg)" : w.severity === "med" ? "var(--warn)" : "var(--ink-3)" }}>
            <span style={{ color:"var(--ink-2)" }}>{w.text}</span>
          </li>
        ))}
        {warnings.length > 5 && <li style={{ color:"var(--ink-4)" }}>+ {warnings.length - 5} more</li>}
      </ul>
    </div>
  );
}

// ---------- INCLUDED vs EXCLUDED + CAP-belongs-elsewhere visual ----------
function IncludedExcludedBuckets({ includedTotal, excludedTotal, counts }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 12 }}>
      {/* Included bucket */}
      <div style={{
        background:"var(--paper)", border:"1px solid var(--rule)",
        borderTop:"3px solid var(--pos)",
        padding:"14px 16px", display:"flex", flexDirection:"column", gap: 8,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background:"var(--pos)" }}/>
          <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing:"0.12em", color:"var(--ink-2)", textTransform:"uppercase" }}>
            Included in $/hr
          </div>
        </div>
        <div className="num" style={{ fontSize: 22, fontWeight: 600, color:"var(--ink)" }}>
          {fmt.dollarsK(includedTotal)}
          <span style={{ fontSize: 12, color:"var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>· {counts.included} lines</span>
        </div>
        <div style={{ fontSize: 11.5, color:"var(--ink-2)", lineHeight: 1.5 }}>
          Department-direct non-labor — software licenses, contracts, training, supplies, vehicles. Flows into Operating $/hr.
        </div>
      </div>

      {/* Excluded bucket */}
      <div style={{
        background:"var(--paper-2)", border:"1px solid var(--rule)",
        borderTop:"3px solid var(--ink-3)",
        padding:"14px 16px", display:"flex", flexDirection:"column", gap: 8,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background:"var(--ink-3)", border:"1px dashed var(--ink-3)" }}/>
          <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing:"0.12em", color:"var(--ink-2)", textTransform:"uppercase" }}>
            Excluded (audit)
          </div>
        </div>
        <div className="num" style={{ fontSize: 22, fontWeight: 600, color:"var(--ink-3)" }}>
          {fmt.dollarsK(excludedTotal)}
          <span style={{ fontSize: 12, color:"var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>· {counts.excluded} lines</span>
        </div>
        <div style={{ fontSize: 11.5, color:"var(--ink-2)", lineHeight: 1.5 }}>
          Visible for audit but not in the rate — one-time items, capital outlay, pass-throughs, or items intentionally subsidized.
        </div>
      </div>

      {/* Belongs elsewhere — CAP guard */}
      <div style={{
        background:"var(--paper)", border:"1px dashed var(--rule-strong)",
        padding:"14px 16px", display:"flex", flexDirection:"column", gap: 8,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 2,
            background:"transparent", border:"1px dashed var(--ink-4)",
          }}/>
          <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase" }}>
            Belongs in CAP — not here
          </div>
        </div>
        <div style={{ fontSize: 12, color:"var(--ink-2)", lineHeight: 1.5 }}>
          IT, HR, Finance, Town Manager, Council, City Attorney, GIS, Building Maintenance.
          Citywide or shared services that benefit multiple departments. Enter these as cost pools in the CAP node.
        </div>
        <button
          onClick={() => window.AFFERENT_NAV && window.AFFERENT_NAV("build-cap")}
          style={{
            alignSelf:"flex-start", marginTop: 2,
            fontSize: 11.5, color:"var(--accent)", fontWeight: 500,
          }}
        >Open CAP node →</button>
      </div>
    </div>
  );
}

// ---------- Per-dept operating $/hr output panel ----------
function OperatingOutputPanel({ model }) {
  const depts = ["PLAN", "BLDG", "ENG"];
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
      <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--rule)", display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 600 }}>Calculated operating $ per productive hour</div>
        <div style={{ fontSize: 11.5, color:"var(--ink-3)" }}>Operating $ ÷ productive hrs · live</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)" }}>
        {depts.map(d => {
          const f = model.fbhr[d];
          if (!f) return <div key={d} style={{ padding: 18, color:"var(--ink-4)" }}>{OP_DEPT_LABEL[d]} — no positions</div>;
          return (
            <div key={d} style={{ padding:"18px 22px", borderRight: d !== "ENG" ? "1px solid var(--rule)" : "none" }}>
              <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
                <DeptChip code={d}/>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{OP_DEPT_LABEL[d]}</div>
              </div>
              <div className="display num" style={{ fontSize: 28, fontWeight: 600, letterSpacing:"-0.02em", color:"var(--accent)" }}>${Math.round(f.operatingRate || 0)}<span style={{ fontSize: 13, color:"var(--ink-3)", fontWeight: 400 }}> /hr</span></div>
              <div style={{ fontSize: 12, color:"var(--ink-2)", marginTop: 14, paddingTop: 14, borderTop:"1px solid var(--rule)", lineHeight: 1.55 }}>
                <div className="num">{fmt.dollarsK(f.operating || 0)} <span style={{ color:"var(--ink-3)" }}>operating $</span></div>
                <div className="num" style={{ marginTop: 2 }}>{f.productiveHours.toFixed(0).toLocaleString()} <span style={{ color:"var(--ink-3)" }}>productive hrs</span></div>
                <div style={{ marginTop: 6, fontSize: 11, color:"var(--ink-3)" }}>
                  Adds <span className="num" style={{ fontWeight: 600 }}>${Math.round(f.operatingRate || 0)}/hr</span> to FBHR <span className="num">${Math.round(f.fbhr)}/hr</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Page ----------
function OperatingCostsScreen() {
  const ENG = window.AFFERENT_ENGINE;
  const model = ENG.useModel();
  const operating = ENG.store.state.operating || [];

  // Stable per-row source meta so toggling include doesn't reshuffle visuals
  const meta = uMO(() => operating.map((o, i) => ({
    sourceKind: i < 3 ? "imported" : i < 8 ? "carry-forward" : "imported",
    sourceFile: i < 3 ? "FY 26-27 Budget book.pdf" : "FY 24-25 study workbook",
    sourceRow: 142 + i * 4,
  })), [operating.length]);

  const rows = operating.map((o, i) => ({
    id: o.id, idx: i, ...o, ...(meta[i] || {}),
  }));

  const updateCell = (id, key, value) => ENG.actions.updateOperating(id, { [key]: value });
  const removeRow  = (id) => ENG.actions.removeOperating(id);
  const toggleInc  = (id, cur) => ENG.actions.updateOperating(id, { include: !cur });
  const addRow = () => {
    const nextN = operating.length + 1;
    ENG.actions.addOperating({
      id: "OP-MAN-" + String(nextN).padStart(3, "0"),
      dept: "PLAN", category: "Other", line: "New operating line",
      amount: 0, source: "", include: true,
    });
  };

  const includedTotal = rows.filter(r => r.include).reduce((a, r) => a + (r.amount || 0), 0);
  const excludedTotal = rows.filter(r => !r.include).reduce((a, r) => a + (r.amount || 0), 0);

  // Filters — match Salary/Workload pattern
  const [deptFilter, setDeptFilter] = uSO("ALL");
  const [categoryFilter, setCategoryFilter] = uSO("ALL");
  const [includeFilter, setIncludeFilter] = uSO("ALL");

  const filteredRows = rows.filter(r => {
    if (deptFilter !== "ALL" && r.dept !== deptFilter) return false;
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
    if (includeFilter === "INC" && !r.include) return false;
    if (includeFilter === "EXC" && r.include) return false;
    return true;
  });

  const categoryCounts = {};
  rows.forEach(r => { categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1; });
  const categoryOptions = [
    { value: "ALL", label: "All", count: rows.length },
    ...OP_CATEGORIES.filter(c => categoryCounts[c]).map(c => ({ value: c, label: c, count: categoryCounts[c] })),
  ];

  const deptOptions = [
    { value: "ALL",        label: "All",        count: rows.length },
    { value: "PLAN",       label: "Planning",   count: rows.filter(r => r.dept === "PLAN").length },
    { value: "BLDG",       label: "Building",   count: rows.filter(r => r.dept === "BLDG").length },
    { value: "ENG",        label: "Engineering",count: rows.filter(r => r.dept === "ENG").length },
    { value: "SHARED:CDS", label: "Shared",     count: rows.filter(r => r.dept === "SHARED:CDS").length },
  ].filter(o => o.count > 0 || o.value === "ALL");

  const includeOptions = [
    { value: "ALL", label: "All", count: rows.length },
    { value: "INC", label: "Included", count: rows.filter(r => r.include).length },
    { value: "EXC", label: "Excluded", count: rows.filter(r => !r.include).length },
  ];

  // Per-dept rollups (incl. shared splits)
  const op = model.operating || { byDept: {}, totalIncluded: 0 };

  const counts = uMO(() => {
    const c = { included: 0, excluded: 0, edited: 0, flagged: 0 };
    rows.forEach(r => {
      if (r.include) c.included++;
      else c.excluded++;
      if (!r.source) c.flagged++;
    });
    return c;
  }, [rows]);

  const warnings = useOperatingWarnings(rows, model);

  return (
    <div className="page">
      <PageHeader
        eyebrow={<NodeEyebrow node="operating"/>}
        title="Operating"
        subtitle="Department non-labor spend."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      {/* Compact status row — replaces large KPI tiles */}
      {(() => {
        return (
          <StatusRow items={[
            `${rows.length} lines`,
            { value: warnings.length === 0 ? "Validated" : `${warnings.length} note${warnings.length === 1 ? "" : "s"}`, tone: warnings.length === 0 ? "pos" : "warn" },
            `${counts.included} included · ${counts.excluded} excluded`,
            `${fmt.dollarsK(includedTotal)} flowing into $/hr`,
            "FY 2026-27",
          ]}/>
        );
      })()}

      {/* ONE primary summary table — non-labor support costs */}
      {(() => {
        const depts = ["PLAN","BLDG","ENG"];
        const labelOf = d => d === "PLAN" ? "Planning" : d === "BLDG" ? "Building" : "Engineering";
        const tbRows = depts.map(d => {
          const f = model.fbhr[d];
          // Direct + shared lines that fall on this dept
          const direct = rows.filter(r => r.include && r.dept === d);
          const shared = rows.filter(r => r.include && (r.dept || "").startsWith("SHARED"));
          const directTotal = direct.reduce((a,r) => a + (r.amount || 0), 0);
          const opDollars   = f ? (f.operating || 0) : 0;
          const sharedAlloc = Math.max(0, opDollars - directTotal);
          const opRate      = f ? Math.round(f.operatingRate || 0) : 0;
          // Largest driver — biggest category contributing to dept op $
          const byCat = {};
          direct.forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + (r.amount || 0); });
          const sharedByCat = {};
          shared.forEach(r => { sharedByCat[r.category] = (sharedByCat[r.category] || 0) + (r.amount || 0); });
          const topCat = Object.entries(byCat).sort((a,b) => b[1] - a[1])[0];
          const driverLabel = topCat ? topCat[0] : "—";
          const driverPct   = topCat && opDollars > 0 ? Math.round(topCat[1] / opDollars * 100) : 0;

          return {
            key: d,
            cells: {
              dept: <span style={{ display:"inline-flex", alignItems:"center", gap: 8 }}><DeptChip code={d}/><span style={{ fontWeight: 500 }}>{labelOf(d)}</span></span>,
              opCost: fmt.dollarsK(opDollars),
              perHr: opRate > 0 ? `$${opRate}` : "—",
              driver: topCat ? <span><span style={{ color:"var(--ink)" }}>{driverLabel}</span><span style={{ color:"var(--ink-3)", marginLeft: 6 }}>{driverPct}%</span></span> : <span style={{ color:"var(--ink-3)" }}>—</span>,
            },
            drilldown: (() => {
              // Build a single ledger: dept-direct categories + shared allocation row
              const ledgerRows = Object.entries(byCat)
                .sort((a,b) => b[1] - a[1])
                .map(([cat, amt]) => ({
                  label: cat,
                  lines: direct.filter(r => r.category === cat).length,
                  amt,
                  shared: false,
                }));
              if (sharedAlloc > 0) {
                ledgerRows.push({
                  label: "Shared services allocation",
                  lines: shared.length,
                  amt: sharedAlloc,
                  shared: true,
                });
              }
              ledgerRows.sort((a,b) => b.amt - a.amt);
              const grid = "1fr 80px 80px 130px";
              const excluded = rows.filter(r => !r.include && (r.dept === d || (r.dept || "").startsWith("SHARED")));
              return (
                <div style={{ paddingTop: 8, display:"flex", flexDirection:"column", gap: 14 }}>
                  {/* Primary ledger — category-by-category composition */}
                  <div style={{ border:"1px solid var(--rule)", background:"var(--paper)" }}>
                    <div style={{
                      padding:"8px 12px", borderBottom:"1px solid var(--rule)",
                      background:"var(--paper-2)",
                      display:"grid", gridTemplateColumns: grid, gap: 12,
                      fontSize: 10, fontWeight: 600, letterSpacing:"0.08em",
                      color:"var(--ink-3)", textTransform:"uppercase",
                    }}>
                      <div>Category</div>
                      <div style={{ textAlign:"right" }}>Lines</div>
                      <div style={{ textAlign:"right" }}>Share</div>
                      <div style={{ textAlign:"right" }}>Amount</div>
                    </div>
                    {ledgerRows.map((lr, idx) => {
                      const pct = opDollars > 0 ? Math.round(lr.amt / opDollars * 100) : 0;
                      return (
                        <div key={lr.label} style={{
                          padding:"7px 12px",
                          display:"grid", gridTemplateColumns: grid, gap: 12,
                          borderBottom: idx < ledgerRows.length - 1 ? "1px solid var(--rule)" : "none",
                          fontSize: 12, alignItems:"baseline",
                        }}>
                          <span style={{ color:"var(--ink-2)" }}>
                            {lr.label}
                            {lr.shared && <span style={{ color:"var(--ink-3)", marginLeft: 6, fontSize: 10.5 }}>· allocated</span>}
                          </span>
                          <span className="num" style={{ textAlign:"right", color:"var(--ink-3)" }}>{lr.lines}</span>
                          <span className="num" style={{ textAlign:"right", color:"var(--ink-3)" }}>{pct}%</span>
                          <span className="num" style={{ textAlign:"right", fontWeight: 600 }}>{fmt.dollars(lr.amt)}</span>
                        </div>
                      );
                    })}
                    <div style={{
                      padding:"8px 12px",
                      display:"grid", gridTemplateColumns: grid, gap: 12,
                      borderTop:"1px solid var(--rule-strong)",
                      background:"var(--paper-2)",
                      fontSize: 12, fontWeight: 600, alignItems:"baseline",
                    }}>
                      <span style={{ color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.06em", fontSize: 10 }}>Total to {labelOf(d)}</span>
                      <span className="num" style={{ textAlign:"right" }}>{direct.length + (sharedAlloc > 0 ? shared.length : 0)}</span>
                      <span className="num" style={{ textAlign:"right" }}>100%</span>
                      <span className="num" style={{ textAlign:"right" }}>{fmt.dollars(opDollars)}</span>
                    </div>
                  </div>

                  {/* Compact metadata grid */}
                  <div style={{
                    display:"grid", gridTemplateColumns:"160px 1fr", gap:"6px 14px",
                    fontSize: 12, lineHeight: 1.5,
                  }}>
                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Method</div>
                    <div style={{ color:"var(--ink-2)" }}>Department-direct lines + shared services allocation</div>

                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Formula</div>
                    <div>
                      <Formula>operating $/hr = operating $ ÷ productive hrs</Formula>
                      <span style={{ marginLeft: 8, color:"var(--ink-3)" }}>
                        = {fmt.dollarsK(opDollars)} ÷ {f ? Math.round(f.productiveHours).toLocaleString() : "—"} hrs
                        {opRate > 0 && <span style={{ marginLeft: 6, color:"var(--ink)", fontWeight: 600 }}>= ${opRate}/hr</span>}
                      </span>
                    </div>

                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Routing</div>
                    <div style={{ color:"var(--ink-2)" }}>Fund-program code (dept-direct) · shared-allocation key (SHARED)</div>

                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Source</div>
                    <div style={{ color:"var(--ink-2)" }}>FY 26-27 Budget Book.pdf pp. 142–158 · analyst additions</div>

                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Excluded</div>
                    <div style={{ color:"var(--ink-2)" }}>
                      {excluded.length} line(s) — capital outlay, one-time, or pass-through items not in the rate
                    </div>
                  </div>
                </div>
              );
            })(),
          };
        });
        return (
          <DeptSummaryTable
            title="Operating costs by department"
            cols={[
              { key:"dept",   label:"Department",       width:"1.5fr" },
              { key:"opCost", label:"Operating $",      width:"160px", align:"right", mono:true },
              { key:"perHr",  label:"$/hr",             width:"110px", align:"right", mono:true },
              { key:"driver", label:"Largest driver",   width:"1.5fr" },
            ]}
            rows={tbRows}
            footer={{
              dept: <span style={{ color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.06em", fontSize: 11 }}>Citywide</span>,
              opCost: fmt.dollarsK(includedTotal),
              perHr: "—",
              driver: <span style={{ color:"var(--ink-3)" }}>{counts.excluded} excluded · {fmt.dollarsK(excludedTotal)}</span>,
            }}
          />
        );
      })()}

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, budget book pdf"
        hint="Drag the budget book or a department detail sheet. Common formats: Tyler / OpenGov budget extracts, line-item Excel, or scanned PDF."
        lastImport={{ file:"FY 26-27 Budget Book.pdf · pp. 142–158", rows: 22, mapped: 19, review: 3, date:"Apr 24, 2026" }}
      />

      <window.TableShell
        title="Operating cost lines"
        filters={[
          { id:"dept",     label:"Dept",     options: deptOptions,     value: deptFilter,     onChange: setDeptFilter },
          { id:"category", label:"Category", options: categoryOptions, value: categoryFilter, onChange: setCategoryFilter },
          { id:"include",  label:"Status",   options: includeOptions,  value: includeFilter,  onChange: setIncludeFilter },
        ]}
        addLabel="Add operating line manually"
        onAdd={addRow}
        cols={[
          { key:"code", label:"Fund-Program", width:"110px", render: r => (
            <div style={{ opacity: r.include ? 1 : 0.45 }}>
              <CellInput value={r.code || ""} onChange={v => updateCell(r.id, "code", v)}/>
            </div>
          )},
          { key:"line", label:"Line item", width:"1.6fr", render: r => (
            <div style={{ opacity: r.include ? 1 : 0.45 }}>
              <div style={{ textDecoration: r.include ? "none" : "line-through", textDecorationColor: "var(--ink-4)" }}>
                <CellInput value={r.line} onChange={v => updateCell(r.id, "line", v)}/>
              </div>
              {!r.include && r.excludeReason && (
                <div style={{ fontSize: 11, color:"var(--ink-3)", marginTop: 2, fontStyle:"italic" }}>
                  Excluded: {r.excludeReason}
                </div>
              )}
            </div>
          )},
          { key:"dept", label:"Dept", width:"110px", render: r => (
            <div style={{ opacity: r.include ? 1 : 0.45 }}>
              <CellSelect
                value={r.dept}
                onChange={v => updateCell(r.id, "dept", v)}
                options={["PLAN", "BLDG", "ENG", "SHARED:CDS"]}
              />
            </div>
          )},
          { key:"category", label:"Category", width:"170px", render: r => (
            <div style={{ opacity: r.include ? 1 : 0.45 }}>
              <CellSelect
                value={r.category}
                onChange={v => updateCell(r.id, "category", v)}
                options={OP_CATEGORIES}
              />
            </div>
          )},
          { key:"amount", label:"Amount", align:"right", width:"110px", render: r => (
            <div style={{ opacity: r.include ? 1 : 0.45 }}>
              <CellInput type="number" prefix="$" value={r.amount} align="right" onChange={v => updateCell(r.id, "amount", +v || 0)}/>
            </div>
          )},
          { key:"include", label:"Include", align:"center", width:"80px", render: r => (
            <button
              onClick={() => toggleInc(r.id, r.include)}
              title={r.include ? "Click to exclude from $/hr (line stays visible for audit)" : "Click to include in $/hr"}
              style={{
                width: 36, height: 20, padding: 2,
                background: r.include ? "var(--accent)" : "var(--rule)",
                border:"none", borderRadius: 999,
                position:"relative", cursor:"pointer",
              }}
            >
              <span style={{
                position:"absolute", top: 2, left: r.include ? 18 : 2,
                width: 16, height: 16, borderRadius:"50%", background:"#fff",
                transition:"left 100ms",
              }}/>
            </button>
          )},
          { key:"actions", label:"", width:"40px", render: r => (
            <window.RowActions onDelete={() => removeRow(r.id)}/>
          )},
        ]}
        rows={filteredRows}
      />
    </div>
  );
}

Object.assign(window, {
  OperatingCostsScreen,
  OperatingOutputPanel,
});
