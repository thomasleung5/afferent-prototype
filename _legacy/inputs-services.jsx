// Inputs Page 3 — Service Definitions

const { departments: DEPTS_SV, services: SV_SEED, roleMix: MIX_SEED, staffing: STAFF_SV } = window.AFFERENT_INPUTS;

const SERVICE_TYPES = [
  { v:"permit",      label:"Permit" },
  { v:"application", label:"Application" },
  { v:"inspection",  label:"Inspection" },
  { v:"program",     label:"Program" },
  { v:"other",       label:"Other" },
];

// Fully-burdened rate per dept — from NBS study (data.jsx DEPTS.*.fbhr)
const DEPT_RATE = { PLAN: 301, BLDG: 362, ENG: 359 };

// Use s.cost when present (carried through from NBS study), otherwise hours × rate
const costFor = (s) => (s.cost != null ? s.cost : s.hours * (DEPT_RATE[s.dept] || 300));

function RoleMixModal({ service, mix, roles, onChange, onClose }) {
  if (!service) return null;
  const total = Object.values(mix || {}).reduce((a,b) => a+b, 0);
  const ok = Math.abs(total - 100) < 0.5;

  const addRole = () => {
    const remaining = roles.filter(r => !(r in (mix || {})));
    if (remaining.length === 0) return;
    onChange({ ...(mix || {}), [remaining[0]]: 0 });
  };

  return (
    <div style={{ position:"fixed", inset: 0, background:"rgba(20,20,30,0.35)", zIndex: 200, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width: 480, background:"var(--paper)", border:"1px solid var(--rule-strong)", boxShadow:"0 30px 80px rgba(0,0,0,0.18)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", borderBottom:"1px solid var(--rule)", background:"var(--paper-2)" }}>
          <div>
            <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase" }}>Staff role mix</div>
            <div className="display" style={{ fontSize: 16, fontWeight: 600, letterSpacing:"-0.01em", marginTop: 2 }}>{service.name}</div>
          </div>
          <button onClick={onClose} style={{ color:"var(--ink-3)" }}><Icon name="close" size={14}/></button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 12.5, color:"var(--ink-2)", marginBottom: 14, lineHeight: 1.5 }}>
            Assign the percentage of {service.hours} hours allocated to each role for this service. Must total 100%.
          </div>
          <div style={{ display:"flex", flexDirection:"column" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 80px 32px", gap: 0, padding:"8px 0", borderBottom:"1px solid var(--rule-strong)", fontFamily:"var(--ff-mono)", fontSize: 10, fontWeight: 600, letterSpacing:"0.08em", color:"var(--ink-3)", textTransform:"uppercase" }}>
              <div>Role</div>
              <div style={{ textAlign:"right" }}>%</div>
              <div style={{ textAlign:"right" }}>Hours</div>
              <div/>
            </div>
            {Object.entries(mix || {}).map(([role, pct]) => (
              <div key={role} style={{ display:"grid", gridTemplateColumns:"1fr 80px 80px 32px", padding:"8px 0", borderBottom:"1px solid var(--rule)", alignItems:"center" }}>
                <div style={{ fontSize: 13 }}>{role}</div>
                <div style={{ textAlign:"right" }}>
                  <input type="number" min={0} max={100} step={5} value={pct}
                    onChange={e => onChange({ ...(mix || {}), [role]: +e.target.value })}
                    style={{ width: 60, border:"1px solid var(--rule)", padding:"3px 6px", fontFamily:"var(--ff-mono)", fontSize: 13, textAlign:"right" }}/>
                </div>
                <div className="num" style={{ textAlign:"right", fontSize: 12, color:"var(--ink-3)" }}>{(service.hours * pct/100).toFixed(1)}</div>
                <button onClick={() => { const m = { ...(mix || {}) }; delete m[role]; onChange(m); }} style={{ color:"var(--ink-4)" }}><Icon name="close" size={11}/></button>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 16, paddingTop: 12, borderTop:"2px solid var(--ink)" }}>
            <button onClick={addRole} style={{ fontSize: 12, color:"var(--accent)", fontWeight: 500 }}>+ Add role</button>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: ok ? "var(--pos)" : "var(--neg)" }}>{total.toFixed(0)}% total</div>
          </div>
        </div>
        <div style={{ padding:"14px 20px", borderTop:"1px solid var(--rule)", background:"var(--paper-2)", display:"flex", justifyContent:"flex-end", gap: 8 }}>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={onClose} disabled={!ok}><Icon name="check" size={13}/> Save mix</Btn>
        </div>
      </div>
    </div>
  );
}

// ----- Services table (extracted to handle filter/sort state) -----------
function ServicesTable({ rows, mix, setMix, roleOptions, update, remove, add }) {
  const [deptFilter, setDeptFilter] = React.useState("ALL");
  const [reviewOnly, setReviewOnly] = React.useState(false);
  const [openId, setOpenId] = React.useState(null);
  const filtered = window.applyFilter(rows, "dept", deptFilter)
    .filter(r => !reviewOnly || r.flag);
  const flaggedCount = rows.filter(r => r.flag).length;

  return (
    <window.TableShell
      title="Service catalog"
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
      defaultSort={{ key: "name", dir: "asc" }}
      stickySort={(a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1)}
      onAdd={add}
      addLabel="Add service manually"
      cols={[
        { key: "name", label: "Service", width: "minmax(260px, 2fr)", sortable: true,
          render: r => <EditableCell value={r.name} onChange={v => update(r.id, { name: v })}/> },
        { key: "dept", label: "Dept", width: "90px", sortable: true,
          render: r => <EditableCell type="select" value={r.dept}
            onChange={v => update(r.id, { dept: v })}
            options={DEPTS_SV.map(d => ({ v: d.id, label: d.id }))}/> },
        { key: "type", label: "Type", width: "140px", sortable: true,
          render: r => <EditableCell type="select" value={r.type}
            onChange={v => update(r.id, { type: v })}
            options={SERVICE_TYPES.map(t => ({ v: t.v, label: t.label }))}/> },
        { key: "hours", label: "Hours / instance", align: "right", width: "130px", sortable: true,
          render: r => <EditableCell type="number" value={r.hours} step="0.5" align="right" suffix="h"
            onChange={v => update(r.id, { hours: v })}/> },
        { key: "mix", label: "Role mix", align: "right", width: "140px", sortable: true,
          sortKey: r => Object.keys(mix[r.id] || {}).length,
          render: r => {
            const mixCount = Object.keys(mix[r.id] || {}).length;
            const isOpen = openId === r.id;
            return (
              <button
                onClick={(e) => { e.stopPropagation(); setOpenId(isOpen ? null : r.id); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: mixCount ? "var(--ink)" : "var(--ink-3)",
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: 0,
                }}
              >
                {mixCount ? `${mixCount} roles` : "Assign"}
                <span style={{
                  display: "inline-block",
                  fontSize: 9, color: "var(--ink-3)",
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 120ms",
                }}>▶</span>
              </button>
            );
          }},
        { key: "actions", label: "", width: "40px",
          render: r => <RowActions onDelete={() => remove(r.id)}/> },
      ]}
      rows={filtered}
      openId={openId}
      renderDrilldown={r => (
        <RoleMixDrilldown
          service={r}
          mix={mix[r.id] || {}}
          roles={roleOptions}
          onChange={(m) => setMix(all => ({ ...all, [r.id]: m }))}
        />
      )}
    />
  );
}

// ----- Role-mix drilldown (inline expansion under a service row) ----------
function RoleMixDrilldown({ service, mix, roles, onChange }) {
  const total = Object.values(mix || {}).reduce((a,b) => a+b, 0);
  const ok = Math.abs(total - 100) < 0.5;
  const addRole = () => {
    const remaining = roles.filter(r => !(r in (mix || {})));
    if (remaining.length === 0) return;
    onChange({ ...(mix || {}), [remaining[0]]: 0 });
  };
  return (
    <div>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8,
      }}>
        Staff role mix · {service.hours}h / instance
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 90px 90px 28px", gap: 0,
        padding: "6px 0", borderBottom: "1px solid var(--rule-strong)",
        fontFamily: "var(--ff-mono)", fontSize: 10, fontWeight: 600,
        letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)",
      }}>
        <div>Role</div>
        <div style={{ textAlign: "right" }}>%</div>
        <div style={{ textAlign: "right" }}>Hours</div>
        <div/>
      </div>
      {Object.entries(mix || {}).map(([role, pct]) => (
        <div key={role} style={{
          display: "grid", gridTemplateColumns: "1fr 90px 90px 28px",
          padding: "6px 0", borderBottom: "1px solid var(--rule)", alignItems: "center",
        }}>
          <div style={{ fontSize: 12.5 }}>{role}</div>
          <div style={{ textAlign: "right" }}>
            <input type="number" min={0} max={100} step={5} value={pct}
              onChange={e => onChange({ ...(mix || {}), [role]: +e.target.value })}
              style={{
                width: 70, border: "1px solid var(--rule)", padding: "3px 6px",
                fontFamily: "var(--ff-mono)", fontSize: 12.5, textAlign: "right",
                background: "var(--paper)",
              }}/>
          </div>
          <div className="num" style={{ textAlign: "right", fontSize: 12, color: "var(--ink-3)" }}>
            {(service.hours * pct / 100).toFixed(1)}
          </div>
          <button onClick={() => { const m = { ...(mix || {}) }; delete m[role]; onChange(m); }}
            style={{ color: "var(--ink-4)", background: "transparent", border: "none", cursor: "pointer" }}>
            <Icon name="close" size={11}/>
          </button>
        </div>
      ))}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--rule-strong)",
      }}>
        <button onClick={addRole} style={{
          fontSize: 12, color: "var(--accent)", fontWeight: 500,
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
        }}>+ Add role</button>
        <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: ok ? "var(--pos)" : "var(--neg)" }}>
          {total.toFixed(0)}% total
        </div>
      </div>
    </div>
  );
}

function ServiceDefinitionsPage() {
  const ENG = window.AFFERENT_ENGINE;
  const model = ENG.useModel();
  // The engine's services array IS the source of truth — same ids as SV_SEED
  // (both derive from AFFERENT_DATA.SERVICES). Edits here propagate to all
  // downstream Build Model screens via the engine store.
  const rows = ENG.store.state.services;
  // Mix is local — engine doesn't model role-mix (just dept-level FBHR)
  const [mix, setMix] = uS(() => JSON.parse(JSON.stringify(MIX_SEED)));

  const update = (id, patch) => ENG.actions.updateService(id, patch);
  const remove = (id) => ENG.actions.removeService(id);
  const add = () => {
    const id = "sv" + (Date.now()%100000);
    // volume defaults to 0 — Workload (04) is where volume is captured
    ENG.actions.addService({ id, name:"New Service", dept:"PLAN", type:"permit", volume: 0, hours: 2, fee: 0, target: 100, cost: 0 });
  };

  const roleOptions = STAFF_SV.map(s => s.role).filter((v,i,a) => a.indexOf(v) === i);

  // Hours per instance (the time-study output) — volume is on 04 Workload, not here
  const totalHoursPerInstance = uM(() => rows.reduce((a,r) => a + (r.hours || 0), 0), [rows]);

  // Live computed cost from engine — echoes the calculation that 02 Build Model
  // will use, so users see how their hours edits change downstream cost.
  // Per-instance cost × volume (volume from 04 Workload) = annual cost of service.
  const computedTotalCost = uM(() => model.services.reduce((a, s) => a + (s.cost || 0) * (s.volume || 0), 0), [model.services]);
  const fbhrPLAN = model.fbhr.PLAN ? Math.round(model.fbhr.PLAN.fbhr) : 0;
  const fbhrBLDG = model.fbhr.BLDG ? Math.round(model.fbhr.BLDG.fbhr) : 0;
  const fbhrENG  = model.fbhr.ENG  ? Math.round(model.fbhr.ENG.fbhr)  : 0;

  // 01 Services defines the catalog (what services exist + workload).
  // Cost = hours × FBHR is computed downstream once Salary + CAP are built —
  // showing $ here would be misleading (and would lock in a stale rate).
  // Catalog columns: name, dept, type, hours/instance, role mix, actions.
  // Volume is captured on 04 Workload and shown there, not here.
  const cols = "minmax(260px, 2fr) 90px 140px 110px 160px 32px";

  // Per-dept counts for KPI strip
  const byDept = uM(() => {
    const out = { PLAN: 0, BLDG: 0, ENG: 0, FIRE: 0 };
    rows.forEach(r => { if (out[r.dept] != null) out[r.dept]++; });
    return out;
  }, [rows]);

  // Audit counts: imported / carry / manual / edited / flagged
  const counts = uM(() => {
    const c = { imported: 0, carry: 0, manual: 0, edited: 0, flagged: 0 };
    rows.forEach(r => {
      if (r.source === "manual") c.manual++;
      else if (r.source === "carry-forward") c.carry++;
      else c.imported++;
      if (r.flag) c.flagged++;
    });
    return c;
  }, [rows]);

  return (
    <div className="page">
      <PageHeader
        eyebrow={<NodeEyebrow node="services"/>}
        title="Services"
        subtitle="Hours per instance, role mix."
        actions={<>
          <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
        </>}
      />

      {/* Compact metadata strip — service catalog is structural, not metric-driven */}
      <StatusRow items={[
        `${rows.length} services`,
        `${byDept.PLAN} Planning · ${byDept.BLDG} Building · ${byDept.ENG} Engineering`,
        `${Math.round(totalHoursPerInstance).toLocaleString()} hrs / instance`,
        { value: counts.flagged === 0 ? "All scoped" : `${counts.flagged} need role-mix review`, tone: counts.flagged === 0 ? "pos" : "warn" },
        "FY 2026-27",
      ]}/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, fee schedule pdf"
        hint="Drag a fee schedule, service inventory, or time-study export. Common formats: prior fee study workbook, permit-system service list, or a marked-up PDF."
        lastImport={{ file:"FY 24-25 Fee Study · Appendix A.xlsx", rows: 32, mapped: 30, review: 2, date:"Apr 14, 2026" }}
      />

      <ServicesTable
        rows={rows}
        mix={mix}
        setMix={setMix}
        roleOptions={roleOptions}
        update={update}
        remove={remove}
        add={add}
      />
    </div>
  );
}

window.ServiceDefinitionsPage = ServiceDefinitionsPage;
