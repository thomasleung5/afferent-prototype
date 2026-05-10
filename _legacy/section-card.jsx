// SectionCard — the single unified component for the model's 7 sections.
// Used in:
//   - Build Model > Overview (mode="build")  — shows completion status
//   - Annual Update > Section Reviews (mode="annual") — shows review state
//
// Same structure, same ordering, same layout — only state changes.
//
// Section order (canonical):
//   Services → Salary → Operating → CAP → Workload → Cost of Service → Fee Schedule

const MODEL_SECTIONS = [
  { k:"services",  label:"Services",        type:"Input",    tier:"medium", formula:"hours × role mix",                       meta:"37 services" },
  { k:"salary",    label:"Direct Labor",    type:"Input",    tier:"medium", formula:"(salary + benefits) ÷ productive hours", meta:"73 positions" },
  { k:"operating", label:"Operating",       type:"Input",    tier:"medium", formula:"non-labor · per dept",                   meta:"214 expense lines" },
  { k:"cap",       label:"Cost Allocation", type:"Input",    tier:"medium", formula:"indirect → direct",                      meta:"14 indirect pools" },
  { k:"workload",  label:"Workload",        type:"Input",    tier:"medium", formula:"annual volume",                          meta:"1,246 activity records" },
  { k:"costs",     label:"Cost of Service", type:"Analysis", tier:"high",   formula:"hours × FBHR × volume",                  meta:"Deterministic recomputation" },
  { k:"policy",    label:"Recovery Policy", type:"Policy",   tier:"high",   formula:"target % per service",                   meta:"72% target recovery" },
  { k:"fees",      label:"Fee Schedule",    type:"Output",   tier:"high",   formula:"cost × target",                          meta:"+$420K annual impact" },
];

const BUILD_SLUG = { services:"build-services", salary:"build-salary", operating:"build-operating", cap:"build-cap", workload:"build-workload", costs:"build-costs", policy:"build-policy", fees:"build-feestudy" };
const ANNUAL_SLUG = { services:"annual-section-services", salary:"annual-section-salary", operating:"annual-section-operating", cap:"annual-section-cap", workload:"annual-section-workload", costs:"annual-section-costs", policy:"annual-section-policy", fees:"annual-section-fees" };

// =========================================================================
// SectionCard — fully clickable, hover-able, with consistent impact slot.
// =========================================================================
function SectionCard({ section, state, mode, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  const isComputed = section.type === "Analysis";
  const isPolicy   = section.type === "Policy";
  const isOutput   = section.type === "Output";
  const tier       = section.tier || "medium";  // "high" | "medium" | "low"
  const isHigh     = tier === "high";
  const isLow      = tier === "low";

  const tone = active
    ? { bd:"var(--ink)", bg:"var(--ink)", fg:"var(--paper)", sub:"rgba(255,255,255,0.7)", footerBd:"rgba(255,255,255,0.2)", impactBg:"rgba(255,255,255,0.08)" }
    : isOutput
    ? { bd:"var(--ink-2, #2a2a2a)", bg:"var(--ink-2, #2a2a2a)", fg:"var(--paper)", sub:"rgba(255,255,255,0.65)", footerBd:"rgba(255,255,255,0.18)", impactBg:"rgba(255,255,255,0.08)" }
    : isPolicy
    ? { bd:"var(--accent)", bg:"var(--accent-tint)", fg:"var(--ink)", sub:"var(--ink-3)", footerBd:"var(--rule)", impactBg:"var(--paper)" }
    : isComputed
    ? { bd:"var(--ink-2)", bg:"var(--ink)", fg:"var(--paper)", sub:"rgba(255,255,255,0.7)", footerBd:"rgba(255,255,255,0.2)", impactBg:"rgba(255,255,255,0.08)" }
    : isLow
    ? { bd:"var(--rule)", bg:"transparent", fg:"var(--ink-2)", sub:"var(--ink-4)", footerBd:"var(--rule)", impactBg:"transparent" }
    : { bd:"var(--rule-strong)", bg:"var(--paper)", fg:"var(--ink)", sub:"var(--ink-3)", footerBd:"var(--rule)", impactBg:"var(--paper-2)" };

  // Hover: lift via stronger border + subtle shadow. No movement (clickable feels stable).
  const hoverBd = hover && !active ? "var(--ink)" : tone.bd;
  const hoverShadow = hover ? (isHigh ? "0 6px 20px -6px rgba(0,0,0,0.16), 0 1px 0 0 rgba(0,0,0,0.04)" : "0 4px 12px -4px rgba(0,0,0,0.12), 0 1px 0 0 rgba(0,0,0,0.04)") : (isHigh && !active ? "0 1px 0 0 rgba(0,0,0,0.04)" : "none");

  // Impact tone — consistent slot below the description.
  const impactTone = state.impactTone || "neutral";
  const impactColor =
    impactTone === "neg"  ? (active ? "oklch(80% 0.15 28)" : "var(--neg)") :
    impactTone === "pos"  ? (active ? "oklch(80% 0.12 155)" : "var(--pos)") :
    impactTone === "warn" ? (active ? "oklch(82% 0.14 78)" : "var(--warn)") :
                            tone.fg;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:"flex", flexDirection:"column", textAlign:"left",
        padding: isHigh ? "16px 16px" : isLow ? "12px 12px" : "14px 14px",
        gap: 8,
        background: tone.bg, border: `1px solid ${hoverBd}`,
        boxShadow: hoverShadow,
        cursor:"pointer",
        minHeight: isHigh ? 184 : isLow ? 148 : 168,
        transition: "border-color 120ms, box-shadow 120ms",
      }}
    >
      {/* Status strip — top right */}
      {state.indicator && (
        <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", minHeight: 18 }}>
          {state.indicator}
        </div>
      )}

      {/* Title */}
      <div className="display" style={{
        fontSize: isHigh ? 20 : isLow ? 15 : 17,
        fontWeight: 600, letterSpacing:"-0.015em",
        color: tone.fg, lineHeight: 1.15, marginTop: 2,
      }}>{section.label}</div>

      {/* Body — formula in mono (Build mode) or auto-mapped state (Annual mode) */}
      <div style={{
        fontSize: state.body ? 11.5 : 10.5,
        fontFamily: state.body ? "inherit" : "var(--ff-mono)",
        letterSpacing: state.body ? "normal" : "0.02em",
        color: tone.fg, opacity: state.body ? 0.78 : 0.62,
        lineHeight: 1.45,
      }}>
        {state.body || section.formula}
      </div>

      {/* Meta — single low-emphasis operational anchor, bottom-aligned */}
      {section.meta && (
        <div className="mono" style={{
          marginTop:"auto",
          paddingTop: 8,
          fontSize: 10, fontWeight: 500, letterSpacing:"0.04em",
          color: tone.fg, opacity: 0.42,
          lineHeight: 1.3,
        }}>
          {section.meta}
        </div>
      )}

    </button>
  );
}

// =========================================================================
// SectionFlow — renders the 7 sections with arrows showing the data flow.
// Layout: 5 inputs (row 1) → 1 computed (row 2 left) → 1 policy (row 2 right)
// =========================================================================
function SectionFlow({ getState, mode, currentKey, onPick }) {
  const inputs = MODEL_SECTIONS.filter(s => s.type === "Input");
  const computed = MODEL_SECTIONS.find(s => s.type === "Analysis");
  const policy = MODEL_SECTIONS.find(s => s.type === "Policy");
  const output = MODEL_SECTIONS.find(s => s.type === "Output");

  const cardFor = (s) => (
    <SectionCard
      key={s.k}
      section={s}
      state={getState(s.k)}
      mode={mode}
      active={currentKey === s.k}
      onClick={() => onPick(s.k)}
    />
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 18 }}>
      {/* Inputs band */}
      <BandLabel label="Inputs" count={`${inputs.length}`} />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap: 10 }}>
        {inputs.map(cardFor)}
      </div>

      {/* Derivation band — Analysis · Policy · Output, side-by-side with band labels */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"1fr 36px 1fr 36px 1fr",
        gap: 0, columnGap: 0, rowGap: 8,
        alignItems:"stretch",
      }}>
        <BandLabel label="Analysis" />
        <div/>
        <BandLabel label="Policy" />
        <div/>
        <BandLabel label="Output" />

        {cardFor(computed)}
        <FlowGlyph />
        {cardFor(policy)}
        <FlowGlyph />
        {cardFor(output)}
      </div>
    </div>
  );
}

function BandLabel({ label, count }) {
  return (
    <div style={{
      display:"flex", alignItems:"baseline", gap: 8,
      paddingBottom: 4,
      borderBottom: "1px solid var(--rule)",
      whiteSpace: "nowrap",
    }}>
      <span className="mono" style={{
        fontSize: 10, fontWeight: 700, letterSpacing:"0.14em",
        color:"var(--ink-2)", textTransform:"uppercase",
      }}>{label}</span>
      {count && (
        <span className="mono" style={{
          fontSize: 9.5, fontWeight: 500, letterSpacing:"0.08em",
          color:"var(--ink-4)",
        }}>· {count}</span>
      )}
    </div>
  );
}

function FlowGlyph() {
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"center",
      color:"var(--ink-4)",
    }}>
      <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
        <path d="M0 5h18M14 1l4 4-4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function FlowConnector({ label }) {
  if (!label) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"6px 0" }}>
        <div style={{ flex: 1, height: 1, background:"var(--rule)" }}/>
      </div>
    );
  }
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap: 10, padding:"4px 0" }}>
      <div style={{ flex: 1, height: 1, background:"var(--rule)" }}/>
      <span className="mono" style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing:"0.08em",
        color:"var(--ink-3)", padding:"2px 10px", border:"1px solid var(--rule)", background:"var(--paper)",
      }}>↓ {label}</span>
      <div style={{ flex: 1, height: 1, background:"var(--rule)" }}/>
    </div>
  );
}

function FlowArrow({ label }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap: 4, color:"var(--ink-3)" }}>
      <svg width="40" height="14" viewBox="0 0 40 14" fill="none">
        <path d="M2 7h34M30 2l6 5-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="mono" style={{ fontSize: 9, fontWeight: 600, letterSpacing:"0.08em" }}>{label}</span>
    </div>
  );
}

// =========================================================================
// State adapters — same component, different data per mode.
// =========================================================================

function buildStateFor(k) {
  const { BUILD_STEPS } = window.AFFERENT_EXT;
  const stepK = k === "fees" ? "feestudy" : k;
  const step = BUILD_STEPS.find(s => s.k === stepK);
  const done = step?.done ?? false;
  return {
    indicator: done
      ? <StatusPill kind="ok">Locked</StatusPill>
      : <StatusPill kind="review">Open</StatusPill>,
    impact: "",
    impactTone: "neutral",
    footerLeft:  done ? "v1.0" : "Configure",
    footerRight: done ? "✓" : "Open →",
    footerRightTone: done ? "pos" : "neutral",
  };
}

function annualStateFor(k) {
  const data = window.SECTION_DATA?.[k];
  if (!data) {
    return { indicator: null, impact:"—", impactTone:"neutral", footerLeft:"—", footerRight:"—", footerRightTone:"neutral" };
  }
  const sm = data.summary;
  const clear = sm.needsReview === 0;
  return {
    indicator: clear
      ? <StatusPill kind="ok">Clear</StatusPill>
      : <StatusPill kind="review">Needs review</StatusPill>,
    impact: sm.impact,
    impactTone: sm.impactTone || "neutral",
    footerLeft:  `${sm.autoPct}% auto`,
    footerRight: clear ? "✓ Clear" : `${sm.needsReview} open`,
    footerRightTone: clear ? "pos" : "warn",
  };
}

Object.assign(window, {
  MODEL_SECTIONS, BUILD_SLUG, ANNUAL_SLUG,
  SectionCard, SectionFlow,
  buildStateFor, annualStateFor,
});
