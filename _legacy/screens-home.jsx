// Home — the executive answer screen.
// Question: "Are we recovering the cost of services we deliver, and what should we change?"
// Answer: A single dominant gap number, the drivers, the dept breakdown, the top fixes,
// and a flag strip — same pattern as every decision screen.

const { CITY: HCITY, CITYWIDE: HCITYWIDE, SERVICES: HSERVICES, DEPT_ROLLUPS: HDR } = window.AFFERENT_DATA;
const { SOURCES: HSOURCES, BUILD_STEPS: HBS, CAP_TOTAL: HCAP, CITY_EXT: HCE } = window.AFFERENT_EXT;

function HomeScreen({ onNav }) {
  const model = window.AFFERENT_ENGINE.useModel();
  const capModel = window.AFFERENT_CAP ? window.AFFERENT_CAP.computeModel() : null;
  const totals = model.totals;
  const gap = (totals.totalCost || 0) - (totals.currentRev || 0);
  const recovery = totals.totalCost > 0 ? (totals.currentRev / totals.totalCost) * 100 : 0;

  // Wire screen-level navigation for flag click-through
  React.useEffect(() => {
    window.AFFERENT_NAV = onNav;
    return () => { if (window.AFFERENT_NAV === onNav) window.AFFERENT_NAV = null; };
  }, [onNav]);

  return (
    <div style={{ padding: "32px 32px 48px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1380, margin: "0 auto" }}>

      {/* OFFICIAL DOCUMENT HEADER — institutional title block */}
      <div style={{ borderBottom: "1px solid var(--rule)", paddingBottom: 18, marginBottom: -4 }}>
        <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          Town of Los Altos Hills
        </div>
        <div className="display" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.018em", lineHeight: 1.15, marginTop: 4 }}>
          Revenue Intelligence System
        </div>
      </div>

      {/* HEADLINE — the one-line answer + pointer to Revenue Gap tab for the full breakdown */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: "28px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>
            Citywide cost recovery
          </div>
          <div className="display" style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            <span className="num" style={{ color: "var(--neg)" }}>{fmt.dollarsK(gap)}/yr</span>{" "}
            <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>under-recovery at {recovery.toFixed(0)}%</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            See the full breakdown — cost drivers, recovery shortfalls, and source lineage — on the Revenue Gap tab.
          </div>
        </div>
        <Btn kind="primary" onClick={() => onNav("gap")}>Open Revenue Gap <Icon name="arrow-right" size={13}/></Btn>
      </div>

      {/* WORKFLOW BRANCH — first-time vs annual update */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <EntryCard
          eyebrow="First-time setup"
          title="Build cost-of-service model"
          desc="Define services, build the salary table, allocate costs, and lock the cost of service."
          progress={74}
          progressLabel="Baseline model — staff validation in progress"
          cta="Configure model"
          accent={false}
          onClick={() => onNav("build")}
          checklist={[
            { l: "Services", v: "32 mapped" },
            { l: "Labor", v: "73 positions" },
            { l: "Overhead", v: "14 pools" },
            { l: "Fees", v: "Recovery targets" },
          ]}
        />
        <EntryCard
          eyebrow="Recurring workflow"
          title="Annual update"
          desc="Refresh the inputs that change each year. Reuse everything else. Generate the Council packet."
          progress={91}
          progressLabel="Structure reused: 91%"
          cta="Run Annual Update"
          accent={true}
          onClick={() => onNav("annual")}
          stats={[
            { l: "Changes to review", v: "12" },
            { l: "Recovery drift", v: "+$420K" },
            { l: "Est. review time", v: "2.5 hrs" },
          ]}
        />
      </div>

      {/* ACTIVITY — small, factual */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 20 }}>
          <SectionLabel>Audit trail</SectionLabel>
          {[
            { date: "Apr 28, 2026", text: "Workload export ingested · 1,246 records · 17 missing volumes flagged", src: "Workload" },
            { date: "Apr 26, 2026", text: "Salary refresh imported from Finance · 73 positions · 6 review", src: "Salary" },
            { date: "Apr 18, 2026", text: "FY 2025-26 baseline model locked · v1.0", src: "Build" },
            { date: "Mar 30, 2026", text: "Development Services Fee Study — final draft uploaded", src: "Fee Study" },
            { date: "Sep 04, 2025", text: "Cost Allocation Plan ingested · 14 cost pools · ~$3.7M", src: "CAP" },
          ].map((a, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr 90px", gap: 10, padding: "10px 0", borderBottom: i < 4 ? "1px dashed var(--rule)" : "none", alignItems: "baseline" }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.date}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{a.text}</div>
              <div style={{ textAlign: "right" }}><SourceBadge>{a.src}</SourceBadge></div>
            </div>
          ))}
        </div>
        <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 20 }}>
          <SectionLabel>Model inputs</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            <KpiTile label="Cost allocation pool" value={fmt.dollarsK(capModel?.totals?.totalCAP || 0)} sub={`${(capModel?.allocRows || []).length} allocations · ${(capModel?.warnings || []).length} warnings`} tone={capModel?.warnings?.length ? "warn" : "info"}/>
            <KpiTile label="Services modeled" value={(model.services || []).length} sub="across PLAN · BLDG · ENG"/>
            <KpiTile label="Positions" value={(window.AFFERENT_ENGINE.store.state.positions || []).length} sub="mapped to roles"/>
            <KpiTile label="Operating lines" value={(window.AFFERENT_ENGINE.store.state.operating || []).length} sub="dept-direct non-labor"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function EntryCard({ eyebrow, title, desc, progress, progressLabel, cta, onClick, accent, steps, stats, checklist }) {
  // Use shared brand tokens — see --navy / --charcoal in Afferent.html.
  const navy = "var(--navy)";
  const navyLine = "var(--navy-line)";
  const navySub = "var(--navy-sub)";
  const navyDim = "var(--navy-dim)";
  const charcoal = "var(--charcoal)";
  return (
    <button onClick={onClick} style={{
      textAlign: "left",
      background: accent ? navy : "var(--paper)",
      color: accent ? "white" : "var(--ink)",
      border: accent ? `1px solid ${navy}` : "1px solid var(--rule)",
      padding: "26px 26px 22px",
      cursor: "pointer", display: "flex", flexDirection: "column", gap: 12, minHeight: 240,
    }}>
      <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: accent ? navyDim : "var(--ink-3)" }}>
        {eyebrow}
      </div>
      <div className="display" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
        {title}
      </div>
      <div style={{ fontSize: 13.5, color: accent ? navySub : "var(--ink-2)", lineHeight: 1.55, textWrap: "pretty", maxWidth: 480 }}>
        {desc}
      </div>

      {checklist && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 4, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
          {checklist.map((c, i) => (
            <div key={i}>
              <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>{c.l}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontSize: 12, color: "var(--ink-2)" }}>
                <span style={{ color: "var(--pos)", fontSize: 11 }}>✓</span>
                <span className="num">{c.v}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 4, paddingTop: 14, borderTop: `1px solid ${accent ? navyLine : "var(--rule)"}` }}>
          {stats.map((s, i) => (
            <div key={i}>
              <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: accent ? navyDim : "var(--ink-3)" }}>{s.l}</div>
              <div className="num display" style={{ fontSize: 22, fontWeight: 600, marginTop: 4, letterSpacing: "-0.015em" }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        {progress != null && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: accent ? navySub : "var(--ink-3)", marginBottom: 6 }}>
              <span>{progressLabel}</span>
              <span className="num">{progress}%</span>
            </div>
            <div style={{ height: 4, background: accent ? navyLine : "var(--paper-3)" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: accent ? "white" : "var(--accent)" }}/>
            </div>
          </div>
        )}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "9px 16px",
          background: accent ? "white" : charcoal,
          color: accent ? navy : "white",
          border: accent ? "none" : `1px solid ${charcoal}`,
          fontSize: 13, fontWeight: 500,
        }}>
          {cta} <Icon name="arrow-right" size={13}/>
        </div>
      </div>
    </button>
  );
}

// ----- Build Model overview — unified Section Flow (uses SectionCard) -----
function BuildModelOverview({ onNavSub }) {
  const ENG = window.AFFERENT_ENGINE;
  const model = ENG ? ENG.useModel() : null;
  const totalCost = model ? Object.values(model.fbhr).reduce((a, f) => a + (f?.direct || 0) + (f?.operating || 0) + (f?.indirect || 0), 0) : 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Build model"
        title="Model architecture"
        subtitle="Inputs → Analysis → Policy → Output. Deterministic recomputation."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Methodology</Btn>}
      />

      {/* Hierarchy legend removed */}

      <div style={{ marginTop: 4 }}>
        <SectionFlow
          mode="build"
          getState={buildStateFor}
          currentKey={null}
          onPick={(k) => onNavSub(BUILD_SLUG[k])}
        />
      </div>
    </div>
  );
}

// Legacy NodeCard — kept for compatibility but no longer used on Overview.
function NodeCard_DEPRECATED({ node, onNav, accent, wide }) {
  const tone =
    accent === "ink" ? { bd: "var(--ink)", bg: "var(--ink)", fg: "var(--paper)", sub: "rgba(255,255,255,0.7)", role: "Computed node" } :
    accent === "policy" ? { bd: "var(--accent)", bg: "var(--accent-tint)", fg: "var(--ink)", sub: "var(--ink-3)", role: "Policy node" } :
                          { bd: "var(--rule-strong)", bg: "var(--paper)", fg: "var(--ink)", sub: "var(--ink-3)", role: "Input node" };
  return (
    <button
      onClick={onNav}
      style={{
        display: "flex", flexDirection: "column", textAlign: "left",
        padding: wide ? "20px 22px" : "16px 14px",
        background: tone.bg, border: `1px solid ${tone.bd}`,
        cursor: "pointer", gap: 10, minHeight: wide ? 0 : 180,
      }}
    >
      <div className="mono" style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
        color: tone.sub, textTransform: "uppercase",
      }}>{tone.role}</div>
      <div className="display" style={{
        fontSize: wide ? 22 : 17, fontWeight: 600, letterSpacing: "-0.015em",
        color: tone.fg, lineHeight: 1.15,
      }}>{node.label}</div>
      <div style={{ fontSize: 12.5, color: tone.fg, opacity: 0.85, lineHeight: 1.5, flex: 1 }}>
        {node.desc}
      </div>
      <div style={{
        marginTop: 4, paddingTop: 10, borderTop: `1px dashed ${accent === "ink" ? "rgba(255,255,255,0.2)" : "var(--rule)"}`,
        fontSize: 10.5, color: tone.sub, lineHeight: 1.5,
      }}>
        <div><b style={{ fontWeight: 600 }}>Reads:</b> {node.reads}</div>
        <div style={{ marginTop: 2 }}><b style={{ fontWeight: 600 }}>Writes:</b> {node.writes}</div>
      </div>
    </button>
  );
}

// ----- Data Sources screen -----
function DataSourcesScreen() {
  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1320, margin: "0 auto" }}>
      <PageHeader
        eyebrow="Source documents"
        title="Data sources"
        subtitle="Source manifest · confidence · mapping coverage."
        actions={<><Btn kind="ghost"><Icon name="download" size={13}/> Source manifest</Btn><Btn kind="primary"><Icon name="plus" size={13}/> Upload source</Btn></>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {HSOURCES.map(s => (
          <div key={s.id} style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <SourceBadge kind={s.id === "cap" ? "cap" : s.id === "fee" ? "fee" : s.id === "budget" ? "budget" : "default"}>{s.short}</SourceBadge>
                  <StatusPill kind={s.status === "Uploaded" ? "ok" : "info"}>{s.status}</StatusPill>
                </div>
                <div className="display" style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{s.name}</div>
              </div>
              <Confidence level={s.confidence}/>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, textWrap: "pretty" }}>{s.purpose}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, paddingTop: 10, borderTop: "1px solid var(--rule)" }}>
              <div><div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>Date</div><div className="num" style={{ fontSize: 13, marginTop: 3 }}>{s.date}</div></div>
              <div><div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>Mapped fields</div><div className="num" style={{ fontSize: 13, marginTop: 3 }}>{s.mappedFields}</div></div>
              <div><div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>Issues</div><div className="num" style={{ fontSize: 13, marginTop: 3, color: s.issues > 5 ? "var(--neg)" : s.issues > 0 ? "var(--warn)" : "var(--pos)" }}>{s.issues}</div></div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Btn kind="ghost" style={{ height: 26, fontSize: 11.5 }}>View extraction</Btn>
              <Btn kind="ghost" style={{ height: 26, fontSize: 11.5 }}>Re-import</Btn>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", padding: "16px 20px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6, textWrap: "pretty" }}>
        <b>How Afferent uses sources.</b> Uploaded reports (CAP, Fee Study) are parsed for cost pools, allocation bases, fully-burdened rates, and recovery targets. Referenced files (budget, salary, workload, fee schedule) are the live inputs that change each year. AI-assisted extraction is flagged for review — final calculations remain deterministic, formula-based, and reproducible.
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen, BuildModelOverview, DataSourcesScreen });
