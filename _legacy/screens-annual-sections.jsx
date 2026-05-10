// Annual Update v2 — Section Review pages
//
// Each section page answers: "What changed, and do I trust it?"
// Default view = ONLY changed items, low-confidence, unmapped.
// "View all" drill-down is collapsed by default.
//
// All 7 sections share the same shell: SectionReviewShell.

const { ANNUAL_CHANGES: AC2 } = window.AFFERENT_EXT;
const { useState: uSSR } = React;

// FS-v2 building blocks (defined in screens-fee-schedule-v2.jsx + screens-cost-of-service.jsx)
const {
  PriorityDot, ConfidenceBadge, ConfReason, DecisionControl,
  DrilldownShell, DrilldownColumn,
  TableToolbar, DecisionGravityHeader, StatusPill,
} = window;

// =========================================================================
// Section data — what changed in each section
// =========================================================================

// Each row: { id, item, prior, current, delta, deltaTone, confidence, status, note? }
// status: "auto" (auto-mapped, no action needed unless user opens) | "needs-review" | "low-confidence" | "unmapped"
// Display logic: by default show only status !== "auto" rows.

const SECTION_DATA = {
  services: {
    summary: { autoPct: 96, needsReview: 2, conf:"High", impact:"No cost impact", impactTone:"neutral",
      narrative:"Service catalog reused from FY 2025-26 baseline. One position-title rename and one fee mapping change to confirm." },
    rows: [
      { id:"s1", item:"Planning Technician → Planning Specialist", prior:"Planning Technician", current:"Planning Specialist", delta:"Rename", deltaTone:"neutral", confidence:"High", status:"needs-review", note:"Affects 3 services. Mapping is automatic but needs confirmation." },
      { id:"s2", item:"Fire inspection fee mapping",               prior:"4 fees mapped",         current:"3 fees mapped",         delta:"−1 fee",  deltaTone:"warn",    confidence:"Low",  status:"low-confidence", note:"One fee no longer has a clean mapping. Review before continuing." },
      { id:"s3", item:"Service catalog (37 services)",             prior:"37 services",            current:"37 services",            delta:"No change", deltaTone:"neutral", confidence:"High", status:"auto" },
      { id:"s4", item:"Long-range planning exclusion",             prior:"Excluded",               current:"Excluded",               delta:"No change", deltaTone:"neutral", confidence:"High", status:"auto" },
    ],
    detail: "Affected services: Pre-application Meeting, Conditional Use Permit, Site Development Review (3 services use the renamed position).",
  },

  salary: {
    summary: { autoPct: 92, needsReview: 6, conf:"Medium", impact:"+$260K cost", impactTone:"neg",
      narrative:"Salary and benefits increased materially across Planning. Six positions need review — the largest is an 8.5% Planning increase driven by COLA + step changes." },
    rows: [
      { id:"sa1", item:"Planning department total S&B",        prior:"$2.31M",  current:"$2.51M",  delta:"+$200K (+8.5%)", deltaTone:"neg",  confidence:"High",   status:"needs-review", note:"Driver: COLA 4% + 4 positions stepped up + 1 new hire. Single biggest cost change this year." },
      { id:"sa2", item:"Building department total S&B",        prior:"$1.62M",  current:"$1.68M",  delta:"+$60K (+3.7%)",  deltaTone:"neg",  confidence:"High",   status:"auto" },
      { id:"sa3", item:"Engineering department total S&B",     prior:"$880K",   current:"$895K",   delta:"+$15K (+1.7%)",  deltaTone:"neg",  confidence:"High",   status:"auto" },
      { id:"sa4", item:"Fire Marshal — productive hours missing", prior:"1,720 hrs", current:"—",   delta:"Missing",         deltaTone:"warn", confidence:"Low",    status:"unmapped", note:"Productive hours not in import. Defaulting to 1,720 from baseline. Confirm or override." },
      { id:"sa5", item:"Productive hours assumption",          prior:"1,720 hrs/yr", current:"1,720 hrs/yr", delta:"No change", deltaTone:"neutral", confidence:"High", status:"auto" },
      { id:"sa6", item:"Benefits load factor",                 prior:"35.5%",   current:"36.2%",   delta:"+0.7 pts",       deltaTone:"neg",  confidence:"Medium", status:"needs-review", note:"PERS rate update + medical premium increase." },
      { id:"sa7", item:"New position: Senior Planner",         prior:"—",       current:"1.0 FTE", delta:"+1 FTE",         deltaTone:"neg",  confidence:"Medium", status:"needs-review", note:"Approved in adopted budget. Confirm role-rate mapping." },
      { id:"sa8", item:"Vacancy: Permit Technician",           prior:"1.0 FTE", current:"1.0 FTE budgeted", delta:"Vacant 4 mo", deltaTone:"warn", confidence:"Medium", status:"needs-review", note:"Use budgeted or actual? Affects $/hr by ~$8." },
      { id:"sa9", item:"Planning Technician title change",     prior:"Planning Technician", current:"Planning Specialist", delta:"Rename", deltaTone:"neutral", confidence:"High", status:"needs-review", note:"Same person, same comp. Title only." },
    ],
    detail: "Top driver: Planning S&B increase. Affected services: Planning Review, Conditional Use Permit, Design Review, Site Development Review.",
  },

  operating: {
    summary: { autoPct: 100, needsReview: 0, conf:"High", impact:"+$12K cost", impactTone:"neg",
      narrative:"All 22 operating cost lines mapped to the same departments as last year. Modest line-item drift; no new exclusions or recategorizations." },
    rows: [
      { id:"o1", item:"Building 3rd-party plan check overflow", prior:"$72K",  current:"$78K",  delta:"+$6K",  deltaTone:"neg", confidence:"High", status:"auto" },
      { id:"o2", item:"Engineering on-call traffic + civil",    prior:"$50K",  current:"$54K",  delta:"+$4K",  deltaTone:"neg", confidence:"High", status:"auto" },
      { id:"o3", item:"Citywide permit/agenda system",          prior:"$30K",  current:"$32.4K", delta:"+$2.4K", deltaTone:"neg", confidence:"High", status:"auto" },
      { id:"o4", item:"Capital outlay — vehicle reserve",       prior:"Excluded", current:"Excluded", delta:"No change", deltaTone:"neutral", confidence:"High", status:"auto" },
      { id:"o5", item:"Planning legal noticing reimbursement",  prior:"Excluded", current:"Excluded", delta:"No change", deltaTone:"neutral", confidence:"High", status:"auto" },
    ],
    detail: "All exclusions reused from baseline. No items routed to review.",
  },

  cap: {
    summary: { autoPct: 86, needsReview: 2, conf:"Medium-High", impact:"+$80K cost", impactTone:"neg",
      narrative:"CAP allocations tracked the new Sept 2025 plan. Two pools need review: City Attorney (legal recoverability question) and Council Support." },
    rows: [
      { id:"cap1", item:"City Attorney town-wide support",      prior:"$180K",  current:"$198K",  delta:"+$18K (+10%)",  deltaTone:"neg", confidence:"Medium", status:"needs-review", note:"Recoverability question: how much of legal time is fee-related vs. policy?" },
      { id:"cap2", item:"City Manager Council/Legislative",     prior:"$525K",  current:"$550K",  delta:"+$25K (+4.8%)", deltaTone:"neg", confidence:"Medium", status:"needs-review", note:"Allocation basis changed: agenda item count went up. Confirm." },
      { id:"cap3", item:"Finance Town-wide accounting support", prior:"$485K",  current:"$509K",  delta:"+$24K (+5%)",   deltaTone:"neg", confidence:"High", status:"auto" },
      { id:"cap4", item:"HR allocation",                        prior:"$66K",   current:"$69K",   delta:"+$3K (+5%)",    deltaTone:"neg", confidence:"High", status:"auto" },
      { id:"cap5", item:"Insurance town-wide liability",        prior:"$400K",  current:"$400K",  delta:"No change",      deltaTone:"neutral", confidence:"High", status:"auto" },
      { id:"cap6", item:"Boards & Committees (excluded)",       prior:"Excluded", current:"Excluded", delta:"No change",   deltaTone:"neutral", confidence:"High", status:"auto" },
    ],
    detail: "Total CAP allocated to Planning/Building/Engineering/Fire = $1.21M (+$80K vs. prior). Allocation method unchanged.",
  },

  workload: {
    summary: { autoPct: 99, needsReview: 17, conf:"Medium", impact:"+$120K cost / unit", impactTone:"neg",
      narrative:"Permit volumes shifted noticeably. Building plan check and inspection volumes declined; encroachment permits up 12%. 17 services have material volume changes." },
    rows: [
      { id:"w1",  item:"Building Plan Check",          prior:"117/yr", current:"110/yr", delta:"−7 (−6%)",   deltaTone:"warn", confidence:"High",  status:"needs-review", note:"Direct cost recovery effect. Consider 3-year average if volume is volatile." },
      { id:"w2",  item:"Building Inspection",          prior:"455/yr", current:"432/yr", delta:"−23 (−5%)",  deltaTone:"warn", confidence:"High",  status:"needs-review", note:"Includes fewer reinspections — may be data quality, not real decline." },
      { id:"w3",  item:"Encroachment Permit",          prior:"151/yr", current:"169/yr", delta:"+18 (+12%)", deltaTone:"pos",  confidence:"High",  status:"auto" },
      { id:"w4",  item:"Design Review",                prior:"28/yr",  current:"30/yr",  delta:"+2 (+7%)",   deltaTone:"neutral", confidence:"High", status:"auto" },
      { id:"w5",  item:"Sewer Review",                 prior:"22/yr",  current:"—",      delta:"Missing",     deltaTone:"warn", confidence:"Low",  status:"unmapped", note:"No FY 26-27 export. Use prior or default to 0?" },
      { id:"w6",  item:"Fire Plan Review",             prior:"35/yr",  current:"38/yr",  delta:"+3 (+9%)",   deltaTone:"neutral", confidence:"Medium", status:"needs-review", note:"Source: prior study (no permit-system data). Reused last year." },
      { id:"w7",  item:"Erosion Inspections",          prior:"160/yr", current:"157/yr", delta:"−3 (−2%)",   deltaTone:"neutral", confidence:"High",  status:"auto" },
      { id:"w8",  item:"Conditional Use Permit",       prior:"4/yr",   current:"4/yr",   delta:"No change",   deltaTone:"neutral", confidence:"High",  status:"auto" },
      { id:"w9",  item:"Zoning Clearance",             prior:"44/yr",  current:"46/yr",  delta:"+2 (+5%)",   deltaTone:"neutral", confidence:"High",  status:"auto" },
    ],
    detail: "Methodology question: should small-volume services use 3-yr rolling average to smooth noise? Currently using single-year actuals.",
  },

  costs: {
    summary: { autoPct: 100, needsReview: 0, conf:"High", impact:"Recomputed", impactTone:"neutral",
      narrative:"Cost of service is computed deterministically from the upstream sections. Nothing to review here directly — review the upstream sections to change these outputs." },
    rows: [
      { id:"c1", item:"Planning total cost",        prior:"$2.38M",  current:"$2.58M",  delta:"+$200K (+8.4%)", deltaTone:"neg",  confidence:"High", status:"auto" },
      { id:"c2", item:"Building total cost",        prior:"$1.50M",  current:"$1.59M",  delta:"+$94K (+6.3%)",  deltaTone:"neg",  confidence:"High", status:"auto" },
      { id:"c3", item:"Engineering total cost",     prior:"$1.07M",  current:"$1.10M",  delta:"+$30K (+2.8%)",  deltaTone:"neg",  confidence:"High", status:"auto" },
      { id:"c4", item:"Planning FBHR ($/hr)",       prior:"$301",    current:"$326",    delta:"+$25",            deltaTone:"neg",  confidence:"High", status:"auto" },
      { id:"c5", item:"Building FBHR ($/hr)",       prior:"$362",    current:"$378",    delta:"+$16",            deltaTone:"neg",  confidence:"High", status:"auto" },
      { id:"c6", item:"Engineering FBHR ($/hr)",    prior:"$359",    current:"$369",    delta:"+$10",            deltaTone:"neg",  confidence:"High", status:"auto" },
    ],
    detail: "Outputs are read-only here. To change them, update Salary, Operating, CAP, or Workload sections.",
  },

  policy: {
    summary: { autoPct: 100, needsReview: 1, conf:"High", impact:"Policy review", impactTone:"warn",
      narrative:"Recovery targets and exceptions carry forward from FY 2025-26 unchanged. Because cost rose, holding targets flat means recovery shortfall grows. Council may want to revisit." },
    rows: [
      { id:"p1", item:"Building recovery target",       prior:"95%",      current:"95%",      delta:"No change",  deltaTone:"neutral", confidence:"High",   status:"auto" },
      { id:"p2", item:"Planning recovery target",       prior:"30%",      current:"30%",      delta:"No change",  deltaTone:"neutral", confidence:"High",   status:"auto" },
      { id:"p3", item:"Engineering recovery target",    prior:"50%",      current:"50%",      delta:"No change",  deltaTone:"neutral", confidence:"High",   status:"auto" },
      { id:"p4", item:"Fire recovery target",           prior:"40%",      current:"40%",      delta:"No change",  deltaTone:"neutral", confidence:"High",   status:"auto" },
      { id:"p5", item:"Recovery shortfall vs. targets", prior:"$340K",    current:"$420K",    delta:"+$80K",       deltaTone:"warn",    confidence:"High",   status:"needs-review", note:"Targets unchanged but cost rose. Council can hold, raise targets, or accept growing subsidy." },
      { id:"p6", item:"Fee exceptions",                  prior:"4 exceptions", current:"4 exceptions", delta:"No change", deltaTone:"neutral", confidence:"High", status:"auto" },
      { id:"p7", item:"Subsidy policy memo",             prior:"Adopted Jul 2024", current:"Unchanged", delta:"No change", deltaTone:"neutral", confidence:"High", status:"auto" },
    ],
    detail: "Targets and exceptions unchanged. Council policy choice: hold targets and accept growing subsidy, or raise targets to keep recovery flat.",
  },

  fees: {
    summary: { autoPct: 99, needsReview: 2, conf:"High", impact:"−8 pts recovery", impactTone:"neg",
      narrative:"Adopted fees are unchanged from FY 2025-26. Because cost rose, blended recovery dropped from 72% to 64% — recovery drift of $420K. This is the highest-impact item in the update." },
    rows: [
      { id:"f1", item:"Blended cost recovery",       prior:"72%",     current:"64%",     delta:"−8 pts",         deltaTone:"warn", confidence:"High", status:"needs-review", note:"Highest-impact change. Council policy decision: hold fees, raise to full cost, or partial increase." },
      { id:"f2", item:"Recovery drift (vs. prior)",  prior:"$0",       current:"$420K",   delta:"+$420K shortfall", deltaTone:"neg", confidence:"High", status:"needs-review", note:"Annual subsidy increase from holding fees flat against rising cost." },
      { id:"f3", item:"Building recovery",           prior:"91%",      current:"83%",     delta:"−8 pts",         deltaTone:"warn", confidence:"High", status:"auto" },
      { id:"f4", item:"Planning recovery",           prior:"27%",      current:"24%",     delta:"−3 pts",         deltaTone:"warn", confidence:"High", status:"auto" },
      { id:"f5", item:"Engineering recovery",        prior:"14%",      current:"—",       delta:"Pending",         deltaTone:"warn", confidence:"Low",  status:"auto" },
      { id:"f6", item:"Adopted fee schedule",        prior:"Jul 1, 2025", current:"Jul 1, 2025 (unchanged)", delta:"No change", deltaTone:"neutral", confidence:"High", status:"auto" },
    ],
    detail: "Council policy decision required. The model can produce a recommended fee schedule at any recovery target.",
  },
};

// =========================================================================
// SectionReviewShell — Fee Schedule v2 visual format
// =========================================================================
function priorityForStatus(status) {
  if (status === "unmapped") return "high";
  if (status === "low-confidence") return "high";
  if (status === "needs-review") return "med";
  return "none";
}

function SectionReviewShell({ sectionKey, onNavSub }) {
  const meta = SECTIONS.find(s => s.k === sectionKey);
  const data = SECTION_DATA[sectionKey];
  if (!meta || !data) return <div className="page">Unknown section: {sectionKey}</div>;

  const idx = SECTIONS.findIndex(s => s.k === sectionKey);
  const prev = idx > 0 ? SECTIONS[idx - 1] : null;
  const next = idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null;

  const [filter, setFilter] = uSSR("NEEDS"); // default: only items that need review
  const [openId, setOpenId] = uSSR(null);
  const [statusOverrides, setStatusOverrides] = uSSR({});
  const setStatus = (id, st) => setStatusOverrides(s => ({ ...s, [id]: st }));

  const enriched = data.rows.map(r => ({ ...r, priority: priorityForStatus(r.status) }));

  const filterCounts = {
    ALL:      enriched.length,
    NEEDS:    enriched.filter(r => r.status !== "auto" && !statusOverrides[r.id]).length,
    HIGH:     enriched.filter(r => r.priority === "high").length,
    LOW_CONF: enriched.filter(r => (r.confidence || "").toLowerCase() === "low").length,
    APPROVED: enriched.filter(r => statusOverrides[r.id] === "approved").length,
  };

  const filtered = enriched.filter(r => {
    if (filter === "NEEDS")    return r.status !== "auto" && !statusOverrides[r.id];
    if (filter === "HIGH")     return r.priority === "high";
    if (filter === "LOW_CONF") return (r.confidence || "").toLowerCase() === "low";
    if (filter === "APPROVED") return statusOverrides[r.id] === "approved";
    return true; // ALL
  });

  const sorted = [...filtered].sort((a, b) => {
    const pri = { high: 3, med: 2, low: 1, none: 0 };
    const conf = { low: 3, medium: 2, high: 1 };
    const aScore = pri[a.priority] * 10 + (conf[(a.confidence||"").toLowerCase()] || 0);
    const bScore = pri[b.priority] * 10 + (conf[(b.confidence||"").toLowerCase()] || 0);
    return bScore - aScore;
  });

  const totals = {
    approved: enriched.filter(r => statusOverrides[r.id] === "approved").length,
    pending:  enriched.filter(r => r.status !== "auto" && !statusOverrides[r.id]).length,
    deferred: enriched.filter(r => statusOverrides[r.id] === "deferred").length,
  };

  return (
    <div className="page">

      <DecisionGravityHeader
        eyebrow={<AnnualEyebrow role="Section review" label={meta.label}/>}
        title={meta.label}
        headline={data.summary.impact}
        headlineSub={
          <span className="mono" style={{ fontSize: 12, letterSpacing:"0.04em", color:"var(--ink-3)" }}>
            <b style={{ color:"var(--ink)", fontWeight: 600 }}>{data.summary.autoPct}%</b> auto-mapped · <b style={{ color:"var(--ink)", fontWeight: 600 }}>{data.summary.needsReview}</b> review · confidence <b style={{ color:"var(--ink)", fontWeight: 600 }}>{data.summary.conf}</b>
          </span>
        }
        decisionStatus={
          totals.pending > 0
            ? { label: `${totals.pending} pending`, sub: "Review before continuing" }
            : { label: "Section reviewed", sub: "All items resolved" }
        }
      />

      {/* Section progress strip */}
      <SectionProgressStrip current={sectionKey} onNavSub={onNavSub}/>

      {/* Decision queue — same chrome as Fee Schedule v2 */}
      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
        <TableToolbar
          title={`${meta.label} decision queue`}
          shownCount={sorted.length}
          totalCount={enriched.length}
          filters={[
            {
              id: "queue", label: "Queue",
              options: [
                { value: "ALL",      label: "All rows",       count: filterCounts.ALL },
                { value: "NEEDS",    label: "Needs review",   count: filterCounts.NEEDS },
                { value: "HIGH",     label: "High priority",  count: filterCounts.HIGH },
                { value: "LOW_CONF", label: "Limited data",   count: filterCounts.LOW_CONF },
                { value: "APPROVED", label: "Approved",       count: filterCounts.APPROVED },
              ],
              value: filter, onChange: setFilter,
            },
          ]}
        />

        {/* Header row */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"minmax(280px, 2fr) 130px 120px 120px 130px 200px 28px",
          padding:"10px 14px", background:"var(--paper-2)",
          borderBottom:"1px solid var(--rule-strong)",
          fontFamily:"var(--ff-mono)", fontSize: 10.5, fontWeight: 600,
          letterSpacing:"0.08em", color:"var(--ink-3)", textTransform:"uppercase",
          alignItems:"end",
        }}>
          <div>Item</div>
          <div>Status</div>
          <div style={{ textAlign:"right" }}>Prior</div>
          <div style={{ textAlign:"right" }}>Current</div>
          <div style={{ textAlign:"right" }}>Delta</div>
          <div style={{ textAlign:"right" }}>Decision</div>
          <div></div>
        </div>

        {sorted.map(r => {
          const open = openId === r.id;
          const decisionStatus = statusOverrides[r.id];
          const isApproved = decisionStatus === "approved";
          const isDeferred = decisionStatus === "deferred";
          const deltaColor =
            r.deltaTone === "neg"  ? "var(--neg)" :
            r.deltaTone === "pos"  ? "var(--pos)" :
            r.deltaTone === "warn" ? "var(--warn)" : "var(--ink-3)";
          const confLevel = (r.confidence || "").toLowerCase() === "high" ? "high" : (r.confidence || "").toLowerCase() === "medium" ? "med" : "low";
          const statusKind =
            r.status === "needs-review"   ? "review" :
            r.status === "low-confidence" ? "warn"   :
            r.status === "unmapped"       ? "bad"    : "ok";
          const statusLabel =
            r.status === "needs-review"   ? "Review" :
            r.status === "low-confidence" ? "Limited data" :
            r.status === "unmapped"       ? "Unmapped" : "Auto";

          return (
            <React.Fragment key={r.id}>
              <div style={{
                display:"grid",
                gridTemplateColumns:"minmax(280px, 2fr) 130px 120px 120px 130px 200px 28px",
                padding:"10px 14px", borderBottom:"1px solid var(--rule)",
                alignItems:"center", gap: 0,
                background: open ? "var(--paper-2)" : isApproved ? "oklch(98% 0.015 155)" : isDeferred ? "var(--paper-2)" : "transparent",
                opacity: isDeferred ? 0.65 : r.status === "auto" ? 0.85 : 1,
                cursor:"pointer",
              }} onClick={() => setOpenId(open ? null : r.id)}>
                <div>
                  <div style={{ fontWeight: r.status === "auto" ? 400 : 500, fontSize: 13 }}>{r.item}</div>
                  <div style={{ marginTop: 3 }}>
                    <span className="mono" style={{ fontSize: 10.5, color:"var(--ink-3)" }}>{r.id}</span>
                  </div>
                </div>
                <div><StatusPill kind={statusKind}>{statusLabel}</StatusPill></div>
                <div className="mono num" style={{ textAlign:"right", fontSize: 11.5, color:"var(--ink-3)" }}>{r.prior}</div>
                <div className="mono num" style={{ textAlign:"right", fontSize: 11.5 }}>{r.current}</div>
                <div className="mono num" style={{ textAlign:"right", fontSize: 12, color: deltaColor, fontWeight: 500 }}>{r.delta}</div>
                <div onClick={(e) => e.stopPropagation()} style={{ display:"flex", justifyContent:"flex-end" }}>
                  <DecisionControl status={decisionStatus} onSet={(st) => setStatus(r.id, st)}/>
                </div>
                <div style={{
                  color: "var(--ink-3)", fontSize: 9, textAlign: "right",
                  transform: open ? "rotate(90deg)" : "none",
                  transition: "transform 120ms ease",
                }}>▶</div>
              </div>

              {open && (
                <DrilldownShell isLast={false}>
                  {/* ① Diff */}
                  <DrilldownColumn marker="①" title="Prior vs. current">
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", border:"1px solid var(--rule)", background:"var(--paper)" }}>
                      <div style={{ padding:"12px 14px", borderRight:"1px solid var(--rule)" }}>
                        <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 4 }}>Prior · FY 25-26</div>
                        <div className="num" style={{ fontSize: 16, fontWeight: 600, color:"var(--ink-3)" }}>{r.prior}</div>
                      </div>
                      <div style={{ padding:"12px 14px", background: r.deltaTone === "neg" ? "var(--neg-tint)" : r.deltaTone === "pos" ? "var(--pos-tint)" : r.deltaTone === "warn" ? "var(--warn-tint)" : "var(--paper-2)" }}>
                        <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing:"0.1em", color:"var(--ink-3)", textTransform:"uppercase", marginBottom: 4 }}>Current · FY 26-27</div>
                        <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>{r.current}</div>
                        <div className="mono" style={{ fontSize: 11, color: deltaColor, marginTop: 4, fontWeight: 500 }}>{r.delta}</div>
                      </div>
                    </div>
                  </DrilldownColumn>

                  {/* ② Why this changed / Note */}
                  <DrilldownColumn marker="②" title="Why this matters">
                    <div style={{ fontSize: 12.5, color:"var(--ink-2)", lineHeight: 1.6 }}>
                      {r.note || "No additional notes. Status auto-derived from import diff."}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button onClick={(e) => { e.stopPropagation(); onNavSub(buildLinkFor(sectionKey)); }} style={{
                        fontSize: 11.5, color:"var(--accent)", textDecoration:"underline", textUnderlineOffset: 3,
                        cursor:"pointer", background:"transparent",
                      }}>Open in Build Model →</button>
                    </div>
                  </DrilldownColumn>

                  {/* ③ Confidence */}
                  <DrilldownColumn marker="③" title="Confidence & flags">
                    <div style={{ display:"flex", flexDirection:"column", gap: 6, fontSize: 11.5, color:"var(--ink-2)" }}>
                      <ConfReason
                        ok={(r.confidence || "").toLowerCase() === "high"}
                        text={`Source confidence: ${r.confidence || "—"}`}
                      />
                      <ConfReason
                        ok={r.status !== "unmapped"}
                        text={r.status === "unmapped" ? "Unmapped — no current data found" : "Mapped from import"}
                      />
                      <ConfReason
                        ok={r.status !== "low-confidence"}
                        text={r.status === "low-confidence" ? "Low-confidence flag — verify manually" : "No low-confidence flag"}
                      />
                    </div>
                    <div style={{ marginTop: 10, fontSize: 10.5, color:"var(--ink-3)", lineHeight: 1.5 }}>
                      Auto-flag rules driven by mapping completeness and historical variance.
                    </div>
                  </DrilldownColumn>
                </DrilldownShell>
              )}
            </React.Fragment>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--ink-3)", fontSize: 12.5 }}>
            {filter === "NEEDS"
              ? "All rows in this section were auto-mapped. Switch to \u201cAll rows\u201d to view the full audit trail."
              : "No rows match current filter."}
          </div>
        )}
      </div>

      {/* Drill-down (collapsed) */}
      <details style={{ background:"var(--paper)", border:"1px solid var(--rule)" }}>
        <summary style={{ padding:"14px 18px", cursor:"pointer", fontSize: 13, fontWeight: 500, display:"flex", justifyContent:"space-between", alignItems:"center", listStyle:"none" }}>
          <span style={{ display:"flex", alignItems:"center", gap: 8 }}>
            <Icon name="arrow-right" size={11} color="var(--ink-3)"/>
            Drill into Build Model → {meta.label} <span style={{ color:"var(--ink-3)", fontWeight: 400 }}>(advanced — full editing UI)</span>
          </span>
        </summary>
        <div style={{ padding:"14px 18px", borderTop:"1px solid var(--rule)", fontSize: 12.5, color:"var(--ink-2)", lineHeight: 1.6 }}>
          {data.detail}
          <div style={{ marginTop: 12 }}>
            <Btn kind="ghost" onClick={() => onNavSub(buildLinkFor(sectionKey))}>Open in Build Model <Icon name="arrow-right" size={12}/></Btn>
          </div>
        </div>
      </details>
    </div>
  );
}

function buildLinkFor(k) {
  const map = { services:"build-services", salary:"build-salary", operating:"build-operating", cap:"build-cap", workload:"build-workload", costs:"build-costs", fees:"build-feestudy" };
  return map[k] || "build";
}

// =========================================================================
// SectionProgressStrip — uses unified SectionFlow + SectionCard
// (Same component as Build Model > Overview, different state via annualStateFor.)
// =========================================================================
function SectionProgressStrip({ current, onNavSub }) {
  return (
    <div>
      <SectionFlow
        mode="annual"
        getState={annualStateFor}
        currentKey={current}
        onPick={(k) => onNavSub(ANNUAL_SLUG[k])}
      />
    </div>
  );
}

// =========================================================================
// AnnualEyebrow — matches NodeEyebrow visual format used across Build Model.
// Format:  Annual Update · [Role] · [Step label]
// =========================================================================
function AnnualEyebrow({ role, label }) {
  return (
    <span>
      Annual Update
      <span style={{ color: "var(--ink-4)", margin: "0 7px" }}>·</span>
      {role}
      <span style={{ color: "var(--ink-4)", margin: "0 7px" }}>·</span>
      {label}
    </span>
  );
}

Object.assign(window, { SectionReviewShell, SECTION_DATA, AnnualEyebrow });
