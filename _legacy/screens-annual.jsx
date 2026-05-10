// Annual Update v2 — Fast import + targeted review
// Flow: 1) Refresh inputs → 2) Section reviews → 3) Review changes → 4) Update packet
//
// Design principle: Annual Update is a REVIEW system, not a modeling system.
// Each section page answers: "What changed, and do I trust it?"

const { ANNUAL_CHANGES, RECOVERY_DELTAS, REV_TRACKING, REV_SUMMARY } = window.AFFERENT_EXT;
const { useState: uSAU } = React;

// =========================================================================
// Section registry — single source of truth for the 7 review pages
// =========================================================================
const SECTIONS = [
  { k:"services",  label:"Services",        sub:"Service definitions and mappings",
    autoPct: 96, needsReview: 2,  conf:"High",
    impact: { label:"No cost impact",       tone:"neutral" } },
  { k:"salary",    label:"Direct Labor",    sub:"Salary, benefits, and FTE",
    autoPct: 92, needsReview: 6,  conf:"Medium",
    impact: { label:"+$260K cost",          tone:"neg" } },
  { k:"operating", label:"Operating",       sub:"Department non-labor costs",
    autoPct: 100, needsReview: 0, conf:"High",
    impact: { label:"+$12K cost",           tone:"neg" } },
  { k:"cap",       label:"Cost Allocation", sub:"Citywide indirect allocations",
    autoPct: 86, needsReview: 2,  conf:"Medium-High",
    impact: { label:"+$80K cost",           tone:"neg" } },
  { k:"workload",  label:"Workload",        sub:"Permit & application volumes",
    autoPct: 99, needsReview: 17, conf:"Medium",
    impact: { label:"+$120K cost / unit",   tone:"neg" } },
  { k:"costs",     label:"Cost of service", sub:"Calculated full cost per service",
    autoPct: 100, needsReview: 0, conf:"High",
    impact: { label:"Recomputed",           tone:"neutral" } },
  { k:"policy",    label:"Recovery Policy", sub:"Recovery targets and exceptions",
    autoPct: 100, needsReview: 1, conf:"High",
    impact: { label:"Policy review",        tone:"warn" } },
  { k:"fees",      label:"Fee schedule",    sub:"Recovery vs. adopted fees",
    autoPct: 99, needsReview: 2,  conf:"High",
    impact: { label:"−8 pts recovery",      tone:"neg" } },
];

const SECTION_BY_K = Object.fromEntries(SECTIONS.map(s => [s.k, s]));

// =========================================================================
// Annual Update Home
// =========================================================================
function AnnualUpdateHome({ onNavSub }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow={<AnnualEyebrow role="Overview" label="FY 2026-27"/>}
        title="Annual refresh"
        subtitle="Prior model carried forward. Confirm this year's inputs."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Methodology</Btn>}
      />

      <div style={{ marginTop: 4 }}>
        <SectionFlow
          mode="annual"
          getState={annualStateFor}
          currentKey={null}
          onPick={(k) => onNavSub(ANNUAL_SLUG[k])}
        />
      </div>
    </div>
  );
}

// =========================================================================
// Step 1 — Refresh Inputs (kept fast, grouped by model section)
// =========================================================================
function AnnualRefreshScreen({ onNavSub }) {
  const cards = [
    { name:"Adopted Budget",        rows:842,  mapped:811, review:31, conf:"High",        section:"Operating + Direct Labor" },
    { name:"Salary and Benefits",   rows: 73,  mapped: 67, review: 6, conf:"Medium",      section:"Direct Labor" },
    { name:"Staffing / FTE",        rows: 73,  mapped: 73, review: 0, conf:"High",        section:"Direct Labor" },
    { name:"CAP / Indirect Costs",  rows: 14,  mapped: 12, review: 2, conf:"Medium-High", section:"Cost Allocation" },
    { name:"Workload Volumes",      rows:1246, mapped:1229,review:17, conf:"Medium",      section:"Workload" },
    { name:"Current Fee Schedule",  rows:216,  mapped:214, review: 2, conf:"High",        section:"Fee schedule" },
  ];
  const totalRows = cards.reduce((a,c) => a+c.rows, 0);
  const totalMapped = cards.reduce((a,c) => a+c.mapped, 0);
  const totalReview = cards.reduce((a,c) => a+c.review, 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow={<AnnualEyebrow role="Import node" label="Refresh inputs"/>}
        title="Refresh annual inputs"
        subtitle="Six inputs change each year. Imported, auto-mapped, and routed to section reviews."
      />

      <StatusRow items={[
        `${totalRows.toLocaleString()} rows imported`,
        `${cards.length} inputs`,
        { value: `${Math.round(totalMapped/totalRows*100)}% auto-mapped`, tone: "pos" },
        { value: totalReview > 0 ? `${totalReview} need review` : "All clean", tone: totalReview > 0 ? "warn" : "pos" },
        "Confidence · Medium-High",
        "Imported Apr 24, 2026",
      ]}/>

      <DropZone
        accept=".xlsx,.csv,.pdf,.zip"
        formats="xlsx, csv, pdf, or a zip of all six exports"
        hint="Drag this year's source files. Auto-routed to the matching section, or drop a zip to refresh all six."
        lastImport={{ file:"FY26-27 annual refresh.zip · 6 files", rows: totalRows, mapped: totalMapped, review: totalReview, date:"Apr 24, 2026" }}
      />

      <div>
        <SectionLabel>Imports by model section</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap: 14 }}>
          {cards.map((c, i) => {
            const pct = Math.round(c.mapped / c.rows * 100);
            return (
              <div key={i} style={{ background:"var(--paper)", border:"1px solid var(--rule)", padding: 20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 4 }}>
                  <div>
                    <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing:"0.12em", color:"var(--ink-3)", textTransform:"uppercase" }}>
                      {c.section}
                    </div>
                    <div className="display" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{c.name}</div>
                  </div>
                  <Confidence level={c.conf}/>
                </div>
                <div style={{ marginTop: 14 }}>
                  <ProgressBar pct={pct} height={6} color={c.review > 10 ? "var(--warn)" : "var(--pos)"}/>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
                  <div><div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase" }}>Imported</div><div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{c.rows.toLocaleString()}</div></div>
                  <div><div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase" }}>Auto-mapped</div><div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color:"var(--pos)" }}>{c.mapped.toLocaleString()}</div></div>
                  <div><div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase" }}>Need review</div><div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: c.review > 10 ? "var(--warn)" : "var(--ink)" }}>{c.review}</div></div>
                </div>
                <div style={{ marginTop: 14, paddingTop: 12, borderTop:"1px solid var(--rule)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span className="mono" style={{ fontSize: 10.5, color:"var(--ink-4)" }}>Imported Apr 18, 2026 · src/{c.section.toLowerCase().replace(/[^a-z]+/g,"-")}.xlsx</span>
                  <Btn kind="ghost"><Icon name="upload" size={11}/> Re-import</Btn>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AnnualUpdateHome, AnnualRefreshScreen });
