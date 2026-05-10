// Recovery Policy — Build Model · between Workload and Cost of Service.
//
// Format mirrors WorkloadModelScreen:
//   - PageHeader (NodeEyebrow eyebrow, title, subtitle, actions)
//   - InputNodeAnswer (per-dept tiles + right-rail summary stats)
//   - FlagStrip
//   - Section table(s)
//
// Positioning: city defines policy targets; Afferent operationalizes them
// downstream into defensible fee recommendations.

const { useState: uS_RP, useMemo: uM_RP } = React;

// ---------- Seed data ----------
const RP_DEPT_DEFAULTS = [
  { id:"plan",  dept:"Planning",        code:"PLAN", target: 70,  note:"General Fund subsidy" },
  { id:"bldg",  dept:"Building",        code:"BLDG", target: 100, note:"Full cost recovery" },
  { id:"eng",   dept:"Engineering",     code:"ENG",  target: 85,  note:"Partial subsidy" },
  { id:"fire",  dept:"Fire Prevention", code:"FIRE", target: 75,  note:"Council policy target" },
];

const RP_EXCEPTION_DEFAULTS = [
  { id:"x1", fee:"ADU Permit",             target: 50, note:"Housing incentive" },
  { id:"x2", fee:"Nonprofit Event Permit", target: 25, note:"Community subsidy" },
  { id:"x3", fee:"Small Solar Permit",     target: 60, note:"Sustainability policy" },
];

// Cost basis used for impact preview (kept stable / inline so this screen is self-contained).
const RP_DEPT_COST = { Planning: 2384243, Building: 1495525, Engineering: 1068037, "Fire Prevention": 720000 };
const RP_DEPT_REV  = { Planning:  341000, Building: 1047781, Engineering:   92960, "Fire Prevention": 540000 };

// ---------- Page ----------
function RecoveryPolicyScreen() {
  const [depts, setDepts]     = uS_RP(RP_DEPT_DEFAULTS);
  const [excepts, setExcepts] = uS_RP(RP_EXCEPTION_DEFAULTS);

  const updateDept = (id, patch) => setDepts(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const updateExc  = (id, patch) => setExcepts(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeExc  = (id)        => setExcepts(rs => rs.filter(r => r.id !== id));
  const addExc     = ()          => setExcepts(rs => [...rs, { id:`x${Date.now()}`, fee:"New fee exception", target: 50, note:"" }]);

  const summary = uM_RP(() => {
    let totalCost = 0, intendedRev = 0, currentRev = 0;
    depts.forEach(d => {
      const cost = RP_DEPT_COST[d.dept] || 0;
      totalCost   += cost;
      intendedRev += cost * (d.target / 100);
      currentRev  += RP_DEPT_REV[d.dept] || 0;
    });
    const overall = totalCost > 0 ? Math.round((intendedRev / totalCost) * 100) : 0;
    const subsidy = totalCost - intendedRev;
    const recoverableGap = Math.max(0, intendedRev - currentRev);
    return { overall, subsidy, recoverableGap };
  }, [depts]);

  // Per-dept tiles, mirroring Workload's InputNodeAnswer shape
  const tiles = depts.map(d => ({
    deptCode: d.code,
    deptName: d.dept,
    value: `${d.target}%`,
    sub: d.target >= 100 ? "Full cost recovery"
       : d.target >= 80  ? "Near-full recovery"
       : d.target >= 60  ? "Partial recovery"
       :                   "Subsidized service",
    formula: null,
    tone: null,
  }));

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <span style={{ display:"inline-flex", alignItems:"center", gap: 10 }}>
            {React.createElement(window.TierBadge, { tier: "policy" })}
            <span style={{ color:"var(--ink-3)" }}>Recovery Policy</span>
          </span>
        }
        title="Recovery Policy"
        subtitle="Recovery targets by department and service category."
        actions={
          <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
        }
      />

      {/* Compact policy context strip — governance, not dashboard */}
      <StatusRow items={[
        `${depts.length} departments`,
        `${excepts.length} fee exception${excepts.length === 1 ? "" : "s"}`,
        { label: "Overall", value: `${summary.overall}%`, tone: summary.overall >= 80 ? "pos" : "warn" },
        `${fmt.dollarsK(summary.subsidy)} annual subsidy`,
        "FY 2026-27",
      ]}/>

      {/* ---------- Section 1 — Department Targets ---------- */}
      <PolicySection
        eyebrow="Section 1"
        title="Department targets"
        description="The intended share of each department's full cost to recover through fees. Anything below 100% is funded by other sources (typically the General Fund)."
      >
        <PolicyTable
          columns={[
            { label:"Department",      width:"minmax(200px, 1.4fr)" },
            { label:"Target Recovery", width:"220px" },
            { label:"Notes",           width:"minmax(220px, 2fr)" },
          ]}
          rows={depts.map(d => ({
            key: d.id,
            cells: [
              <div style={{ display:"inline-flex", alignItems:"center", gap: 8 }}>
                <DeptChip code={d.code}/>
                <span style={{ fontSize: 13.5, color:"var(--ink)", fontWeight: 500 }}>{d.dept}</span>
              </div>,
              <PolicyPercentInput value={d.target} onChange={v => updateDept(d.id, { target: v })}/>,
              <PolicyNoteInput value={d.note} onChange={v => updateDept(d.id, { note: v })} placeholder="Optional policy note"/>,
            ],
          }))}
        />
      </PolicySection>

      {/* ---------- Section 2 — Fee Exceptions ---------- */}
      <PolicySection
        eyebrow="Section 2"
        title="Fee exceptions"
        description="Override department-level targets for specific fees when required by policy."
        action={
          <button onClick={addExc} style={{
            fontSize: 12, color:"var(--accent)", padding:"6px 10px",
            border:"1px solid var(--rule)", background:"var(--paper)",
          }}>+ Add exception</button>
        }
      >
        <PolicyTable
          columns={[
            { label:"Fee",             width:"minmax(220px, 1.4fr)" },
            { label:"Target Recovery", width:"220px" },
            { label:"Policy note",     width:"minmax(220px, 2fr)" },
            { label:"",                width:"32px" },
          ]}
          rows={excepts.map(e => ({
            key: e.id,
            cells: [
              <PolicyTextInput value={e.fee} onChange={v => updateExc(e.id, { fee: v })}/>,
              <PolicyPercentInput value={e.target} onChange={v => updateExc(e.id, { target: v })}/>,
              <PolicyNoteInput value={e.note} onChange={v => updateExc(e.id, { note: v })} placeholder="Optional policy note"/>,
              <button onClick={() => removeExc(e.id)} title="Remove exception" style={{
                width: 22, height: 22, color:"var(--ink-4)",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>×</button>,
            ],
          }))}
        />
      </PolicySection>

      {/* ---------- Section 3 — Policy Impact Summary ---------- */}
      <PolicySection
        eyebrow="Section 3"
        title="Policy impact summary"
        description="A read-only preview of what these targets imply for the FY 2026-27 budget."
      >
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", background:"var(--paper)", border:"1px solid var(--rule)" }}>
          <ImpactStat label="Estimated overall recovery" value={`${summary.overall}%`}            sub="Weighted across all four departments" divider/>
          <ImpactStat label="Estimated annual subsidy"   value={fmt.dollarsK(summary.subsidy)}      sub="Cost not recovered through fees"     divider/>
          <ImpactStat label="Recoverable revenue gap"    value={fmt.dollarsK(summary.recoverableGap)} sub="At current targets vs. today's revenue"/>
        </div>
      </PolicySection>
    </div>
  );
}

// =========================================================================
// Section shell — eyebrow, title, description, optional action, divider.
// =========================================================================
function PolicySection({ eyebrow, title, description, action, children }) {
  return (
    <section style={{ paddingTop: 26, marginTop: 4 }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing:"0.12em",
            color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 6,
          }}>{eyebrow}</div>
          <div className="display" style={{ fontSize: 19, fontWeight: 600, letterSpacing:"-0.01em", color:"var(--ink)" }}>{title}</div>
          {description ? (
            <div style={{ fontSize: 13, color:"var(--ink-3)", lineHeight: 1.5, marginTop: 6, textWrap:"pretty", maxWidth: 720 }}>
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div style={{ paddingTop: 8 }}>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

// =========================================================================
// Table — minimal, thin dividers, generous spacing.
// =========================================================================
function PolicyTable({ columns, rows }) {
  const tpl = columns.map(c => c.width).join(" ");
  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
      <div style={{
        display:"grid", gridTemplateColumns: tpl, gap: 16,
        padding:"12px 20px", borderBottom:"1px solid var(--rule)",
        fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
        letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase",
      }}>
        {columns.map((c, i) => <div key={i} style={{ textAlign: c.align || "left" }}>{c.label}</div>)}
      </div>
      {rows.map((r, idx) => (
        <div key={r.key} style={{
          display:"grid", gridTemplateColumns: tpl, gap: 16,
          padding:"14px 20px",
          borderBottom: idx < rows.length - 1 ? "1px solid var(--rule)" : "none",
          alignItems:"center",
        }}>
          {r.cells.map((cell, i) => <div key={i} style={{ minWidth: 0 }}>{cell}</div>)}
        </div>
      ))}
    </div>
  );
}

// =========================================================================
// Inputs — calm, underline-on-focus, no chrome at rest.
// =========================================================================
function PolicyPercentInput({ value, onChange }) {
  const [focus, setFocus] = uS_RP(false);
  const v = Math.max(0, Math.min(100, +value || 0));
  return (
    <div style={{ display:"flex", alignItems:"center", gap: 12, maxWidth: 220 }}>
      <div style={{ flex: 1, height: 4, background:"var(--paper-3)", position:"relative", borderRadius: 2 }}>
        <div style={{ position:"absolute", left: 0, top: 0, bottom: 0, width:`${v}%`, background:"var(--ink-2)", borderRadius: 2 }}/>
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap: 2, width: 56, justifyContent:"flex-end" }}>
        <input
          type="number" min="0" max="100" step="1" value={v}
          onChange={e => onChange(Math.max(0, Math.min(100, +e.target.value || 0)))}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          className="num"
          style={{
            width: 36, fontSize: 14, fontWeight: 500, color:"var(--ink)", textAlign:"right",
            border: 0, padding: 0, outline: 0, background:"transparent",
            borderBottom: focus ? "1px solid var(--ink-2)" : "1px solid transparent",
            transition:"border-color 120ms",
          }}
        />
        <span style={{ fontSize: 13, color:"var(--ink-3)" }}>%</span>
      </div>
    </div>
  );
}

function PolicyNoteInput({ value, onChange, placeholder }) {
  const [focus, setFocus] = uS_RP(false);
  return (
    <input
      type="text" value={value || ""} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width:"100%", fontSize: 13, color:"var(--ink-2)",
        border: 0, padding:"2px 0", outline: 0, background:"transparent",
        borderBottom: focus ? "1px solid var(--ink-2)" : "1px solid transparent",
        transition:"border-color 120ms",
      }}
    />
  );
}

function PolicyTextInput({ value, onChange }) {
  const [focus, setFocus] = uS_RP(false);
  return (
    <input
      type="text" value={value || ""}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width:"100%", fontSize: 13.5, color:"var(--ink)", fontWeight: 500,
        border: 0, padding:"2px 0", outline: 0, background:"transparent",
        borderBottom: focus ? "1px solid var(--ink-2)" : "1px solid transparent",
        transition:"border-color 120ms",
      }}
    />
  );
}

// =========================================================================
// Impact stat tile — calm, informational.
// =========================================================================
function ImpactStat({ label, value, sub, divider }) {
  return (
    <div style={{ padding:"20px 22px", borderRight: divider ? "1px solid var(--rule)" : "none" }}>
      <div className="mono" style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing:"0.1em",
        color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 10,
      }}>{label}</div>
      <div className="num display" style={{
        fontSize: 28, fontWeight: 600, letterSpacing:"-0.01em", color:"var(--ink)", lineHeight: 1.1,
      }}>{value}</div>
      <div style={{ fontSize: 12, color:"var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

Object.assign(window, { RecoveryPolicyScreen });
