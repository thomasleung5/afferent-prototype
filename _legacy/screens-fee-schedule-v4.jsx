// screens-fee-schedule-v4.jsx — Fee Schedule (restrained refinement)
//
// Walks back from the v3 "Council Adoption Workbench" toward the v2 decision
// queue, keeping only the institutional clarity that didn't add visual weight:
//
//   - Lifecycle states are real (Pending → Reviewed → Ready → Adopted, plus
//     Deferred), but exposed as a single understated chip per row, not a row
//     of buttons. Decisions advance via a small popover on hover/click.
//   - Column headers in plain language ("Recovery target", "Volume",
//     "Confidence") — no analyst abbreviations like TGT/VOL/CONF.
//   - Headline returns to a decision question: "What fees do we adopt?"
//   - No right rail. No staff-report panel. No procedural ribbons.
//   - Quiet hover-only row actions.
//
// Visual goal: institutional finance software, not government workflow admin.

const { useState: uS_FS4, useMemo: uM_FS4 } = React;

// Lifecycle states — kept as named record states (not just UI flags), but
// surfaced subtly. Deferred is set-aside; rank irrelevant for sorting.
const FS4_STATE = {
  PENDING:  { k:"PENDING",  label:"Pending review" },
  REVIEWED: { k:"REVIEWED", label:"Staff reviewed" },
  READY:    { k:"READY",    label:"Ready for council" },
  ADOPTED:  { k:"ADOPTED",  label:"Adopted" },
  DEFERRED: { k:"DEFERRED", label:"Deferred" },
};

function FeeScheduleScreenV4() {
  const ENG = window.AFFERENT_ENGINE;
  const model = ENG.useModel();
  // Subscribe to CAP changes too — fee math depends on CAP-driven cost.
  window.AFFERENT_CAP.useCAPModel();
  const services = model.services;

  // UI state
  const [filter, setFilter] = uS_FS4("ALL");
  const [deptFilter, setDeptFilter] = uS_FS4("ALL");
  const [scenario, setScenario] = uS_FS4("proposed");
  // Saved scenarios — snapshots of the working state (recovery targets, subsidies,
  // and lifecycle states) keyed off a custom k.  "current" / "proposed" are the
  // built-ins; everything in this array is user-saved.
  const [savedScenarios, setSavedScenarios] = uS_FS4([]);
  // Track the snapshot tied to the active saved scenario so we can show a "dirty" dot.
  const [savedSnapshot, setSavedSnapshot] = uS_FS4(null);
  const [openId, setOpenId] = uS_FS4(null);
  // serviceId → FS4_STATE key. Default "PENDING".
  const [stateMap, setStateMap] = uS_FS4({});
  const [openStateMenu, setOpenStateMenu] = uS_FS4(null);
  // Sorting — null means use the default priority+confidence ranking.
  const [sortKey, setSortKey] = uS_FS4(null);
  const [sortDir, setSortDir] = uS_FS4("desc");
  const onSort = (k) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" || k === "dept" ? "asc" : "desc"); }
  };
  const stateFor = (id) => stateMap[id] || "PENDING";
  const setState = (id, st) => setStateMap(s => ({ ...s, [id]: st }));

  // Derive priority + confidence for each row
  const enriched = uM_FS4(() => services.map(s => {
    const cost = s.cost || 0;
    const recommended = Math.round(cost * (s.target || 100) / 100 / 5) * 5;
    const annualImpact = (recommended - (s.fee || 0)) * (s.volume || 0);
    const recoveryNow = cost > 0 ? ((s.fee || 0) / cost) * 100 : 0;
    const volume = s.volume || 0;

    // Priority: high if (high impact AND high volume) OR (very large gap)
    const priority =
      annualImpact > 25000 ? "high" :
      annualImpact > 5000  ? "med"  :
      annualImpact > 0     ? "low"  : "none";

    // Confidence: high if hours+volume+recovery all reasonable, low if missing data
    const confidence =
      (volume === 0 || s.hours === 0) ? "low" :
      (recoveryNow > 200 || s.hours < 0.1) ? "low" :
      (volume < 5 || cost < 50) ? "med" : "high";

    return { ...s, recommended, annualImpact, recoveryNow, priority, confidence };
  }), [services]);

  // Filter
  const filtered = enriched.filter(r => {
    if (deptFilter !== "ALL" && r.dept !== deptFilter) return false;
    const st = stateFor(r.id);
    if (filter === "HIGH") return r.priority === "high";
    if (filter === "LOW_CONF") return r.confidence === "low";
    if (filter === "PENDING")  return st === "PENDING";
    if (filter === "READY")    return st === "READY" || st === "REVIEWED";
    if (filter === "ADOPTED")  return st === "ADOPTED";
    return true;
  });

  // Sort: column-driven if user has clicked a header; otherwise the default
  // priority+confidence ranking (high priority + low confidence first).
  const sorted = uM_FS4(() => {
    const arr = [...filtered];
    if (!sortKey) {
      arr.sort((a, b) => {
        const pri = { high: 3, med: 2, low: 1, none: 0 };
        const conf = { low: 3, med: 2, high: 1 };
        const aScore = pri[a.priority] * 10 + conf[a.confidence];
        const bScore = pri[b.priority] * 10 + conf[b.confidence];
        if (aScore !== bScore) return bScore - aScore;
        return b.annualImpact - a.annualImpact;
      });
      return arr;
    }
    const stateRank = { PENDING: 0, REVIEWED: 1, READY: 2, ADOPTED: 3, DEFERRED: 4 };
    const priRank = { none: 0, low: 1, med: 2, high: 3 };
    const confRank = { low: 0, med: 1, high: 2 };
    const get = (r) => {
      switch (sortKey) {
        case "priority":   return priRank[r.priority] || 0;
        case "name":       return r.name || "";
        case "dept":       return r.dept || "";
        case "confidence": return confRank[r.confidence] || 0;
        case "fee":        return r.fee || 0;
        case "cost":       return r.cost || 0;
        case "recommended":return r.recommended || 0;
        case "peer":       return r.peer || 0;
        case "target":     return r.target || 0;
        case "volume":     return r.volume || 0;
        case "impact":     return r.annualImpact || 0;
        case "state":      return stateRank[stateFor(r.id)] ?? 99;
        default:           return 0;
      }
    };
    arr.sort((a, b) => {
      const va = get(a), vb = get(b);
      let c = 0;
      if (typeof va === "number" && typeof vb === "number") c = va - vb;
      else c = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "desc" ? -c : c;
    });
    return arr;
  }, [filtered, sortKey, sortDir, stateMap]);

  // Totals — rolling impact across the lifecycle
  const totals = uM_FS4(() => {
    let adoptedImpact = 0, readyImpact = 0, pendingImpact = 0, deferredImpact = 0;
    let adopted = 0, ready = 0, pending = 0, deferred = 0, reviewed = 0;
    enriched.forEach(r => {
      const st = stateFor(r.id);
      if      (st === "ADOPTED")  { adoptedImpact  += r.annualImpact; adopted++; }
      else if (st === "READY")    { readyImpact    += r.annualImpact; ready++; }
      else if (st === "DEFERRED") { deferredImpact += r.annualImpact; deferred++; }
      else                        { pendingImpact  += r.annualImpact; pending++; }
      if (st === "REVIEWED") reviewed++;
    });
    return { adoptedImpact, readyImpact, pendingImpact, deferredImpact, adopted, ready, pending, deferred, reviewed };
  }, [enriched, stateMap]);

  const updateTarget = (id, v) => ENG.actions.updatePolicy(id, { target: Number(v) });
  const toggleSubsidy = (id, v) => ENG.actions.updatePolicy(id, { subsidy: v });

  // -------- Saved scenarios --------
  // A snapshot captures everything the user has tuned: per-service policy
  // (target, subsidy) and per-service lifecycle state.
  const captureSnapshot = () => ({
    policy: Object.fromEntries(services.map(s => [s.id, { target: s.target, subsidy: !!s.subsidy }])),
    stateMap: { ...stateMap },
  });

  const applySnapshot = (snap) => {
    if (!snap) return;
    services.forEach(s => {
      const p = snap.policy?.[s.id];
      if (p) ENG.actions.updatePolicy(s.id, { target: p.target, subsidy: p.subsidy });
    });
    setStateMap(snap.stateMap || {});
  };

  const snapshotsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const dirty = scenario.startsWith("saved:") && savedSnapshot && !snapshotsEqual(captureSnapshot(), savedSnapshot);

  const handleSaveCurrent = () => {
    const name = (window.prompt("Name this scenario", `Scenario ${savedScenarios.length + 1}`) || "").trim();
    if (!name) return;
    const k = "saved:" + Date.now();
    const snap = captureSnapshot();
    setSavedScenarios(arr => [...arr, { k, label: name, snapshot: snap, savedAt: new Date() }]);
    setScenario(k);
    setSavedSnapshot(snap);
  };

  const handlePickScenario = (k) => {
    setScenario(k);
    if (k.startsWith("saved:")) {
      const sc = savedScenarios.find(s => s.k === k);
      if (sc) {
        applySnapshot(sc.snapshot);
        setSavedSnapshot(sc.snapshot);
      }
    } else {
      setSavedSnapshot(null);
    }
  };

  const handleRenameScenario = (k) => {
    const sc = savedScenarios.find(s => s.k === k);
    if (!sc) return;
    const next = (window.prompt("Rename scenario", sc.label) || "").trim();
    if (!next) return;
    setSavedScenarios(arr => arr.map(s => s.k === k ? { ...s, label: next } : s));
  };

  const handleDuplicateScenario = (k) => {
    const sc = savedScenarios.find(s => s.k === k);
    if (!sc) return;
    const newK = "saved:" + Date.now();
    setSavedScenarios(arr => [...arr, { ...sc, k: newK, label: sc.label + " (copy)", savedAt: new Date() }]);
  };

  const handleDeleteScenario = (k) => {
    if (!window.confirm("Delete this saved scenario? This cannot be undone.")) return;
    setSavedScenarios(arr => arr.filter(s => s.k !== k));
    if (scenario === k) {
      setScenario("proposed");
      setSavedSnapshot(null);
    }
  };

  const handleSaveChanges = () => {
    if (!scenario.startsWith("saved:")) return;
    const snap = captureSnapshot();
    setSavedScenarios(arr => arr.map(s => s.k === scenario ? { ...s, snapshot: snap, savedAt: new Date() } : s));
    setSavedSnapshot(snap);
  };

  const filterCounts = uM_FS4(() => ({
    ALL: enriched.length,
    HIGH: enriched.filter(r => r.priority === "high").length,
    LOW_CONF: enriched.filter(r => r.confidence === "low").length,
    PENDING: enriched.filter(r => stateFor(r.id) === "PENDING").length,
    READY: enriched.filter(r => { const s = stateFor(r.id); return s === "READY" || s === "REVIEWED"; }).length,
    ADOPTED: enriched.filter(r => stateFor(r.id) === "ADOPTED").length,
  }), [enriched, stateMap]);

  return (
    <div className="page">

      <DecisionGravityHeader
        tier="output"
        eyebrow="Fee Schedule"
        title="What fees do we adopt?"
        headline={fmt.dollarsK(totals.adoptedImpact + totals.readyImpact + totals.pendingImpact)}
        headlineSub={
          <>
            <b>{totals.adopted}</b> adopted · <b>{totals.ready + totals.reviewed}</b> ready · <b>{totals.pending}</b> pending review.
          </>
        }
        decisionStatus={null}
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      {/* Scenario scaffolding — Current / Proposed / Adopted / Phased / CPI + saved */}
      <ScenarioSwitcher
        eyebrow="Scenario"
        value={scenario}
        onChange={handlePickScenario}
        onSaveCurrent={handleSaveCurrent}
        onRename={handleRenameScenario}
        onDuplicate={handleDuplicateScenario}
        onDelete={handleDeleteScenario}
        onSaveChanges={dirty ? handleSaveChanges : null}
        dirty={dirty}
        scenarios={[
          { k:"current",  label:"Current schedule",  badge:"adopted"  },
          { k:"proposed", label:"Proposed",          badge:"draft"    },
          ...savedScenarios.map(sc => ({ k: sc.k, label: sc.label, badge: "saved", custom: true })),
          { k:"adopted",  label:"Adopted",           badge:"locked",  disabled:true },
          { k:"phased",   label:"Phased rollout",    badge:"3-year",  disabled:true },
          { k:"cpi",      label:"CPI-adjusted",      badge:"+3.4%",   disabled:true },
        ]}
      />


      {/* Decision queue — wrapped in unified TableToolbar chrome */}
      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
        <window.TableToolbar
          title="Fee decision queue"
          shownCount={sorted.length}
          totalCount={enriched.length}
          filters={[
            {
              id: "queue", label: "Queue",
              options: [
                { value: "ALL",      label: "All",            count: filterCounts.ALL },
                { value: "PENDING",  label: "Pending review", count: filterCounts.PENDING },
                { value: "READY",    label: "Ready",          count: filterCounts.READY },
                { value: "ADOPTED",  label: "Adopted",        count: filterCounts.ADOPTED },
              ],
              value: filter, onChange: setFilter,
            },
            {
              id: "dept", label: "Dept",
              options: [
                { value: "ALL",  label: "All" },
                { value: "PLAN", label: "Planning" },
                { value: "BLDG", label: "Building" },
                { value: "ENG",  label: "Engineering" },
              ],
              value: deptFilter, onChange: setDeptFilter,
            },
          ]}
        />
        {(() => {
          const HCOLS = [
            { key: "name",        label: "Fee item",    align: "left",  sortable: true },
            { key: "dept",        label: "Dept",        align: "left",  sortable: true },
            { key: "fee",         label: "Now",         align: "right", sortable: true,  title: "Today's fee" },
            { key: "cost",        label: "Cost",        align: "right", sortable: true,  title: "Full unit cost (hours × FBHR)" },
            { key: "recommended", label: "Recommended", align: "right", sortable: true,  title: "Recommended fee = cost × target, rounded", emphasized: true },
            { key: "peer",        label: "Peer median", align: "right", sortable: true,  title: "Median fee across peer cities (Atherton, Portola Valley, Woodside, Hillsborough, Monte Sereno)" },
            { key: "target",      label: "Recovery",    align: "right", sortable: true,  title: "Cost recovery target" },
            { key: "impact",      label: "Impact",      align: "right", sortable: true,  title: "Annual revenue change vs. today" },
            { key: "state",       label: "Status",      align: "right", sortable: true },
            { key: "_chev",       label: "",            align: "right", sortable: false },
          ];
          return (
            <div style={{
              display:"grid",
              gridTemplateColumns:"minmax(220px, 2fr) 64px 90px 90px 90px 90px 90px 110px 130px 28px",
              padding:"10px 14px", background:"var(--paper-2)",
              borderBottom:"1px solid var(--rule-strong)",
              fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
              letterSpacing:"0.08em", color:"var(--ink-3)", textTransform:"uppercase",
              alignItems:"end",
            }}>
              {HCOLS.map(c => {
                const isSorted = sortKey === c.key;
                return (
                  <div key={c.key}
                    title={c.title}
                    onClick={c.sortable ? () => onSort(c.key) : undefined}
                    style={{
                      cursor: c.sortable ? "pointer" : "default",
                      color: isSorted ? "var(--ink)" : (c.emphasized ? "var(--ink-2)" : "var(--ink-3)"),
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
          );
        })()}

        {sorted.map(r => {
          const open = openId === r.id;
          const st = stateFor(r.id);
          const isAdopted  = st === "ADOPTED";
          const isReady    = st === "READY" || st === "REVIEWED";
          const isDeferred = st === "DEFERRED";
          return (
            <React.Fragment key={r.id}>
              <div style={{
                display:"grid",
                gridTemplateColumns:"minmax(220px, 2fr) 64px 90px 90px 90px 90px 90px 110px 130px 28px",
                padding:"10px 14px", borderBottom:"1px solid var(--rule)",
                alignItems:"center", gap: 0,
                background: open ? "var(--paper-2)" : "transparent",
                opacity: isDeferred ? 0.6 : 1,
                cursor:"pointer",
              }} onClick={() => setOpenId(open ? null : r.id)}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                  <div style={{ marginTop: 3 }}>
                    <span className="mono" style={{ fontSize: 10.5, color:"var(--ink-3)" }}>{r.id}</span>
                  </div>
                </div>
                <div><DeptChip code={r.dept}/></div>
                <div className="num" style={{ textAlign:"right", fontSize: 13 }}>{fmt.dollars(r.fee)}</div>
                <div className="num" style={{ textAlign:"right", fontSize: 13 }}>{fmt.dollars(r.cost)}</div>
                <div className="num" style={{ textAlign:"right", fontSize: 13 }}>{fmt.dollars(r.recommended)}</div>
                <div className="num" style={{ textAlign:"right", fontSize: 13 }}>{r.peer ? fmt.dollars(r.peer) : "—"}</div>
                <div style={{ textAlign:"right" }}>
                  <span className="num" style={{ fontSize: 13 }}>{r.target}%</span>
                </div>
                <div className="num" style={{ textAlign:"right", fontSize: 13 }}>
                  {r.annualImpact > 0 ? "+" : ""}{fmt.dollarsK(r.annualImpact)}
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ display:"flex", justifyContent:"flex-end" }}>
                  <StateChip
                    state={st}
                    open={openStateMenu === r.id}
                    onToggle={() => setOpenStateMenu(openStateMenu === r.id ? null : r.id)}
                    onSet={(next) => { setState(r.id, next); setOpenStateMenu(null); }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{
                    display: "inline-block", fontSize: 9, color: "var(--ink-3)",
                    transform: open ? "rotate(90deg)" : "none",
                    transition: "transform 100ms",
                    fontFamily: "var(--ff-mono)", lineHeight: 1,
                  }}>▶</span>
                </div>
              </div>

              {open && (
                <DrilldownShell isLast={false}>
                  {/* ① Policy panel */}
                  <DrilldownColumn marker="①" title="Policy">
                    <div style={{ display:"flex", flexDirection:"column", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11.5, color:"var(--ink-3)", marginBottom: 4 }}>Recovery target</div>
                        <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
                          <input type="range" min="0" max="100" step="5" value={r.target}
                            onChange={e => updateTarget(r.id, e.target.value)}
                            style={{ flex: 1, accentColor:"var(--accent)" }}/>
                          <span className="num" style={{ fontSize: 13, fontWeight: 600, minWidth: 42, textAlign:"right" }}>{r.target}%</span>
                        </div>
                      </div>
                      <label style={{ display:"flex", alignItems:"center", gap: 8, fontSize: 12, cursor:"pointer" }}>
                        <input type="checkbox" checked={!!r.subsidy} onChange={e => toggleSubsidy(r.id, e.target.checked)}/>
                        <span>Policy subsidy <span style={{ color:"var(--ink-3)" }}>— intentional under-recovery</span></span>
                      </label>
                      {r.subsidy && (
                        <div style={{ fontSize: 11, color:"var(--ink-3)", padding:"6px 8px", background:"var(--paper)", border:"1px solid var(--rule)", lineHeight: 1.5 }}>
                          {(r.notes || "").trim() || "No subsidy rationale on file. Add a note before adoption."}
                        </div>
                      )}
                    </div>
                  </DrilldownColumn>

                  {/* ② Calculation trace — formula is collapsed by default per audit-on-demand pattern */}
                  <DrilldownColumn marker="②" title="Calculation">
                    <details style={{ marginBottom: 10 }}>
                      <summary style={{
                        cursor: "pointer", listStyle: "none",
                        fontSize: 10.5, fontFamily:"var(--ff-mono)", fontWeight: 600,
                        letterSpacing:"0.08em", textTransform:"uppercase",
                        color:"var(--ink-3)", padding:"4px 0",
                        display:"flex", alignItems:"center", gap: 6,
                      }}>
                        <span style={{ fontSize: 9 }}>▸</span>
                        Show formula
                      </summary>
                      <div style={{
                        marginTop: 8,
                        padding: "12px 14px", background: "var(--paper)",
                        border: "1px solid var(--rule)",
                        fontFamily: "var(--ff-mono)", fontSize: 12, lineHeight: 1.9, color:"var(--ink-2)",
                      }}>
                        <div>{r.hours} hrs × ${Math.round((model.fbhr[r.dept]?.fbhr) || 0)}/hr</div>
                        <div style={{ color:"var(--ink-3)" }}>= ${Math.round(r.cost)} unit cost</div>
                        <div style={{ color:"var(--ink-3)" }}>× {r.target}% recovery target</div>
                        <div style={{ color:"var(--ink-3)" }}>→ rounded to $5</div>
                        <div style={{ borderTop:"1px solid var(--rule)", paddingTop: 6, marginTop: 6 }}>
                          recommended: <b>{fmt.dollars(r.recommended)}</b>
                        </div>
                        <div style={{ color:"var(--ink-3)", marginTop: 4 }}>
                          annual: ${r.recommended} × {r.volume || 0} = <b style={{ color:"var(--ink-2)" }}>{fmt.dollarsK(r.recommended * (r.volume || 0))}</b>
                        </div>
                      </div>
                    </details>

                    {/* Why this fee changed vs current */}
                    {(() => {
                      const delta = r.recommended - (r.fee || 0);
                      if (Math.abs(delta) < 1) return null;
                      const pct = (r.fee || 0) > 0 ? (delta / r.fee) * 100 : 100;
                      const direction = delta > 0 ? "increase" : "decrease";
                      const fbhr = (model.fbhr[r.dept]?.fbhr) || 0;
                      const reasons = [];
                      if (r.target < 100) reasons.push(`policy target set to ${r.target}% (vs 100% full cost)`);
                      if ((r.recoveryNow || 0) < 50 && (r.fee || 0) > 0) reasons.push(`current fee was recovering only ${r.recoveryNow.toFixed(0)}% of cost`);
                      if ((r.fee || 0) === 0) reasons.push("no fee currently charged for this service");
                      if (r.dept === "BLDG" && Math.abs(pct) > 30) reasons.push(`BLDG FBHR is now $${Math.round(fbhr)}/hr after CAP allocation`);
                      if (reasons.length === 0) reasons.push(`hours per unit (${r.hours}) × FBHR ($${Math.round(fbhr)}) yields a different cost basis than the prior schedule`);

                      return (
                        <div style={{
                          marginTop: 12, paddingTop: 12, borderTop:"1px dashed var(--rule)",
                          fontSize: 11.5, color:"var(--ink-2)", lineHeight: 1.55,
                        }}>
                          <div style={{ display:"flex", alignItems:"baseline", gap: 8, marginBottom: 6 }}>
                            <span className="mono" style={{
                              fontSize: 9.5, fontWeight: 700, letterSpacing:"0.1em",
                              color: delta > 0 ? "var(--warn)" : "var(--pos)", textTransform:"uppercase",
                            }}>Why this {direction}</span>
                            <span className="num" style={{ fontSize: 12, fontWeight: 600, color:"var(--ink)" }}>
                              {delta > 0 ? "+" : ""}{fmt.dollars(delta)} {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                            </span>
                          </div>
                          <ul style={{ margin: 0, padding: "0 0 0 16px", listStyle: "disc" }}>
                            {reasons.map((rr, i) => <li key={i} style={{ marginBottom: 2 }}>{rr}</li>)}
                          </ul>
                        </div>
                      );
                    })()}
                  </DrilldownColumn>

                  {/* ③ Confidence + comparators */}
                  <DrilldownColumn marker="③" title="Confidence & comparators">
                    <div style={{ display:"flex", flexDirection:"column", gap: 6, fontSize: 11.5, color:"var(--ink-2)" }}>
                      <ConfReason
                        ok={(r.volume || 0) > 0}
                        text={(r.volume || 0) > 0 ? `Volume: ${r.volume}/yr (FY 24/25 actuals)` : "Volume missing — re-import or estimate"}
                      />
                      <ConfReason
                        ok={(r.hours || 0) > 0}
                        text={(r.hours || 0) > 0 ? `Hours: ${r.hours} per unit (staff estimate)` : "Hours missing — needs staff input"}
                      />
                      <ConfReason
                        ok={r.recoveryNow < 200}
                        text={r.recoveryNow < 200 ? `Current fee recovers approximately ${r.recoveryNow.toFixed(0)}% of estimated cost` : "Current fee suspiciously high vs cost — verify"}
                      />
                      <ConfReason
                        ok={(r.cost || 0) > 50}
                        text={(r.cost || 0) > 50 ? "Unit cost in normal range" : "Unit cost very low — check hours"}
                      />
                    </div>
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--rule)" }}>
                      <div className="mono" style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
                        color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8,
                      }}>Comparable cities</div>
                      {(() => {
                        const peers = (window.AFFERENT_DATA?.CITY?.peers) || [];
                        const median = r.peer || 0;
                        // Stable per-row jitter so the same fee yields the same comparator values
                        const seed = (r.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                        const offsets = [-0.18, -0.07, 0.04, 0.12, 0.22];
                        const rounded = (v) => Math.round(v / 5) * 5;
                        const rows = peers.slice(0, 5).map((city, i) => {
                          const idx = (seed + i) % offsets.length;
                          const value = median > 0 ? rounded(median * (1 + offsets[idx])) : 0;
                          return { city, value };
                        });
                        if (median <= 0) {
                          return (
                            <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
                              No peer data on file for this fee.
                            </div>
                          );
                        }
                        return (
                          <div style={{
                            background: "var(--paper)", border: "1px solid var(--rule)",
                            fontFamily: "var(--ff-mono)", fontSize: 11.5, lineHeight: 1.5,
                          }}>
                            {rows.map((row, i) => (
                              <div key={row.city} style={{
                                display: "flex", justifyContent: "space-between",
                                gap: 10, padding: "7px 12px",
                                borderBottom: i < rows.length - 1 ? "1px solid var(--rule)" : "none",
                                alignItems: "baseline",
                              }}>
                                <span style={{ color: "var(--ink-2)" }}>{row.city}</span>
                                <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                                  ${row.value.toLocaleString()}
                                </span>
                              </div>
                            ))}
                            <div style={{
                              display: "flex", justifyContent: "space-between",
                              padding: "10px 12px", borderTop: "2px solid var(--ink)",
                              fontWeight: 700,
                            }}>
                              <span>Peer median</span>
                              <span>${median.toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </DrilldownColumn>
                </DrilldownShell>
              )}
            </React.Fragment>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--ink-3)", fontSize: 12.5 }}>
            No fees match current filters.
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components --------------------------------------------------------
// PriorityDot, ConfidenceBadge, ConfReason are reused from screens-fee-schedule-v2.jsx
// (declared on window there). Kept out of v4 to avoid duplicate top-level declarations
// when both files are loaded.

// StateChip — a single understated chip that shows lifecycle state and, on click,
// reveals available transitions in a small popover. Replaces the row of three
// always-visible decision buttons. The chip itself is the only visible affordance
// at rest — actions appear only when the user engages with the row.
function StateChip({ state, open, onToggle, onSet }) {
  const meta = FS4_STATE[state] || FS4_STATE.PENDING;
  // Tone: pending = neutral, reviewed/ready = ink, adopted = positive, deferred = muted.
  const tone =
    state === "ADOPTED"  ? { fg:"var(--pos)",  bd:"var(--pos)",          dot:"var(--pos)"   } :
    state === "READY"    ? { fg:"var(--ink)",  bd:"var(--ink-3)",        dot:"var(--ink)"   } :
    state === "REVIEWED" ? { fg:"var(--ink-2)",bd:"var(--rule-strong)",  dot:"var(--ink-2)" } :
    state === "DEFERRED" ? { fg:"var(--ink-3)",bd:"var(--rule)",         dot:"var(--ink-3)" } :
                           { fg:"var(--ink-3)",bd:"var(--rule)",         dot:"var(--ink-4)" };

  // Available transitions per state — named in plain institutional language.
  // The chip popover shows just these. No always-visible button row.
  const transitions = {
    PENDING:  [{ to:"REVIEWED", label:"Mark reviewed"     }, { to:"DEFERRED", label:"Defer" }],
    REVIEWED: [{ to:"READY",    label:"Send to council"   }, { to:"PENDING",  label:"Reopen" }, { to:"DEFERRED", label:"Defer" }],
    READY:    [{ to:"ADOPTED",  label:"Adopt"             }, { to:"REVIEWED", label:"Withdraw" }],
    ADOPTED:  [{ to:"REVIEWED", label:"Reopen"            }],
    DEFERRED: [{ to:"PENDING",  label:"Reopen"            }],
  };
  const opts = transitions[state] || [];

  return (
    <div style={{ position:"relative" }}>
      <button onClick={onToggle} style={{
        display:"inline-flex", alignItems:"center", gap: 6,
        padding:"4px 9px",
        background: "var(--paper)",
        border: "1px solid " + tone.bd,
        color: tone.fg,
        fontSize: 11.5, fontFamily:"var(--ff-sans)", fontWeight: 500,
        cursor:"pointer",
        borderRadius: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius:"50%", background: tone.dot }}/>
        {meta.label}
      </button>
      {open && opts.length > 0 && (
        <div style={{
          position:"absolute", top:"calc(100% + 4px)", right: 0, zIndex: 20,
          background:"var(--paper)",
          border:"1px solid var(--rule-strong)",
          boxShadow:"0 6px 18px rgba(15,23,42,0.08)",
          minWidth: 180,
        }}>
          {opts.map(o => (
            <button key={o.to} onClick={() => onSet(o.to)} style={{
              display:"block", width:"100%", textAlign:"left",
              padding:"8px 12px", background:"transparent", border:"none",
              fontSize: 12, fontFamily:"var(--ff-sans)", color:"var(--ink)",
              cursor:"pointer", borderBottom:"1px solid var(--rule)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  FeeScheduleScreenV4,
  FS4_STATE, StateChip,
});
