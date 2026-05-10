// CAP Builder, Salary, Workload, Service Cost Model, Policy, Fee Study, Lock screens

const { CAP_POOLS, CAP_TOTAL, CAP_IMPACT, POSITIONS, WORKLOAD, DEPT_DETAIL } = window.AFFERENT_EXT;
const { CITY: BCITY, DEPTS: BDEPTS, SERVICES: BSERVICES, CITYWIDE: BCITYWIDE } = window.AFFERENT_DATA;

const DEPT_NAME = { PLAN:"Planning", BLDG:"Building", ENG:"Engineering", FIRE:"Fire" };

// ===== Live model output panels =====
// Read the calc engine's recomputed model and render the calculated outputs
// (FBHR per dept, indirect/direct rate split). Used at the bottom of the
// Salary screen and the CAP screen so users see edits propagate immediately.
function CapAllocationOutputPanel({ model }) {
  const depts = ["PLAN", "BLDG", "ENG"];
  const total = depts.reduce((a, d) => a + (model.cap.indirectByDept[d] || 0), 0);
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
      <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--rule)", display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 600 }}>Calculated indirect $ allocated to fee-modeled departments</div>
        <div style={{ fontSize: 11.5, color:"var(--ink-3)" }}>Recoverable $ × FTE share · live</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)" }}>
        {depts.map(d => {
          const amt = model.cap.indirectByDept[d] || 0;
          const f = model.fbhr[d];
          const pct = total > 0 ? (amt / total) * 100 : 0;
          return (
            <div key={d} style={{ padding:"18px 22px", borderRight: d !== "ENG" ? "1px solid var(--rule)" : "none" }}>
              <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
                <DeptChip code={d}/>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{DEPT_NAME[d]}</div>
              </div>
              <div className="display num" style={{ fontSize: 28, fontWeight: 600, letterSpacing:"-0.02em", color:"var(--accent)" }}>{fmt.dollarsK(amt)}</div>
              <div style={{ fontSize: 11, color:"var(--ink-3)", marginTop: 2 }}>{Math.round(pct)}% of recoverable CAP</div>
              {f && (
                <div style={{ fontSize: 12, color:"var(--ink-2)", marginTop: 14, paddingTop: 14, borderTop:"1px solid var(--rule)" }}>
                  Adds <span className="num" style={{ fontWeight: 600 }}>${Math.round(f.indirectRate)}/hr</span> to direct rate of <span className="num">${Math.round(f.directFBHR)}/hr</span>
                  <div style={{ marginTop: 4 }}>= FBHR <span className="num" style={{ fontWeight: 600, color:"var(--accent)" }}>${Math.round(f.fbhr)}/hr</span></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FBHROutputPanel({ model }) {
  const depts = ["PLAN", "BLDG", "ENG"];
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
      <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--rule)", display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
        <div className="display" style={{ fontSize: 16, fontWeight: 600 }}>Calculated fully burdened hourly rate</div>
        <div style={{ fontSize: 11.5, color:"var(--ink-3)" }}>Direct + Operating + CAP · live</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)" }}>
        {depts.map(d => {
          const f = model.fbhr[d];
          if (!f) return <div key={d} style={{ padding: 18, color:"var(--ink-4)" }}>{DEPT_NAME[d]} — no positions</div>;
          return (
            <div key={d} style={{ padding:"18px 22px", borderRight: d !== "ENG" ? "1px solid var(--rule)" : "none" }}>
              <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
                <DeptChip code={d}/>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{DEPT_NAME[d]}</div>
              </div>
              <div className="display num" style={{ fontSize: 34, fontWeight: 600, letterSpacing:"-0.02em", color:"var(--accent)" }}>${Math.round(f.fbhr)}<span style={{ fontSize: 13, color:"var(--ink-3)", fontWeight: 400 }}> /hr</span></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 8, marginTop: 14, fontSize: 12 }}>
                <div>
                  <div style={{ color:"var(--ink-3)", fontSize: 10.5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Direct</div>
                  <div className="num" style={{ fontWeight: 500, marginTop: 2 }}>${Math.round(f.directFBHR)}<span style={{ color:"var(--ink-3)", fontWeight: 400 }}> /hr</span></div>
                </div>
                <div>
                  <div style={{ color:"var(--ink-3)", fontSize: 10.5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Operating</div>
                  <div className="num" style={{ fontWeight: 500, marginTop: 2 }}>${Math.round(f.operatingRate || 0)}<span style={{ color:"var(--ink-3)", fontWeight: 400 }}> /hr</span></div>
                </div>
                <div>
                  <div style={{ color:"var(--ink-3)", fontSize: 10.5, textTransform:"uppercase", letterSpacing:"0.06em" }}>CAP</div>
                  <div className="num" style={{ fontWeight: 500, marginTop: 2 }}>${Math.round(f.indirectRate)}<span style={{ color:"var(--ink-3)", fontWeight: 400 }}> /hr</span></div>
                </div>
                <div>
                  <div style={{ color:"var(--ink-3)", fontSize: 10.5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Direct $</div>
                  <div className="num" style={{ marginTop: 2 }}>{fmt.dollarsK(f.direct)}</div>
                </div>
                <div>
                  <div style={{ color:"var(--ink-3)", fontSize: 10.5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Operating $</div>
                  <div className="num" style={{ marginTop: 2 }}>{fmt.dollarsK(f.operating || 0)}</div>
                </div>
                <div>
                  <div style={{ color:"var(--ink-3)", fontSize: 10.5, textTransform:"uppercase", letterSpacing:"0.06em" }}>CAP $</div>
                  <div className="num" style={{ marginTop: 2 }}>{fmt.dollarsK(f.indirect)}</div>
                </div>
                <div style={{ gridColumn:"span 3" }}>
                  <div style={{ color:"var(--ink-3)", fontSize: 10.5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Productive hrs/yr</div>
                  <div className="num" style={{ marginTop: 2 }}>{Math.round(f.productiveHours).toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Direct Rate Output (Salary node only) =====
// Salary node stops at Direct $/hr. Operating + CAP join in at Cost of Service.
// This panel deliberately does NOT show FBHR — to keep the salary build a pure
// labor-rate exercise.
function DirectRateOutputPanel({ model }) {
  const depts = ["PLAN", "BLDG", "ENG"];
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
      <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--rule)", display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap: 10 }}>
          <div className="display" style={{ fontSize: 16, fontWeight: 600 }}>Calculated direct $ per productive hour</div>
          <FactPolicyTag kind="fact"/>
        </div>
        <div style={{ fontSize: 11.5, color:"var(--ink-3)" }}>(Salary + Benefits) ÷ productive hrs · live</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)" }}>
        {depts.map(d => {
          const f = model.fbhr[d];
          if (!f) return <div key={d} style={{ padding: 18, color:"var(--ink-4)" }}>{DEPT_NAME[d]} — no positions</div>;
          return (
            <div key={d} style={{ padding:"18px 22px", borderRight: d !== "ENG" ? "1px solid var(--rule)" : "none" }}>
              <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
                <DeptChip code={d}/>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{DEPT_NAME[d]}</div>
              </div>
              <div className="display num" style={{ fontSize: 34, fontWeight: 600, letterSpacing:"-0.02em", color:"var(--ink)" }}>
                ${Math.round(f.directFBHR)}
                <span style={{ fontSize: 13, color:"var(--ink-3)", fontWeight: 400 }}> /hr</span>
              </div>
              <div style={{ fontSize: 11.5, color:"var(--ink-3)", marginTop: 4 }}>direct labor rate</div>
              <div style={{ fontSize: 12, color:"var(--ink-2)", marginTop: 14, paddingTop: 14, borderTop:"1px solid var(--rule)", lineHeight: 1.55 }}>
                <div className="num">{fmt.dollarsK(f.direct)} <span style={{ color:"var(--ink-3)" }}>salary + benefits</span></div>
                <div className="num" style={{ marginTop: 2 }}>{f.productiveHours.toFixed(0).toLocaleString()} <span style={{ color:"var(--ink-3)" }}>productive hrs</span></div>
                <div style={{
                  marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--rule)",
                  fontSize: 11, color: "var(--ink-3)", fontStyle: "italic",
                }}>
                  + Operating $/hr + CAP $/hr = FBHR (computed in Cost of Service)
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Salary Model =====
// Pattern: file upload at top, editable table below, manual add at bottom.
// Every cell shows source. Edits track override + preserve original.

// ----- Salary table (extracted to handle filter/sort state) ---------------
function SalaryTable({ rows, addRow, updateCell, removeRow }) {
  const [deptFilter, setDeptFilter] = uS2("ALL");
  const [reviewOnly, setReviewOnly] = uS2(false);
  const filtered = window.applyFilter(rows, "dept", deptFilter)
    .filter(r => !reviewOnly || r.flag);
  const flaggedCount = rows.filter(r => r.flag).length;

  return (
    <window.TableShell
      title="Position roster"
      filters={[
        {
          id: "dept", label: "Dept",
          options: window.deriveDeptFilter(rows),
          value: deptFilter, onChange: setDeptFilter,
        },
        {
          id: "review", label: "View",
          options: [
            { value: "ALL", label: "All", count: rows.length },
            { value: "FLAG", label: "Needs review", count: flaggedCount },
          ],
          value: reviewOnly ? "FLAG" : "ALL",
          onChange: v => setReviewOnly(v === "FLAG"),
        },
      ]}
      defaultSort={{ key: "title", dir: "asc" }}
      stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
      onAdd={addRow}
      addLabel="Add position manually"
      cols={[
        { key: "title", label: "Position", width: "1.5fr", sortable: true, render: r => (
          <div>
            <div style={{ fontWeight: 500 }}>{r.title}</div>
            {r.flag && <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 2 }}>⚠ {r.flag === "title-changed" ? "Title changed since prior study" : "Missing productive hours"}</div>}
          </div>
        )},
        { key: "dept", label: "Dept", width: "70px", sortable: true,
          render: r => <DeptChip code={r.dept}/> },
        { key: "fte", label: "FTE", align: "right", width: "70px", sortable: true,
          render: r => <CellInput type="number" value={r.fte} align="right" onChange={v => updateCell(r.idx, "fte", v)}/> },
        { key: "salary", label: "Salary", align: "right", width: "110px", sortable: true,
          render: r => <CellInput type="number" prefix="$" value={r.salary} align="right" onChange={v => updateCell(r.idx, "salary", v)}/> },
        { key: "benefits", label: "Benefits", align: "right", width: "110px", sortable: true,
          render: r => <CellInput type="number" prefix="$" value={r.benefits} align="right" onChange={v => updateCell(r.idx, "benefits", v)}/> },
        { key: "hours", label: "Prod hrs/yr", align: "right", width: "100px", sortable: true,
          render: r => <CellInput type="number" value={r.hours} align="right" onChange={v => updateCell(r.idx, "hours", +v || 0)}/> },
        { key: "fbhr", label: "Direct labor $/hr", align: "right", width: "150px", sortable: true,
          sortKey: r => r.hours > 0 ? (r.salary + r.benefits) / r.hours : 0,
          render: r => <span className="num">{r.hours > 0 ? "$" + Math.round((r.salary + r.benefits) / r.hours) : "—"}</span> },
        { key: "actions", label: "", width: "40px",
          render: r => <window.RowActions onDelete={() => removeRow(r.idx)}/> },
      ]}
      rows={filtered}
    />
  );
}

// Reads/writes from window.AFFERENT_ENGINE.store — edits propagate to FBHR,
// service costs, and fees in real time.
function SalaryModelScreen() {
  const ENG = window.AFFERENT_ENGINE;
  const model = ENG.useModel();

  // Visual metadata (source pill kind/file/row) is stable per index.
  // We keep it in a ref so changing position values doesn't reshuffle.
  const meta = uM2(() => ENG.store.state.positions.map((p, i) => ({
    source: i === 11 ? "carry-forward" : i === 9 ? "manual" : "imported",
    sourceFile: i === 11 ? "FY 24/25 study" : i === 9 ? null : "Salary Tbl.xlsx",
    sourceRow: i === 11 ? "App. A" : i === 9 ? null : (24 + i * 3),
    manualBy: i === 9 ? "L. Park · Apr 18" : null,
    salary_orig: p.salary, benefits_orig: p.benefits, hours_orig: p.hours,
  })), []);

  const positions = ENG.store.state.positions;
  const rows = positions.map((p, i) => ({
    id: "pos-" + i, idx: i, ...p, ...meta[i],
    salary_edited: meta[i] && p.salary !== meta[i].salary_orig,
    benefits_edited: meta[i] && p.benefits !== meta[i].benefits_orig,
    hours_edited: meta[i] && p.hours !== meta[i].hours_orig,
  }));

  const updateCell = (idx, key, value) => ENG.actions.updatePosition(idx, { [key]: value });
  const addRow = () => ENG.actions.addPosition({
    title:"New position", dept:"PLAN", fte: 1.0, salary: 0, benefits: 0, hours: 1720,
  });
  const removeRow = (idx) => ENG.actions.removePosition(idx);

  const counts = uM2(() => {
    const c = { imported: 0, carry: 0, manual: 0, edited: 0, flagged: 0 };
    rows.forEach(r => {
      if (r.source === "imported") c.imported++;
      else if (r.source === "carry-forward") c.carry++;
      else c.manual++;
      if (r.salary_edited || r.benefits_edited || r.hours_edited) c.edited++;
      if (r.flag) c.flagged++;
    });
    return c;
  }, [rows]);

  const totalComp = rows.reduce((a, r) => a + (r.salary + r.benefits) * r.fte, 0);
  const totalProductiveHrs = rows.reduce((a, r) => a + r.hours * r.fte, 0);

  // Computed direct $/hr per dept — the OUTPUT this node produces.
  const directRates = uM2(() => {
    const out = {};
    ["PLAN","BLDG","ENG"].forEach(d => {
      const f = model.fbhr[d];
      if (f) out[d] = Math.round(f.directFBHR);
    });
    return out;
  }, [model.fbhr]);
  const rateFmt = (d) => directRates[d] != null ? `$${directRates[d]}` : "—";

  return (
    <div className="page">
      <PageHeader
        eyebrow={<NodeEyebrow node="salary"/>}
        title="Direct Labor"
        subtitle="Direct labor rate per department."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      {/* Compact status row — replaces large KPI tiles */}
      {(() => {
        const flagged = rows.filter(r => r.flag).length;
        return (
          <StatusRow items={[
            `${rows.length} positions`,
            { value: flagged === 0 ? "Balanced" : `${flagged} need review`, tone: flagged === 0 ? "pos" : "warn" },
            `${Math.round(totalProductiveHrs).toLocaleString()} productive hrs`,
            "FY 2026-27",
          ]}/>
        );
      })()}

      {/* ONE primary summary table — workforce + labor economics */}
      {(() => {
        const depts = ["PLAN","BLDG","ENG"];
        const labelOf = d => d === "PLAN" ? "Planning" : d === "BLDG" ? "Building" : "Engineering";
        const tbRows = depts.map(d => {
          const f = model.fbhr[d];
          const dr = rows.filter(r => r.dept === d);
          const comp = dr.reduce((a,r) => a + (r.salary + r.benefits) * r.fte, 0);
          const hrs  = dr.reduce((a,r) => a + r.hours * r.fte, 0);
          const fte  = dr.reduce((a,r) => a + (+r.fte || 0), 0);
          const avgRate = directRates[d];
          // top contributors by total comp
          const top = [...dr].sort((a,b) => ((b.salary+b.benefits)*b.fte) - ((a.salary+a.benefits)*a.fte)).slice(0, 4);
          return {
            key: d,
            cells: {
              dept: <span style={{ display:"inline-flex", alignItems:"center", gap: 8 }}><DeptChip code={d}/><span style={{ fontWeight: 500 }}>{labelOf(d)}</span></span>,
              positions: <span>{dr.length}<span style={{ color:"var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>· {fte.toFixed(1)} FTE</span></span>,
              avgRate: avgRate != null ? `$${avgRate}` : "—",
              hrs: Math.round(hrs).toLocaleString(),
              total: fmt.dollarsK(comp),
            },
            drilldown: (() => {
              // Aggregate positions in this dept by title (handles multiple-FTE rows)
              const byTitle = {};
              dr.forEach(p => {
                const k = p.title;
                if (!byTitle[k]) byTitle[k] = { title: p.title, fte: 0, comp: 0 };
                byTitle[k].fte  += (+p.fte || 0);
                byTitle[k].comp += (p.salary + p.benefits) * p.fte;
              });
              const ledger = Object.values(byTitle).sort((a,b) => b.comp - a.comp).slice(0, 8);
              const grid = "1fr 90px 80px 130px";
              return (
                <div style={{ paddingTop: 8, display:"flex", flexDirection:"column", gap: 14 }}>
                  {/* Primary ledger — position-by-position compensation */}
                  <div style={{ border:"1px solid var(--rule)", background:"var(--paper)" }}>
                    <div style={{
                      padding:"8px 12px", borderBottom:"1px solid var(--rule)",
                      background:"var(--paper-2)",
                      display:"grid", gridTemplateColumns: grid, gap: 12,
                      fontSize: 10, fontWeight: 600, letterSpacing:"0.08em",
                      color:"var(--ink-3)", textTransform:"uppercase",
                    }}>
                      <div>Position</div>
                      <div style={{ textAlign:"right" }}>FTE</div>
                      <div style={{ textAlign:"right" }}>Share</div>
                      <div style={{ textAlign:"right" }}>Comp</div>
                    </div>
                    {ledger.map((p, idx) => {
                      const pct = comp > 0 ? Math.round(p.comp / comp * 100) : 0;
                      return (
                        <div key={p.title} style={{
                          padding:"7px 12px",
                          display:"grid", gridTemplateColumns: grid, gap: 12,
                          borderBottom: idx < ledger.length - 1 ? "1px solid var(--rule)" : "none",
                          fontSize: 12, alignItems:"baseline",
                        }}>
                          <span style={{ color:"var(--ink-2)" }}>{p.title}</span>
                          <span className="num" style={{ textAlign:"right", color:"var(--ink-3)" }}>{p.fte.toFixed(2)}</span>
                          <span className="num" style={{ textAlign:"right", color:"var(--ink-3)" }}>{pct}%</span>
                          <span className="num" style={{ textAlign:"right", fontWeight: 600 }}>{fmt.dollars(p.comp)}</span>
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
                      <span className="num" style={{ textAlign:"right" }}>{fte.toFixed(1)}</span>
                      <span className="num" style={{ textAlign:"right" }}>100%</span>
                      <span className="num" style={{ textAlign:"right" }}>{fmt.dollars(comp)}</span>
                    </div>
                  </div>

                  {/* Compact metadata grid */}
                  <div style={{
                    display:"grid", gridTemplateColumns:"160px 1fr", gap:"6px 14px",
                    fontSize: 12, lineHeight: 1.5,
                  }}>
                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Method</div>
                    <div style={{ color:"var(--ink-2)" }}>Position-level salary + benefits × FTE</div>

                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Formula</div>
                    <div>
                      <Formula>direct $/hr = Σ (salary + benefits) ÷ Σ productive hrs</Formula>
                      <span style={{ marginLeft: 8, color:"var(--ink-3)" }}>
                        = {fmt.dollarsK(comp)} ÷ {Math.round(hrs).toLocaleString()} hrs
                        {avgRate != null && <span style={{ marginLeft: 6, color:"var(--ink)", fontWeight: 600 }}>= ${avgRate}/hr</span>}
                      </span>
                    </div>

                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Productive hrs</div>
                    <div style={{ color:"var(--ink-2)" }}>Paid hrs less PTO, holiday, training · 1,720 hrs/FTE citywide default</div>

                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Roster source</div>
                    <div style={{ color:"var(--ink-2)" }}>FY 26-27 Salary Table.xlsx · imported Apr 18, 2026</div>

                    <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Carries into</div>
                    <div style={{ color:"var(--ink-2)" }}>Stacks with operating $/hr + CAP $/hr to form FBHR in Cost of Service</div>
                  </div>
                </div>
              );
            })(),
          };
        });
        const totalFte = rows.reduce((a,r) => a + (+r.fte || 0), 0);
        return (
          <DeptSummaryTable
            title="Direct labor by department"
            cols={[
              { key:"dept",      label:"Department",  width:"1.5fr" },
              { key:"positions", label:"Positions",   width:"160px" },
              { key:"avgRate",   label:"Avg $/hr",    width:"110px", align:"right", mono:true },
              { key:"hrs",       label:"Prod hrs",    width:"110px", align:"right", mono:true },
              { key:"total",     label:"Total labor", width:"160px", align:"right", mono:true },
            ]}
            rows={tbRows}
            footer={{
              dept: <span style={{ color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.06em", fontSize: 11 }}>Citywide</span>,
              positions: <span>{rows.length}<span style={{ color:"var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>· {totalFte.toFixed(1)} FTE</span></span>,
              avgRate: "—",
              hrs: Math.round(totalProductiveHrs).toLocaleString(),
              total: fmt.dollarsK(totalComp),
            }}
          />
        );
      })()}

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf budget exports"
        hint="Drag a salary table or position list. Common formats: Tyler / OpenGov / Workday exports, or budget book PDF."
        lastImport={{ file:"FY 26-27 Salary Table.xlsx", rows: 73, mapped: 67, review: 6, date:"Apr 18, 2026" }}
      />

      <SalaryTable
        rows={rows}
        addRow={addRow}
        updateCell={updateCell}
        removeRow={removeRow}
      />
    </div>
  );
}

// ===== Workload Model =====
// Joins workload data ONTO the canonical service list (BSERVICES).
// Every defined service appears here. Missing volumes are flagged.

// ----- Workload table (extracted to handle filter/sort state) ------------
function WorkloadTable({ rows, addRow, updateCurrent }) {
  const [deptFilter, setDeptFilter] = uS2("ALL");
  const [reviewOnly, setReviewOnly] = uS2(false);
  const filtered = window.applyFilter(rows, "dept", deptFilter)
    .filter(r => !reviewOnly || r.flag);
  const flaggedCount = rows.filter(r => r.flag).length;

  return (
    <window.TableShell
      title="Service workload"
      filters={[
        {
          id: "dept", label: "Dept",
          options: window.deriveDeptFilter(rows),
          value: deptFilter, onChange: setDeptFilter,
        },
        {
          id: "review", label: "View",
          options: [
            { value: "ALL", label: "All", count: rows.length },
            { value: "FLAG", label: "Needs review", count: flaggedCount },
          ],
          value: reviewOnly ? "FLAG" : "ALL",
          onChange: v => setReviewOnly(v === "FLAG"),
        },
      ]}
      defaultSort={{ key: "svc", dir: "asc" }}
      stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
      onAdd={addRow}
      addLabel="Add service manually"
      cols={[
        { key: "svc", label: "Service", width: "1.5fr", sortable: true, render: r => (
          <div>
            <div>{r.svc}</div>
            {r.flag === "missing-current-volume" && <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 2 }}>⚠ No current-year volume — enter manually or use prior</div>}
            {r.flag === "carry-forward" && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>Reused from prior study — confirm</div>}
          </div>
        )},
        { key: "dept", label: "Dept", width: "70px", sortable: true,
          render: r => <DeptChip code={r.dept}/> },
        { key: "unit", label: "Unit", width: "100px", sortable: true,
          render: r => <span>{r.unit}</span> },
        { key: "prior", label: "Prior volume", align: "right", width: "130px", sortable: true,
          render: r => <span className="num">{r.prior?.toLocaleString() ?? "—"}</span> },
        { key: "current", label: "Current volume", align: "right", width: "130px", sortable: true,
          sortKey: r => +r.current || 0,
          render: r => <CellInput type="number" value={r.current ?? ""} align="right" onChange={v => updateCurrent(r.id, v)}/> },
        { key: "change", label: "Change", align: "right", width: "80px", sortable: true,
          sortKey: r => (r.current == null || r.current === "" || r.prior == null) ? -Infinity : (+r.current - r.prior) / r.prior,
          render: r => {
            if (r.current == null || r.current === "" || r.prior == null) return <span style={{ color: "var(--ink-4)" }}>—</span>;
            const d = +r.current - r.prior;
            const pct = Math.round(d / r.prior * 100);
            return <span className="num" style={{ color: d > 0 ? "var(--pos)" : d < 0 ? "var(--neg)" : "var(--ink)" }}>{d > 0 ? "+" : ""}{pct}%</span>;
          }},
      ]}
      rows={filtered}
    />
  );
}

function WorkloadModelScreen() {
  // Synthesize a unit per service from its id prefix + a few overrides
  const unitFor = (s) => {
    if (/-pc$|-apr$|-fpc$|-pchk/.test(s.id)) return "Plan check";
    if (/-insp|-erosion|-ai\b|-bldg/.test(s.id)) return "Inspection";
    if (/-sfr$|-rem$|-pool$|-solar$|-mep$|-tco$|-ext$/.test(s.id)) return "Permit";
    if (/-ency|-encl|-grade|-storm/.test(s.id)) return "Permit";
    if (/-preap|-adu/.test(s.id)) return "Meeting";
    if (/-fence|-oak|-mod|-wlss|-mvar/.test(s.id)) return "Permit";
    if (s.dept === "PLAN") return "Application";
    if (s.dept === "BLDG") return "Permit";
    if (s.dept === "ENG")  return "Review";
    return "Item";
  };

  // Mock "what came back from the permit-system import":
  //   - 70% imported clean (current present, slight delta from prior)
  //   - ~15% carry-forward from prior study (no current-year data)
  //   - ~10% missing entirely (need manual entry)
  //   - ~5% manually added by analyst
  const seed = uM2(() => BSERVICES.map((s, i) => {
    const bucket = i % 13;
    const prior = Math.max(1, Math.round(s.volume * (0.85 + (i % 5) * 0.06)));
    let status, source, current, sourceFile, sourceRow, manualBy, flag;

    if (bucket === 3 || bucket === 11) {
      // Carry-forward
      status = "Reused"; source = "carry-forward";
      current = prior; sourceFile = "FY 24/25 study"; sourceRow = "App. B, row " + (i + 1);
      flag = "carry-forward";
    } else if (bucket === 7) {
      // Missing
      status = "Missing"; source = "manual";
      current = null; manualBy = "Awaiting entry";
      flag = "missing-current-volume";
    } else if (bucket === 5) {
      // Manual entry by analyst
      status = "Manual"; source = "manual";
      current = s.volume; manualBy = "k.lin · Apr 14"; sourceFile = null;
    } else {
      // Imported (the common case)
      status = i % 4 === 0 ? "Validated" : "Imported"; source = "imported";
      current = s.volume; sourceFile = "Permit system"; sourceRow = `Q1–Q4 ${1200 + i}`;
    }

    return {
      id: s.id,
      svc: s.name,
      dept: s.dept,
      unit: unitFor(s),
      prior, current,
      current_orig: current,
      current_edited: false,
      status, source, sourceFile, sourceRow, manualBy, flag,
    };
  }), []);

  const [rows, setRows] = uS2(seed);

  const updateCurrent = (id, v) => setRows(rs => rs.map(r => r.id === id
    ? { ...r, current: v, current_edited: r.current_orig != null && v !== r.current_orig, source: r.current_orig == null ? "manual" : r.source, flag: v == null || v === "" ? "missing-current-volume" : (r.source === "carry-forward" ? "carry-forward" : null) }
    : r));

  const addRow = () => setRows(rs => [...rs, {
    id:"wl-new-"+rs.length, svc:"New service", dept:"PLAN", unit:"Application",
    current: 0, prior: null, status:"Manual",
    source:"manual", manualBy:"You · just now",
    current_orig: null, current_edited: false,
  }]);

  const counts = uM2(() => {
    const c = { imported:0, carry:0, manual:0, edited:0, flagged:0 };
    rows.forEach(r => {
      if (r.source === "imported") c.imported++;
      else if (r.source === "carry-forward") c.carry++;
      else c.manual++;
      if (r.current_edited) c.edited++;
      if (r.flag) c.flagged++;
    });
    return c;
  }, [rows]);

  return (
    <div className="page">
      <PageHeader
        eyebrow={<NodeEyebrow node="workload"/>}
        title="Workload"
        subtitle="Annual volume per service."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      {/* ANSWER — total volume per dept */}
      {(() => {
        const totalVol = rows.reduce((a,r) => a + (+r.current || 0), 0);
        const missing  = rows.filter(r => r.current == null || r.current === "").length;
        const carry    = counts.carry;
        return (
          <StatusRow items={[
            `${rows.length} services`,
            `${totalVol.toLocaleString()} workload rows`,
            { value: missing === 0 ? "All captured" : `${missing} missing`, tone: missing === 0 ? "pos" : "warn" },
            carry > 0 ? `${carry} carry-forward` : "No carry-forward",
            "FY 2026-27",
          ]}/>
        );
      })()}

      <DropZone
        accept=".xlsx,.csv"
        formats="xlsx, csv permit-system exports"
        hint="Drag a permit-system export. Supported: Tyler EnerGov, Accela, OpenGov, or any CSV with service + volume columns."
        lastImport={{ file:"Permits_FY26-27_Q1-Q4.csv", rows: 1246, mapped: 184, review: 17, date:"Apr 16, 2026" }}
      />

      <WorkloadTable
        rows={rows}
        addRow={addRow}
        updateCurrent={updateCurrent}
      />
    </div>
  );
}

Object.assign(window, {
  // CapBuilderScreen — replaced by screens-cap.jsx (deterministic engine)
  // FeeStudyScreen — replaced by screens-fee-schedule-v2.jsx
  // PolicyTargetsScreen / LockBaselineScreen / FeeRecoveryScreen / ReconcileScreen — folded into Fee Schedule v2 / removed
  SalaryModelScreen, WorkloadModelScreen,
  FBHROutputPanel, DirectRateOutputPanel,
});
