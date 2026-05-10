// screens-cap.jsx — Cost Allocation Plan, NBS-style five-step flow.
//
// Replaces the old single-page CAP. The CAP does ONE thing: allocate
// indirect cost pools to direct departments. No recoverability, no fee
// logic, no policy.
//
// Flow:
//   Step 1 — Indirect Cost Centers
//   Step 2 — Cost Pools (per center)
//   Step 3 — Driver Inputs (dept × basis matrix)
//   Step 4 — Allocation Matrix (Initial / Final, with cell-level trace)
//   Step 5 — Department Summary (final allocated $ per direct dept)
//
// Method: STEP-DOWN. Each pool starts on its home indirect center and is
// pushed to subsequent receivers in `stepOrder`. See cap-engine.jsx.

const CAP_STEPS = [
  { id:"centers",  num:1, label:"Indirect Cost Centers", hint:"Central service providers, ordered for step-down." },
  { id:"pools",    num:2, label:"Cost Pools",            hint:"Each center split into functional pools, one basis each." },
  { id:"drivers",  num:3, label:"Allocation Bases",       hint:"Department × basis matrix. The denominator for each pool." },
  { id:"matrix",   num:4, label:"Allocation Matrix",     hint:"Initial placement → step-down → final, every cell traceable." },
];

// =========================================================================
// Step header — eyebrow, step nav, KPI rail
// =========================================================================
function CapStepNav({ current, onJump }) {
  return (
    <div style={{
      display:"flex", alignItems:"stretch",
      border:"1px solid var(--rule)",
      background:"var(--paper)",
    }}>
      {CAP_STEPS.map((s, i) => {
        const active = s.id === current;
        const past   = CAP_STEPS.findIndex(x => x.id === current) > i;
        return (
          <button key={s.id} onClick={() => onJump(s.id)} style={{
            flex: 1,
            display:"flex", alignItems:"flex-start",
            padding:"14px 16px",
            background: active ? "var(--ink)" : "var(--paper)",
            color: active ? "var(--paper)" : (past ? "var(--ink-2)" : "var(--ink-3)"),
            borderRight: i < CAP_STEPS.length - 1 ? "1px solid var(--rule)" : "none",
            textAlign:"left",
            cursor:"pointer",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 10.5, lineHeight: 1.35, color: active ? "rgba(255,255,255,0.65)" : "var(--ink-3)" }}>{s.hint}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Validation banner shared across steps
function ValidationBanner({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div style={{ border:"1px solid oklch(78% 0.12 60)", background:"oklch(98% 0.025 60)" }}>
      <div style={{ display:"flex", alignItems:"center", gap: 10, padding:"10px 14px", borderBottom:"1px solid oklch(88% 0.06 60)" }}>
        <span style={{ width: 8, height: 8, borderRadius:"50%", background:"var(--warn)" }}/>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{warnings.length} validation issue{warnings.length === 1 ? "" : "s"}</div>
        <div className="mono" style={{ marginLeft:"auto", fontSize: 10.5, color:"var(--ink-3)", letterSpacing:"0.08em", textTransform:"uppercase" }}>Resolve before lock</div>
      </div>
      <div style={{ padding:"4px 14px 10px" }}>
        {warnings.slice(0, 8).map((w, i) => (
          <div key={i} style={{
            display:"flex", gap: 10, padding:"5px 0",
            fontSize: 12, color:"var(--ink-2)",
            borderBottom: i < Math.min(warnings.length, 8) - 1 ? "1px dashed var(--rule)" : "none",
          }}>
            <span className="mono" style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing:"0.1em",
              color:"var(--warn)", textTransform:"uppercase",
              padding:"2px 6px", border:"1px solid oklch(80% 0.1 60)", background:"oklch(96% 0.04 60)",
            }}>{w.kind}</span>
            <span>{w.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================================
// STEP 1 — Indirect Cost Centers
// =========================================================================

// ----- Cost centers table (TableShell-based) ------------------------------
function CapCentersTable({ model, actions, total }) {
  const enriched = model.centers.map((c, i) => {
    const center = model.byCenter[c.id];
    return {
      ...c,
      _idx: i + 1,
      _totalCost: center?.totalCost || 0,
      _poolCount: center?.pools?.length || 0,
    };
  });

  return (
    <window.TableShell
      title="Cost centers"
      defaultSort={{ key: "_totalCost", dir: "desc" }}
      onAdd={actions.addCenter}
      addLabel="Add center"
      cols={[
        { key: "_idx", label: "#", width: "40px",
          render: r => <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r._idx.toString().padStart(2, "0")}</span> },
        { key: "code", label: "Fund-Program", width: "110px", sortable: true,
          render: r => <CellInput value={r.code || ""} onChange={v => actions.updateCenter(r.id, { code: v })} mono/> },
        { key: "name", label: "Center", width: "minmax(200px, 2fr)", sortable: true,
          render: r => <CellInput value={r.name} onChange={v => actions.updateCenter(r.id, { name: v })}/> },
        { key: "fy", label: "Fiscal year", width: "130px", sortable: true,
          render: r => <CellInput value={r.fy || ""} onChange={v => actions.updateCenter(r.id, { fy: v })}/> },
        { key: "_totalCost", label: "Total cost", align: "right", width: "110px", sortable: true,
          render: r => <span className="num">{fmt.dollarsK(r._totalCost)}</span> },
        { key: "_poolCount", label: "# pools", align: "right", width: "90px", sortable: true,
          render: r => <span className="num">{r._poolCount}</span> },
        { key: "_remove", label: "", width: "36px",
          render: r => (
            <button onClick={() => actions.removeCenter(r.id)} style={{
              width: 24, height: 24, color: "var(--ink-4)", background: "transparent",
              border: "none", cursor: "pointer",
            }}>
              <Icon name="close" size={11}/>
            </button>
          )},
      ]}
      rows={enriched}
    />
  );
}

function Step1Centers({ model, actions }) {
  const total = model.totals.totalCAP;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 16 }}>
      <SectionHead
        title="Indirect cost centers"
        subtitle="Central providers whose cost is allocated to direct departments."
      />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 12 }}>
        <KpiTile label="Total CAP scope"     value={fmt.dollarsK(total)} sub={`${model.centers.length} cost centers`} source="CAP report"/>
        <KpiTile label="Indirect departments" value={model.indirectDepts.length} sub="Allocate FROM these"/>
        <KpiTile label="Direct departments"   value={model.directDepts.length}   sub="Allocate TO these"/>
        <KpiTile label="Cost pools"           value={model.pools.length}         sub="Distinct allocation rules"/>
      </div>

      <StepDownSequence model={model} actions={actions}/>

      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
      <CapCentersTable model={model} actions={actions} total={total}/>
      </div>
    </div>
  );
}

// Step-down sequence editor — order indirect depts are processed.
function StepDownSequence({ model, actions }) {
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
      <div style={{
        display:"flex", alignItems:"center",
        padding:"12px 18px", borderBottom:"1px solid var(--rule)",
        background:"var(--paper-2)",
      }}>
        <div>
          <div className="display" style={{ fontSize: 13.5, fontWeight: 600 }}>Step-down sequence</div>
          <div style={{ fontSize: 11.5, color:"var(--ink-3)", marginTop: 2, lineHeight: 1.4, maxWidth: 720 }}>
            Order indirect depts are closed out. When dept N is stepped down, its current balance is pushed to depts N+1…end + all directs. Convention: list the broadest-service providers first.
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)" }}>
        {model.stepOrder.map((d, i) => {
          const totalAtCenter = model.byCenter[d.id]?.totalCost || 0;
          const isFirst = i === 0;
          const isLast = i === model.stepOrder.length - 1;
          return (
            <div key={d.id} style={{
              display:"flex", alignItems:"center", gap: 10,
              padding:"10px 16px",
              borderBottom: i < model.stepOrder.length - (model.stepOrder.length % 3 || 3) ? "1px solid var(--rule)" : "none",
              borderRight: ((i + 1) % 3 !== 0) ? "1px solid var(--rule)" : "none",
            }}>
              <div className="mono" style={{
                fontSize: 11, fontWeight: 700, fontVariantNumeric:"tabular-nums",
                padding:"3px 8px", minWidth: 30, textAlign:"center",
                background:"var(--ink)", color:"var(--paper)",
              }}>{(i+1).toString().padStart(2,"0")}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.name}</div>
                <div className="mono" style={{ fontSize: 10, color:"var(--ink-4)", marginTop: 1 }}>
                  {totalAtCenter > 0 ? fmt.dollarsK(totalAtCenter) : "—"}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap: 2 }}>
                <button
                  disabled={isFirst}
                  onClick={() => actions.moveStepUp(d.id)}
                  title="Move earlier in sequence"
                  style={{
                    width: 22, height: 16,
                    border:"1px solid var(--rule)", background:"var(--paper)",
                    color: isFirst ? "var(--ink-4)" : "var(--ink-2)",
                    cursor: isFirst ? "default" : "pointer",
                    fontSize: 9, lineHeight: 1,
                  }}>▲</button>
                <button
                  disabled={isLast}
                  onClick={() => actions.moveStepDown(d.id)}
                  title="Move later in sequence"
                  style={{
                    width: 22, height: 16,
                    border:"1px solid var(--rule)", background:"var(--paper)",
                    color: isLast ? "var(--ink-4)" : "var(--ink-2)",
                    cursor: isLast ? "default" : "pointer",
                    fontSize: 9, lineHeight: 1,
                  }}>▼</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================================
// STEP 2 — Cost Pools (grouped by center)
// =========================================================================
function Step2Pools({ model, actions }) {
  const basisOptions = model.bases.map(b => b.label);
  const basisIdByLabel = {};
  model.bases.forEach(b => basisIdByLabel[b.label] = b.id);
  const basisLabelById = {};
  model.bases.forEach(b => basisLabelById[b.id] = b.label);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 16 }}>
      <SectionHead
        title="Cost pools"
        subtitle="One basis per pool. Mixed bases not allowed."
      />

      {model.centers.map(c => {
        const pools = model.pools.filter(p => p.centerId === c.id);
        const totalCenter = pools.reduce((a, p) => a + (+p.amount || 0), 0);
        return (
          <div key={c.id} style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
            <div style={{
              display:"flex", alignItems:"center",
              padding:"12px 18px", borderBottom:"1px solid var(--rule)",
              background:"var(--paper-2)",
            }}>
              <div>
                <div className="display" style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                <div className="mono" style={{ fontSize: 10.5, color:"var(--ink-3)", marginTop: 2 }}>
                  {c.fy || "—"} · {pools.length} pool{pools.length === 1 ? "" : "s"} · {fmt.dollars(totalCenter)}
                </div>
              </div>
              <div style={{ marginLeft:"auto" }}>
                <Btn kind="ghost" onClick={() => actions.addPool(c.id)}><Icon name="plus" size={13}/> Add pool</Btn>
              </div>
            </div>

            <div style={{
              display:"grid",
              gridTemplateColumns:"minmax(220px, 2fr) 110px 160px minmax(280px, 2.4fr) 36px",
              gap: 12,
              padding:"10px 18px",
              background:"var(--paper-2)", borderBottom:"1px solid var(--rule-strong)",
              fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
              letterSpacing:"0.08em", color:"var(--ink-3)", textTransform:"uppercase",
            }}>
              <div>Pool</div>
              <div style={{ textAlign:"right" }}>Amount</div>
              <div>Basis</div>
              <div>Explanation</div>
              <div/>
            </div>

            {pools.length === 0 ? (
              <div style={{ padding:"18px", textAlign:"center", fontSize: 12, color:"var(--ink-3)" }}>
                No pools yet. <button onClick={() => actions.addPool(c.id)} style={{ color:"var(--accent)" }}>Add the first pool</button> for this center.
              </div>
            ) : null}

            {pools.map(p => {
              const basisDef = model.bases.find(b => b.id === p.basis);
              const isDirect = p.basis === "DIRECT";
              const directDeptName = isDirect ? (model.departments.find(d => d.id === p.directTo)?.name || "—") : null;
              return (
                <div key={p.id} style={{
                  display:"grid",
                  gridTemplateColumns:"minmax(220px, 2fr) 110px 160px minmax(280px, 2.4fr) 36px",
                  gap: 12,
                  padding:"8px 18px",
                  borderBottom:"1px solid var(--rule)",
                  alignItems:"flex-start",
                }}>
                  <div style={{ display:"flex", flexDirection:"column", gap: 3 }}>
                    <CellInput value={p.name} onChange={v => actions.updatePool(p.id, { name: v })}/>
                    <div className="mono" style={{ fontSize: 9.5, color:"var(--ink-4)", paddingLeft: 6 }}>
                      {p.id}
                      {isDirect ? <span style={{ marginLeft: 6, color:"var(--accent)" }}>→ {directDeptName}</span> : null}
                    </div>
                  </div>
                  <CellInput type="number" prefix="$" value={p.amount} align="right"
                    onChange={v => actions.updatePool(p.id, { amount: +v || 0 })}/>
                  {isDirect ? (
                    <div style={{
                      display:"flex", alignItems:"center", gap: 6,
                      padding:"3px 6px", fontSize: 11.5, color:"var(--ink-2)",
                      lineHeight: 1.3,
                    }} title="Direct charge — 100% of this pool goes to the named department.">
                      <span className="mono" style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing:"0.08em",
                        padding:"2px 6px", background:"var(--paper-2)",
                        border:"1px solid var(--rule)", color:"var(--ink-2)",
                        textTransform:"uppercase", whiteSpace:"nowrap",
                      }}>Direct</span>
                      <span style={{ fontSize: 11, color:"var(--ink-3)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        → {directDeptName}
                      </span>
                    </div>
                  ) : (
                    <CellSelect
                      value={basisLabelById[p.basis] || p.basis}
                      options={basisOptions}
                      onChange={lbl => {
                        const id = basisIdByLabel[lbl] || "FTE";
                        actions.updatePool(p.id, { basis: id });
                      }}
                    />
                  )}
                  <CellInput
                    value={p.explanation || ""}
                    onChange={v => actions.updatePool(p.id, { explanation: v })}
                  />
                  <button onClick={() => actions.removePool(p.id)} style={{ width: 24, height: 24, color:"var(--ink-4)" }}>
                    <Icon name="close" size={11}/>
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Bases legend */}
      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
        <div style={{ padding:"12px 18px", borderBottom:"1px solid var(--rule)" }}>
          <div className="display" style={{ fontSize: 13, fontWeight: 600 }}>Allocation bases · {model.bases.length}</div>
          <div style={{ fontSize: 11.5, color:"var(--ink-3)", marginTop: 2 }}>
            One basis per pool. Each must be measurable, documented, and auditable.
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)" }}>
          {model.bases.map((b, i) => (
            <div key={b.id} style={{
              padding:"10px 18px",
              borderBottom: i < model.bases.length - 2 ? "1px solid var(--rule)" : "none",
              borderRight: i % 2 === 0 ? "1px solid var(--rule)" : "none",
              display:"flex", gap: 12, alignItems:"flex-start",
            }}>
              <div className="mono" style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing:"0.08em",
                padding:"3px 7px", background:"var(--paper-2)",
                border:"1px solid var(--rule)", color:"var(--ink-2)",
                whiteSpace:"nowrap",
              }}>{b.id}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{b.label} <span style={{ color:"var(--ink-4)", fontWeight: 400 }}>({b.unit})</span></div>
                <div style={{ fontSize: 11, color:"var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>{b.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// =========================================================================
// STEP 3 — Driver inputs (dept × basis matrix)
// =========================================================================
function Step3Drivers({ model, actions }) {
  // Show only bases that are actually used by at least one pool, plus pinned default ones.
  const usedBases = new Set(model.pools.map(p => p.basis).filter(b => b && b !== "DIRECT"));
  // Always show FTE + EXPEND so users can edit the pass-2 redistribution drivers.
  ["FTE", "EXPEND"].forEach(b => usedBases.add(b));
  const bases = model.bases.filter(b => usedBases.has(b.id));

  // Build column template: dept name + dept kind tag + each basis col.
  const cols = `minmax(180px, 1.6fr) 100px ${bases.map(() => "minmax(110px, 1fr)").join(" ")}`;

  // Per-basis totals
  const totals = {};
  bases.forEach(b => totals[b.id] = model.departments.reduce((a, d) => a + (model.drivers[d.id]?.[b.id] || 0), 0));

  const fmtDriver = (basis, v) => {
    if (v == null) return "—";
    if (basis === "EXPEND" || basis === "EXPEND_X" || basis === "VEHICLE") return fmt.dollarsK(v);
    if (basis === "SQFT") return v.toLocaleString() + " sf";
    if (basis === "FTE") return (+v).toFixed(2);
    return v.toLocaleString();
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 16 }}>
      <SectionHead
        title="Allocation Bases"
        subtitle="Department × basis matrix. Edits recompute allocations live."
      />

      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", overflowX:"auto" }}>
        <div style={{ minWidth: 880 }}>
          <div style={{
            display:"grid", gridTemplateColumns: cols, gap: 8,
            padding:"10px 18px",
            background:"var(--paper-2)", borderBottom:"1px solid var(--rule-strong)",
            fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
            letterSpacing:"0.08em", color:"var(--ink-3)", textTransform:"uppercase",
          }}>
            <div>Department</div>
            <div>Type</div>
            {bases.map(b => (
              <div key={b.id} style={{ textAlign:"right" }} title={b.description}>
                {b.id} <span style={{ color:"var(--ink-4)", fontWeight: 400 }}>({b.unit})</span>
              </div>
            ))}
          </div>

          {/* Indirect first */}
          {[...model.indirectDepts, ...model.directDepts].map((d, idx, arr) => {
            const isFirstDirect = d.kind === "direct" && (idx === 0 || arr[idx - 1].kind !== "direct");
            return (
              <React.Fragment key={d.id}>
                {isFirstDirect ? (
                  <div style={{
                    padding:"6px 18px",
                    fontFamily:"var(--ff-mono)", fontSize: 10, fontWeight: 600,
                    letterSpacing:"0.1em", color:"var(--ink-3)",
                    textTransform:"uppercase",
                    background:"var(--paper-2)", borderTop:"1px dashed var(--rule)", borderBottom:"1px solid var(--rule)",
                  }}>Direct departments — receive final allocated cost</div>
                ) : null}
                {idx === 0 ? (
                  <div style={{
                    padding:"6px 18px",
                    fontFamily:"var(--ff-mono)", fontSize: 10, fontWeight: 600,
                    letterSpacing:"0.1em", color:"var(--ink-3)",
                    textTransform:"uppercase",
                    background:"var(--paper-2)", borderBottom:"1px solid var(--rule)",
                  }}>Indirect departments — stepped down in order (closed once allocated)</div>
                ) : null}

                <div style={{
                  display:"grid", gridTemplateColumns: cols, gap: 8,
                  padding:"4px 18px",
                  borderBottom:"1px solid var(--rule)",
                  alignItems:"center",
                  background: d.kind === "indirect" ? "oklch(99% 0.005 60)" : "var(--paper)",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap: 8, fontSize: 12.5 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius:"50%",
                      background: d.kind === "direct" ? "var(--accent)" : "var(--ink-4)",
                    }}/>
                    {d.name}
                  </div>
                  <div className="mono" style={{
                    fontSize: 9.5, fontWeight: 600, letterSpacing:"0.08em",
                    color: d.kind === "direct" ? "var(--accent)" : "var(--ink-3)",
                    textTransform:"uppercase",
                  }}>{d.kind}</div>
                  {bases.map(b => (
                    <CellInput key={b.id}
                      type="number"
                      align="right"
                      value={model.drivers[d.id]?.[b.id] ?? 0}
                      onChange={v => actions.updateDriver(d.id, b.id, +v || 0)}
                    />
                  ))}
                </div>
              </React.Fragment>
            );
          })}

          {/* Totals */}
          <div style={{
            display:"grid", gridTemplateColumns: cols, gap: 8,
            padding:"12px 18px",
            background:"var(--paper-2)",
            borderTop:"2px solid var(--ink)",
            alignItems:"center",
            fontFamily:"var(--ff-mono)",
            fontVariantNumeric:"tabular-nums",
          }}>
            <div className="mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing:"0.12em", textTransform:"uppercase" }}>Total</div>
            <div/>
            {bases.map(b => (
              <div key={b.id} style={{ textAlign:"right", fontSize: 12.5, fontWeight: 600 }}>
                {fmtDriver(b.id, totals[b.id])}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

// =========================================================================
// STEP 4 — Allocation matrix (Initial → Final via step-down, with cell trace)
// =========================================================================
function Step4Matrix({ model }) {
  const [view, setView] = uS2("final");      // "initial" | "final"
  const [openCell, setOpenCell] = uS2(null); // { poolId, deptId }

  // Initial view shows ALL depts (pools sit on their home indirects); final shows direct only.
  const cols = view === "initial" ? model.departments : model.directDepts;
  const allocSrc = view === "initial" ? model.alloc1 : model.alloc2;

  const grid = `minmax(220px, 2.2fr) 110px 110px ${cols.map(() => "minmax(85px, 1fr)").join(" ")} 110px`;

  // Row totals per pool
  const rowTotal = (poolId) => cols.reduce((a, d) => a + (allocSrc[poolId]?.[d.id] || 0), 0);
  // Col totals per dept
  const colTotal = (deptId) => model.pools.reduce((a, p) => a + (allocSrc[p.id]?.[deptId] || 0), 0);
  const grandTotal = model.pools.reduce((a, p) => a + rowTotal(p.id), 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 16 }}>
      <SectionHead
        title="Allocation matrix · step-down method"
        subtitle={`Each pool starts on its home indirect dept (Initial). Indirect depts are stepped down in the order shown in Step 1: when a dept is closed, its current balance is pushed to all depts BELOW it in the order using each pool’s own basis. After ${model.indirectDepts.length} steps all cost has settled on direct departments.`}
        right={
          <div style={{ display:"flex", gap: 0, border:"1px solid var(--rule)" }}>
            {[
              { id:"initial", label:"Initial placement" },
              { id:"final", label:"Final (after step-down)" },
            ].map((opt, i) => (
              <button key={opt.id} onClick={() => setView(opt.id)} style={{
                padding:"7px 12px",
                fontSize: 11.5, fontWeight: 600,
                background: view === opt.id ? "var(--ink)" : "var(--paper)",
                color:      view === opt.id ? "var(--paper)" : "var(--ink-2)",
                borderRight: i === 0 ? "1px solid var(--rule)" : "none",
              }}>{opt.label}</button>
            ))}
          </div>
        }
      />

      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", overflowX:"auto" }}>
        <div style={{ minWidth: 1000 }}>
          {/* Header */}
          <div style={{
            display:"grid", gridTemplateColumns: grid, gap: 8,
            padding:"10px 14px",
            background:"var(--paper-2)", borderBottom:"1px solid var(--rule-strong)",
            fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
            letterSpacing:"0.06em", color:"var(--ink-3)", textTransform:"uppercase",
          }}>
            <div>Pool · Center</div>
            <div style={{ textAlign:"right" }}>Amount</div>
            <div>Basis</div>
            {cols.map(d => (
              <div key={d.id} style={{
                textAlign:"right",
                color: d.kind === "direct" ? "var(--ink-2)" : "var(--ink-4)",
              }}>
                {d.id}
              </div>
            ))}
            <div style={{ textAlign:"right" }}>Row total</div>
          </div>

          {/* Rows */}
          {model.pools.map(p => {
            const center = model.centers.find(c => c.id === p.centerId);
            const rt = rowTotal(p.id);
            const leak = view === "final" ? (p.amount - rt) : 0;
            return (
              <div key={p.id} style={{
                display:"grid", gridTemplateColumns: grid, gap: 8,
                padding:"6px 14px",
                borderBottom:"1px solid var(--rule)",
                alignItems:"center",
                fontFamily:"var(--ff-mono)",
                fontVariantNumeric:"tabular-nums",
              }}>
                <div style={{ fontFamily:"var(--ff-ui)", fontSize: 12.5, lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color:"var(--ink-4)", marginTop: 1 }}>{center?.name || "—"}</div>
                </div>
                <div style={{ textAlign:"right", fontSize: 12 }}>{fmt.dollarsK(p.amount)}</div>
                <div style={{ fontSize: 11, color:"var(--ink-3)" }}>{p.basis}</div>
                {cols.map(d => {
                  const v = allocSrc[p.id]?.[d.id] || 0;
                  const isOpen = openCell && openCell.poolId === p.id && openCell.deptId === d.id;
                  const isZero = v < 0.5;
                  const isIndirectInPass1 = view === "initial" && d.kind === "indirect" && v > 0;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setOpenCell(isOpen ? null : { poolId: p.id, deptId: d.id })}
                      style={{
                        textAlign:"right",
                        fontSize: 11.5,
                        padding:"3px 4px",
                        color: isZero ? "var(--ink-4)" : (isIndirectInPass1 ? "var(--ink-3)" : "var(--ink)"),
                        fontWeight: isOpen ? 700 : 500,
                        background: isOpen ? "var(--accent-tint)" : "transparent",
                        border: isOpen ? "1px solid var(--accent)" : "1px solid transparent",
                        cursor: isZero ? "default" : "pointer",
                      }}
                      title={isZero ? "—" : `${fmt.dollars(v)} — click for trace`}
                    >
                      {isZero ? "—" : fmt.dollarsK(v)}
                    </button>
                  );
                })}
                <div style={{
                  textAlign:"right", fontSize: 12, fontWeight: 600,
                  color: Math.abs(leak) > 1 ? "var(--warn)" : "var(--ink)",
                }}>
                  {fmt.dollarsK(rt)}
                  {Math.abs(leak) > 1 ? <div style={{ fontSize: 9.5, color:"var(--warn)" }}>leak {fmt.dollars(leak)}</div> : null}
                </div>
              </div>
            );
          })}

          {/* Column totals */}
          <div style={{
            display:"grid", gridTemplateColumns: grid, gap: 8,
            padding:"12px 14px",
            background:"var(--paper-2)",
            borderTop:"2px solid var(--ink)",
            alignItems:"center",
            fontFamily:"var(--ff-mono)",
            fontVariantNumeric:"tabular-nums",
          }}>
            <div className="mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing:"0.1em", textTransform:"uppercase" }}>Column total</div>
            <div style={{ textAlign:"right", fontSize: 12.5, fontWeight: 600 }}>{fmt.dollarsK(model.totals.totalCAP)}</div>
            <div/>
            {cols.map(d => (
              <div key={d.id} style={{
                textAlign:"right", fontSize: 12, fontWeight: 600,
                color: d.kind === "indirect" && view === "pass1" ? "var(--ink-3)" : "var(--ink)",
              }}>
                {fmt.dollarsK(colTotal(d.id))}
              </div>
            ))}
            <div style={{ textAlign:"right", fontSize: 13, fontWeight: 700 }}>{fmt.dollarsK(grandTotal)}</div>
          </div>
        </div>
      </div>

      {/* Cell trace panel */}
      {openCell ? (
        <CellTracePanel model={model} cell={openCell} view={view} onClose={() => setOpenCell(null)}/>
      ) : (
        <div style={{
          padding:"14px 18px",
          background:"var(--paper-2)", border:"1px solid var(--rule)",
          fontSize: 12, color:"var(--ink-3)",
        }}>
          <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--ink-2)" }}>Trace</span>
          <span style={{ marginLeft: 10 }}>Click any non-zero cell to see its formula, driver inputs, and (for Final) the pass-2 contributions from each indirect department.</span>
        </div>
      )}

    </div>
  );
}

// Cell trace — formula, inputs, pass-2 contributions
function CellTracePanel({ model, cell, view, onClose }) {
  const pool = model.pools.find(p => p.id === cell.poolId);
  const dept = model.departments.find(d => d.id === cell.deptId);
  if (!pool || !dept) return null;

  const basis = pool.basis;
  const isDirectCharge = basis === "DIRECT";
  const initialValue = model.alloc1[pool.id]?.[dept.id] || 0;
  const finalValue   = model.alloc2[pool.id]?.[dept.id] || 0;
  const homeDept = model.departments.find(d => d.id === pool.centerId);

  // Step-down contributions: which step (which indirect dept being closed) sent
  // dollars of THIS pool to THIS dept. Pulled from model.stepEvents.
  const stepContribs = [];
  if (view === "final" && dept.kind === "direct" && !isDirectCharge) {
    model.stepEvents.forEach(ev => {
      const dist = ev.distributions.find(x => x.poolId === pool.id);
      if (!dist) return;
      const amt = dist.distributed[dept.id] || 0;
      if (amt > 0.5) {
        stepContribs.push({ from: ev.fromName, step: ev.stepIndex + 1, amount: amt });
      }
    });
  }
  // For the formula box: at the step where the home dept is closed, what fraction
  // of receivers does THIS dept represent? (only meaningful when dept is in receivers set)
  let firstStep = null;
  if (!isDirectCharge && homeDept) {
    const homeIdx = model.stepOrder.findIndex(d => d.id === homeDept.id);
    if (homeIdx >= 0) {
      const receivers = [...model.stepOrder.slice(homeIdx + 1), ...model.directDepts];
      const totalDriver = receivers.reduce((a, r) => a + (model.drivers[r.id]?.[basis] || 0), 0);
      const myDriver = model.drivers[dept.id]?.[basis] || 0;
      firstStep = { homeName: homeDept.name, totalDriver, myDriver,
        share: totalDriver > 0 ? myDriver / totalDriver : 0 };
    }
  }

  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--accent)" }}>
      <div style={{
        display:"flex", alignItems:"center",
        padding:"12px 16px", borderBottom:"1px solid var(--rule)",
        background:"var(--accent-tint)",
      }}>
        <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing:"0.12em", color:"var(--accent)", textTransform:"uppercase" }}>Cell trace</div>
        <div style={{ marginLeft: 12, fontSize: 13, fontWeight: 600 }}>
          {pool.name} → {dept.name}
        </div>
        <button onClick={onClose} style={{ marginLeft:"auto", color:"var(--ink-3)" }}><Icon name="close" size={13}/></button>
      </div>

      <div style={{ padding:"14px 16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap: 24 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 8 }}>Pool inputs</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"4px 12px", fontSize: 12 }}>
            <div style={{ color:"var(--ink-3)" }}>Pool ID</div>          <div className="mono">{pool.id}</div>
            <div style={{ color:"var(--ink-3)" }}>Center</div>           <div>{model.centers.find(c => c.id === pool.centerId)?.name || "—"}</div>
            <div style={{ color:"var(--ink-3)" }}>Total amount</div>     <div className="num" style={{ fontWeight: 600 }}>{fmt.dollars(pool.amount)}</div>
            <div style={{ color:"var(--ink-3)" }}>Basis</div>            <div className="mono">{pool.basis}</div>
            {isDirectCharge ? (
              <>
                <div style={{ color:"var(--ink-3)" }}>Direct to</div>      <div>{model.departments.find(d => d.id === pool.directTo)?.name || "—"}</div>
              </>
            ) : (
              <>
                <div style={{ color:"var(--ink-3)" }}>Home (initial)</div>  <div>{homeDept?.name || "—"}</div>
                {firstStep ? (
                  <>
                    <div style={{ color:"var(--ink-3)" }}>{dept.name} driver</div>          <div className="num">{firstStep.myDriver?.toLocaleString()}</div>
                    <div style={{ color:"var(--ink-3)" }}>{basis} ÷ receivers @ step</div>   <div className="num">{firstStep.totalDriver?.toLocaleString()}</div>
                    <div style={{ color:"var(--ink-3)" }}>1st-step share</div>               <div className="num">{(firstStep.share * 100).toFixed(2)}%</div>
                  </>
                ) : null}
              </>
            )}
          </div>
          {pool.explanation ? (
            <div style={{
              marginTop: 12, padding:"8px 10px", background:"var(--paper-2)",
              fontSize: 11.5, color:"var(--ink-2)", lineHeight: 1.5,
              borderLeft:"2px solid var(--ink-3)",
            }}>
              <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", marginRight: 6 }}>Rationale</span>
              {pool.explanation}
            </div>
          ) : null}
        </div>

        <div>
          <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 8 }}>Computation</div>
          {isDirectCharge ? (
            <div style={{ fontSize: 12.5, fontFamily:"var(--ff-mono)", padding:"10px 12px", background:"var(--paper-2)", border:"1px solid var(--rule)" }}>
              direct charge → {fmt.dollars(pool.amount)}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, fontFamily:"var(--ff-mono)", padding:"10px 12px", background:"var(--paper-2)", border:"1px solid var(--rule)", lineHeight: 1.7 }}>
              <div>Initial = {fmt.dollarsK(pool.amount)} on {homeDept?.name || "—"}</div>
              {dept.kind === "direct" ? (
                <div style={{ color:"var(--ink-3)" }}>Final = sum of step-down contributions →</div>
              ) : null}
              {dept.kind === "indirect" && view === "initial" ? (
                <div style={{ color:"var(--accent)", fontWeight: 600 }}>= {fmt.dollars(initialValue)}</div>
              ) : null}
            </div>
          )}

          {view === "final" && dept.kind === "direct" && stepContribs.length > 0 ? (
            <>
              <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase", margin:"14px 0 6px" }}>
                Step-down contributions
              </div>
              <div style={{ border:"1px solid var(--rule)" }}>
                {stepContribs.filter(c => c.amount > 0.5).map((c, i, arr) => (
                  <div key={i} style={{
                    display:"flex", justifyContent:"space-between", gap: 12, alignItems:"baseline",
                    padding:"5px 10px",
                    fontSize: 11.5,
                    borderBottom: i < arr.length - 1 ? "1px solid var(--rule)" : "none",
                  }}>
                    <span style={{ color:"var(--ink-3)", minWidth: 0, overflowWrap:"anywhere" }}>
                      <span className="mono" style={{ fontSize: 9.5, color:"var(--ink-4)", marginRight: 6 }}>step {c.step}</span>
                      {c.from}
                    </span>
                    <span className="mono" style={{ fontWeight: 500, whiteSpace:"nowrap" }}>{fmt.dollars(c.amount)}</span>
                  </div>
                ))}
                <div style={{
                  display:"flex", justifyContent:"space-between",
                  padding:"6px 10px",
                  background:"var(--paper-2)",
                  fontSize: 12, fontWeight: 700,
                  borderTop:"2px solid var(--ink)",
                }}>
                  <span>Final</span>
                  <span className="mono">{fmt.dollars(finalValue)}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// STEP 5 — Department summary
// =========================================================================
function Step5Summary({ model }) {
  const direct = model.directDepts;
  const total = model.totals.totalAllocated;
  const cap = model.totals.totalCAP;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 16 }}>
      <SectionHead
        title="Department summary"
        subtitle="Final allocated indirect cost for each direct department, broken down by cost pool. Recoverability and fee policy are decided downstream — this is the CAP's only output."
        right={<Btn kind="ghost"><Icon name="download" size={13}/> Export CSV</Btn>}
      />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 12 }}>
        <KpiTile label="Total allocated"     value={fmt.dollarsK(total)} sub={`${direct.length} direct departments`} tone="pos"/>
        <KpiTile label="Total CAP scope"     value={fmt.dollarsK(cap)} sub="From cost pools (Step 2)"/>
        <KpiTile label="Conservation check"  value={Math.abs(cap - total) < 1 ? "Balanced" : `Δ ${fmt.dollars(cap - total)}`} sub={Math.abs(cap - total) < 1 ? "Σ pools = Σ direct depts" : "Engine warning"} tone={Math.abs(cap - total) < 1 ? "pos" : "warn"}/>
      </div>

      {/* Per-dept cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap: 14 }}>
        {direct.map(d => {
          const myAlloc = model.allocRows.filter(r => r.dept === d.id).filter(r => r.allocated > 0.5);
          // sort biggest first
          myAlloc.sort((a, b) => b.allocated - a.allocated);
          const totalForDept = model.deptOH[d.id]?.allocatedCAP || 0;
          return (
            <div key={d.id} style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
              <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--rule)", display:"flex", alignItems:"center" }}>
                <div>
                  <div className="display" style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</div>
                  <div className="mono" style={{ fontSize: 10.5, color:"var(--ink-3)", marginTop: 2 }}>
                    {myAlloc.length} pool{myAlloc.length === 1 ? "" : "s"} contributing
                  </div>
                </div>
                <div style={{ marginLeft:"auto", textAlign:"right" }}>
                  <div className="display num" style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric:"tabular-nums" }}>
                    {fmt.dollars(totalForDept)}
                  </div>
                  <div className="mono" style={{ fontSize: 10, color:"var(--ink-3)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
                    Total allocated
                  </div>
                </div>
              </div>

              <div>
                {myAlloc.map((r, i) => {
                  const pool = model.pools.find(p => p.id === r.poolId);
                  const center = model.centers.find(c => c.id === pool?.centerId);
                  const pct = totalForDept > 0 ? r.allocated / totalForDept : 0;
                  return (
                    <div key={r.poolId} style={{
                      display:"grid",
                      gridTemplateColumns:"minmax(200px, 1.8fr) 50px 110px",
                      gap: 12,
                      padding:"7px 18px",
                      borderBottom: i < myAlloc.length - 1 ? "1px solid var(--rule)" : "none",
                      alignItems:"center",
                      gap: 12,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{pool?.name || r.poolName}</div>
                        <div className="mono" style={{ fontSize: 9.5, color:"var(--ink-4)", marginTop: 1 }}>{center?.name || ""}</div>
                      </div>
                      <div style={{ position:"relative", height: 6, background:"var(--paper-2)" }}>
                        <div style={{ position:"absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, pct * 100)}%`, background:"var(--ink-2)" }}/>
                      </div>
                      <div style={{ textAlign:"right", fontFamily:"var(--ff-mono)", fontSize: 12, fontWeight: 600, fontVariantNumeric:"tabular-nums" }}>
                        {fmt.dollars(r.allocated)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

window.Step5Summary = Step5Summary;

// =========================================================================
// Shared bits: SectionHead, Trace, Tile
// =========================================================================
function SectionHead({ eyebrow, title, subtitle, right }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing:"0.14em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 5 }}>
            {eyebrow}
          </div>
        ) : null}
        <div className="display" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 12.5, color:"var(--ink-3)", marginTop: 5, maxWidth: 760, lineHeight: 1.5 }}>{subtitle}</div>
        ) : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function Trace({ text }) {
  return (
    <div style={{
      display:"flex", gap: 10, alignItems:"flex-start",
      padding:"10px 14px",
      background:"var(--paper-2)", border:"1px solid var(--rule)",
      fontSize: 12, color:"var(--ink-3)", lineHeight: 1.5,
    }}>
      <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing:"0.12em", color:"var(--ink-2)", textTransform:"uppercase", flexShrink: 0, paddingTop: 1 }}>Note</span>
      <span>{text}</span>
    </div>
  );
}

// =========================================================================
// Main screen — wires steps together
// =========================================================================
function CapBuilderScreen() {
  const CAP = window.AFFERENT_CAP;
  const model = CAP.useCAPModel();
  const [step, setStep] = uS2("centers");

  const t = model.totals;

  return (
    <div className="page">
      <PageHeader
        eyebrow={<NodeEyebrow node="cap"/>}
        title="Cost Allocation"
        subtitle="Citywide indirect, allocated to direct departments."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      {/* Compact status row — replaces large KPI tiles */}
      {(() => {
        const pct = t.totalCAP > 0 ? Math.round(t.totalAllocated / t.totalCAP * 100) : 0;
        return (
          <StatusRow items={[
            `${model.centers.length} centers`,
            `${model.pools.length} pools`,
            `${pct}% allocated`,
            { value: model.warnings.length === 0 ? "Balanced" : `${model.warnings.length} unresolved`, tone: model.warnings.length === 0 ? "pos" : "warn" },
            "Step-down · FY 2026-27",
          ]}/>
        );
      })()}

      {/* ONE primary summary table — indirect allocation methodology */}
      {(() => {
        const liveModel = window.AFFERENT_ENGINE.computeModel();
        const depts = ["PLAN","BLDG","ENG"];
        const labelOf = d => d === "PLAN" ? "Planning" : d === "BLDG" ? "Building" : "Engineering";
        const tbRows = depts.map(d => {
          const f = liveModel.fbhr[d];
          const oh = model.deptOH[d];
          const allocRows = (model.allocRows || []).filter(r => r.dept === d);
          const byPool = {};
          allocRows.forEach(r => { byPool[r.poolId] = (byPool[r.poolId] || 0) + (r.allocated || 0); });
          const sorted = Object.entries(byPool).sort((a,b) => b[1] - a[1]);
          const poolCount = sorted.filter(([,v]) => v > 0).length;
          const top = sorted[0];
          const topPool = top ? (model.pools.find(p => p.id === top[0])) : null;
          const topPct = top && oh && oh.allocatedCAP > 0 ? Math.round(top[1] / oh.allocatedCAP * 100) : 0;
          const capRate = f ? Math.round(f.indirectRate || 0) : 0;

          return {
            key: d,
            cells: {
              dept: <span style={{ display:"inline-flex", alignItems:"center", gap: 8 }}><DeptChip code={d}/><span style={{ fontWeight: 500 }}>{labelOf(d)}</span></span>,
              alloc: oh ? fmt.dollarsK(oh.allocatedCAP) : "—",
              perHr: capRate > 0 ? `$${capRate}` : "—",
              pools: poolCount,
              top: topPool ? <span><span style={{ color:"var(--ink)" }}>{topPool.name}</span><span style={{ color:"var(--ink-3)", marginLeft: 8 }}>({topPct}%)</span></span> : <span style={{ color:"var(--ink-3)" }}>—</span>,
            },
            drilldown: (
              <div style={{ paddingTop: 8, display:"flex", flexDirection:"column", gap: 14 }}>
                {/* Primary ledger — pool-by-pool allocation */}
                <div style={{ border:"1px solid var(--rule)", background:"var(--paper)" }}>
                  <div style={{
                    padding:"8px 12px", borderBottom:"1px solid var(--rule)",
                    background:"var(--paper-2)",
                    display:"grid", gridTemplateColumns:"1fr 160px 80px 110px", gap: 12,
                    fontSize: 10, fontWeight: 600, letterSpacing:"0.08em",
                    color:"var(--ink-3)", textTransform:"uppercase",
                  }}>
                    <div>Pool</div>
                    <div>Basis</div>
                    <div style={{ textAlign:"right" }}>Share</div>
                    <div style={{ textAlign:"right" }}>Allocated</div>
                  </div>
                  {sorted.filter(([, amt]) => amt > 0).slice(0, 8).map(([poolId, amt], idx, arr) => {
                    const pool = model.pools.find(p => p.id === poolId);
                    if (!pool) return null;
                    const pct = oh && oh.allocatedCAP > 0 ? Math.round(amt / oh.allocatedCAP * 100) : 0;
                    return (
                      <div key={poolId} style={{
                        padding:"7px 12px",
                        display:"grid", gridTemplateColumns:"1fr 160px 80px 110px", gap: 12,
                        borderBottom: idx < arr.length - 1 ? "1px solid var(--rule)" : "none",
                        fontSize: 12, alignItems:"baseline",
                      }}>
                        <span style={{ color:"var(--ink-2)" }}>{pool.name}</span>
                        <span className="mono" style={{ color:"var(--ink-3)", fontSize: 11 }}>{pool.basis}</span>
                        <span className="num" style={{ textAlign:"right", color:"var(--ink-3)" }}>{pct}%</span>
                        <span className="num" style={{ textAlign:"right", fontWeight: 600 }}>{fmt.dollars(amt)}</span>
                      </div>
                    );
                  })}
                  <div style={{
                    padding:"8px 12px",
                    display:"grid", gridTemplateColumns:"1fr 160px 80px 110px", gap: 12,
                    borderTop:"1px solid var(--rule-strong)",
                    background:"var(--paper-2)",
                    fontSize: 12, fontWeight: 600, alignItems:"baseline",
                  }}>
                    <span style={{ color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.06em", fontSize: 10 }}>Total to {labelOf(d)}</span>
                    <span/>
                    <span className="num" style={{ textAlign:"right" }}>100%</span>
                    <span className="num" style={{ textAlign:"right" }}>{oh ? fmt.dollars(oh.allocatedCAP) : "—"}</span>
                  </div>
                </div>

                {/* Compact metadata grid — ledger style, no prose */}
                <div style={{
                  display:"grid", gridTemplateColumns:"160px 1fr", gap:"6px 14px",
                  fontSize: 12, lineHeight: 1.5,
                }}>
                  <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Allocation basis</div>
                  <div style={{ color:"var(--ink-2)" }}>Pool-specific drivers — FTE, sq ft, IT seats, payroll $</div>

                  <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Method</div>
                  <div style={{ color:"var(--ink-2)" }}>Step-down · {labelOf(d)} is a receiver-only department</div>

                  <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Formula</div>
                  <div>
                    <Formula>$/hr = allocated $ ÷ productive hrs</Formula>
                    <span style={{ marginLeft: 8, color:"var(--ink-3)" }}>
                      = {oh ? fmt.dollarsK(oh.allocatedCAP) : "—"} ÷ {f ? Math.round(f.productiveHours).toLocaleString() : "—"} hrs
                      {capRate > 0 && <span style={{ marginLeft: 6, color:"var(--ink)", fontWeight: 600 }}>= ${capRate}/hr</span>}
                    </span>
                  </div>

                  <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Pool source</div>
                  <div style={{ color:"var(--ink-2)" }}>FY 26-27 Adopted Budget · by cost center</div>

                  <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", paddingTop: 2 }}>Driver source</div>
                  <div style={{ color:"var(--ink-2)" }}>HRIS (FTE) · Facilities (sq ft) · IT (seats) · Payroll (wages)</div>
                </div>
              </div>
            ),
          };
        });
        return (
          <DeptSummaryTable
            title="Allocated overhead by department"
            cols={[
              { key:"dept",  label:"Department",            width:"1.5fr" },
              { key:"alloc", label:"Allocated overhead",    width:"160px", align:"right", mono:true },
              { key:"perHr", label:"$/hr",                  width:"110px", align:"right", mono:true },
              { key:"pools", label:"Pools",                 width:"70px",  align:"right", mono:true },
              { key:"top",   label:"Largest contributor",   width:"1.5fr" },
            ]}
            rows={tbRows}
            footer={{
              dept: <span style={{ color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.06em", fontSize: 11 }}>Allocated to fee depts</span>,
              alloc: fmt.dollarsK(t.totalAllocated),
              perHr: "—",
              pools: model.pools.length,
              top: <span style={{ color:"var(--ink-3)" }}>{t.totalCAP > 0 ? Math.round(t.totalAllocated/t.totalCAP*100) : 0}% of {fmt.dollarsK(t.totalCAP)} pool</span>,
            }}
          />
        );
      })()}

      <CapStepNav current={step} onJump={setStep}/>

      <ValidationBanner warnings={model.warnings}/>

      {step === "centers"  ? <Step1Centers  model={model} actions={CAP.actions}/> : null}
      {step === "pools"    ? <Step2Pools    model={model} actions={CAP.actions}/> : null}
      {step === "drivers"  ? <Step3Drivers  model={model} actions={CAP.actions}/> : null}
      {step === "matrix"   ? <Step4Matrix   model={model}/> : null}
    </div>
  );
}

window.CapBuilderScreen = CapBuilderScreen;
