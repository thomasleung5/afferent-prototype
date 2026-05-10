// App shell — top bar, view routing, Tweaks (v2)

const { useState: uSA, useEffect: uEA } = React;
const { CITY: CITY_A } = window.AFFERENT_DATA;
const { CITY_EXT: CE_A } = window.AFFERENT_EXT;

function readTweakDefaults() {
  try {
    const el = document.getElementById("tweak-defaults");
    const raw = el.textContent.match(/\{[\s\S]*\}/)[0];
    return JSON.parse(raw);
  } catch (e) { return {}; }
}

const NAV = [
  { k:"home",   label:"Home" },
  { k:"gap",    label:"Revenue Gap" },
  { k:"build",  label:"Build Model" },
  { k:"annual", label:"Annual Update" },
];

function TopBar({ view, onNav }) {
  const groupOf = (v) => {
    if (v === "home") return "home";
    if (v === "gap") return "gap";
    if (v.startsWith("build")) return "build";
    if (v.startsWith("annual")) return "annual";
    return v;
  };
  const grp = groupOf(view);
  return (
    <div style={{ borderBottom:"1px solid var(--rule)", background:"var(--paper)", position:"sticky", top: 0, zIndex: 10 }}>
      <div style={{ display:"flex", alignItems:"center", gap: 20, padding:"10px 28px", height: 52 }}>
        <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="1" width="20" height="20" stroke="var(--ink)" strokeWidth="1.5"/>
            <path d="M6 15 L11 5 L16 15" stroke="var(--ink)" strokeWidth="1.5" fill="none"/>
            <path d="M8 11 L14 11" stroke="var(--ink)" strokeWidth="1.5"/>
          </svg>
          <div className="display" style={{ fontWeight: 600, fontSize: 15, letterSpacing:"-0.01em" }}>Afferent</div>
        </div>
        <div style={{ width: 1, height: 18, background:"var(--rule)" }}/>
        <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{CITY_A.name}</div>
          <button className="mono" style={{ padding:"3px 7px", border:"1px solid var(--rule)", background:"var(--paper-2)", fontSize: 10.5, color:"var(--ink-3)" }}>{CE_A.fiscalCurrent}</button>
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
        </div>
        <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
        <div className="mono" style={{ width: 28, height: 28, border:"1px solid var(--rule-strong)", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 10.5, fontWeight: 600, background:"var(--paper-2)" }}>MR</div>
      </div>
      <div style={{ borderTop:"1px solid var(--rule)", background:"var(--paper-2)", padding:"0 28px", display:"flex", gap: 0, height: 38, alignItems:"stretch" }}>
        {NAV.map(n => {
          const on = grp === n.k;
          return (
            <button key={n.k} onClick={() => onNav(n.k)} style={{
              padding:"0 14px", fontSize: 12.5, fontWeight: 500,
              color: on ? "var(--ink)" : "var(--ink-3)",
              borderBottom: on ? "2px solid var(--ink)" : "2px solid transparent",
              marginBottom: -1, whiteSpace: "nowrap",
            }}>{n.label}</button>
          );
        })}
      </div>
    </div>
  );
}

// Build Model sub-router. Streamlined: Services → Salary → CAP → Workload → Cost → Fee Schedule.
// Policy & Lock folded into Fee Schedule. Reconcile rolled into Fee Schedule's import panel.
function BuildRouter({ sub, onNavSub }) {
  switch (sub) {
    case "build-services": return <ServiceDefinitionsPage/>;
    case "build-salary":   return <SalaryModelScreen/>;
    case "build-operating": return <OperatingCostsScreen/>;
    case "build-cap":      return <CapBuilderScreen/>;
    case "build-workload": return <WorkloadModelScreen/>;
    case "build-policy":   return <RecoveryPolicyScreen/>;
    case "build-costs":    return <CostOfServiceScreen/>;
    case "build-feestudy": return <FeeScheduleScreenV4/>;
    default:               return <BuildModelOverview onNavSub={onNavSub}/>;
  }
}

// Annual Update sub-router — fast import + targeted section reviews.
function AnnualRouter({ sub, onNavSub }) {
  if (sub && sub.startsWith("annual-section-")) {
    const sectionKey = sub.replace("annual-section-", "");
    return <SectionReviewShell sectionKey={sectionKey} onNavSub={onNavSub}/>;
  }
  switch (sub) {
    case "annual-refresh": return <AnnualRefreshScreen onNavSub={onNavSub}/>;
    case "annual-changes": return <ChangeReviewScreen onNavSub={onNavSub}/>;
    case "annual-packet":  return <AnnualPacketScreen onNavSub={onNavSub}/>;
    default:               return <AnnualUpdateHome onNavSub={onNavSub}/>;
  }
}

// Sub nav rail
function SubNav({ items, current, onPick }) {
  // Determine "active" key with optional group matching (e.g. annual-section-* → annual-section-services).
  const isActive = (it) => {
    if (it.group === "sections" && current && current.startsWith("annual-section-")) return true;
    return current === it.k;
  };
  return (
    <div style={{ borderBottom:"1px solid var(--rule)", background:"var(--paper)", padding:"0 28px", display:"flex", gap: 0, alignItems:"stretch", overflowX:"auto" }}>
      {items.map((it, i) => {
        const on = isActive(it);
        return (
          <button key={it.k} onClick={() => onPick(it.k)} style={{
            padding:"10px 14px", fontSize: 12, fontWeight: 500, whiteSpace:"nowrap",
            color: on ? "var(--ink)" : "var(--ink-3)",
            background: on ? "var(--paper-2)" : "transparent",
            borderRight: i < items.length - 1 ? "1px solid var(--rule)" : "none",
            borderBottom: on ? "2px solid var(--accent)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

const BUILD_SUBNAV = [
  { k:"build",          label:"Overview" },
  { k:"build-services", label:"Services" },
  { k:"build-salary",   label:"Direct Labor" },
  { k:"build-operating", label:"Operating" },
  { k:"build-cap",      label:"Cost Allocation" },
  { k:"build-workload", label:"Workload" },
  { k:"build-costs",    label:"Cost of service" },
  { k:"build-policy",   label:"Recovery policy" },
  { k:"build-feestudy", label:"Fee schedule" },
];

const ANNUAL_SUBNAV = [
  { k:"annual",                  label:"Overview" },
  { k:"annual-refresh",          label:"Refresh inputs" },
  { k:"annual-section-services", label:"Review queue", group:"sections" },
  { k:"annual-changes",          label:"Review changes" },
  { k:"annual-packet",           label:"Update packet" },
];

// Tweaks panel
function TweaksPanel({ tweaks, setTweaks, open, setOpen }) {
  if (!open) return null;
  const update = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    try { window.parent.postMessage({ type:"__edit_mode_set_keys", edits: { [k]: v } }, "*"); } catch(e) {}
  };
  return (
    <div style={{ position:"fixed", right: 16, bottom: 16, width: 280, background:"var(--paper)", border:"1px solid var(--rule-strong)", boxShadow:"0 20px 60px rgba(0,0,0,0.10)", zIndex: 100 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderBottom:"1px solid var(--rule)", background:"var(--paper-2)" }}>
        <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--ink-2)" }}>Tweaks</div>
        <button onClick={() => setOpen(false)} style={{ color:"var(--ink-3)" }}><Icon name="close" size={14}/></button>
      </div>
      <div style={{ padding: 14, display:"flex", flexDirection:"column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Accent hue</div>
          <input type="range" min={0} max={360} value={tweaks.accentHue} onChange={e => update("accentHue", +e.target.value)} style={{ width:"100%" }}/>
          <div className="mono" style={{ fontSize: 11, color:"var(--ink-3)" }}>{tweaks.accentHue}°</div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Default recovery target</div>
          <div style={{ display:"flex", gap: 4 }}>
            {[50, 80, 100].map(v => {
              const on = tweaks.defaultRecoveryTarget === v;
              return <button key={v} onClick={() => update("defaultRecoveryTarget", v)} style={{
                flex: 1, padding:"6px 8px", fontSize: 11.5,
                border: on ? "1px solid var(--accent)" : "1px solid var(--rule)",
                background: on ? "var(--accent-tint)" : "var(--paper)",
              }}>{v}%</button>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [view, setView] = uSA(() => localStorage.getItem("afferent:view2") || "home");
  const [tweaks, setTweaks] = uSA(readTweakDefaults);
  const [tweaksOpen, setTweaksOpen] = uSA(false);

  uEA(() => { localStorage.setItem("afferent:view2", view); }, [view]);

  uEA(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", `oklch(38% 0.12 ${tweaks.accentHue})`);
    root.style.setProperty("--accent-2", `oklch(50% 0.14 ${tweaks.accentHue})`);
    root.style.setProperty("--accent-tint", `oklch(94% 0.03 ${tweaks.accentHue})`);
  }, [tweaks.accentHue]);

  uEA(() => {
    const handler = (e) => {
      if (!e.data) return;
      if (e.data.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", handler);
    try { window.parent.postMessage({ type:"__edit_mode_available" }, "*"); } catch(e) {}
    return () => window.removeEventListener("message", handler);
  }, []);

  const onNav = (k) => { setView(k); window.scrollTo({ top: 0, behavior:"instant" }); };

  // Expose nav globally so screens can deep-link (e.g. RevenueGap → build steps)
  window.AFFERENT_NAV = (slug) => {
    if (slug && slug.includes(":")) {
      const [section, step] = slug.split(":");
      onNav(`${section}-${step}`);
    } else {
      onNav(slug);
    }
  };

  // Compute screen label for comments / verifier context
  const labels = {
    home:"01 Home", gap:"02 Revenue Gap", build:"03 Build Model", annual:"04 Annual Update",
  };
  const screenLabel = labels[view] || (view.startsWith("build-") ? "03 Build " + view : view.startsWith("annual-") ? "04 Annual " + view : view);

  const isBuild = view === "build" || view.startsWith("build-");
  const isAnnual = view === "annual" || view.startsWith("annual-");

  return (
    <div data-screen-label={screenLabel}>
      <TopBar view={view} onNav={onNav}/>
      {isBuild  && <SubNav items={BUILD_SUBNAV}  current={view} onPick={onNav}/>}
      {isAnnual && <SubNav items={ANNUAL_SUBNAV} current={view} onPick={onNav}/>}

      <div>
        {view === "home"  && <HomeScreen onNav={onNav}/>}
        {view === "gap"   && <RevenueGapScreen/>}
        {isBuild           && <BuildRouter sub={view} onNavSub={onNav}/>}
        {isAnnual          && <AnnualRouter sub={view} onNavSub={onNav}/>}
      </div>

      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} open={tweaksOpen} setOpen={setTweaksOpen}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
