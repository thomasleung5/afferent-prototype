// Annual Update data — sections, per-section change rows, cross-model change list.
// Sourced from the FY 2026-27 annual refresh cycle (Los Altos Hills).

export type SectionKey =
  | "services" | "salary" | "operating" | "cap"
  | "workload" | "costs" | "policy" | "fees";

export type Tone = "neutral" | "neg" | "pos" | "warn";
export type RowStatus = "auto" | "needs-review" | "low-confidence" | "unmapped";
export type ConfLevel = "High" | "Medium" | "Medium-High" | "Low";

export interface Section {
  k: SectionKey;
  label: string;
  sub: string;
  autoPct: number;
  needsReview: number;
  conf: ConfLevel;
  impact: { label: string; tone: Tone };
}

export interface SectionRow {
  id: string;
  item: string;
  prior: string;
  current: string;
  delta: string;
  deltaTone: Tone;
  confidence: ConfLevel;
  status: RowStatus;
  note?: string;
}

export interface SectionEntry {
  summary: {
    autoPct: number;
    needsReview: number;
    conf: ConfLevel;
    impact: string;
    impactTone: Tone;
    narrative: string;
  };
  rows: SectionRow[];
  detail: string;
}

export interface AnnualChange {
  id: string;
  change: string;
  prior: string;
  current: string;
  impact: string;
  affected: string;
  confidence: ConfLevel;
  action: string;
  badge: string;
}

export const SECTIONS: Section[] = [
  { k: "services",  label: "Services",        sub: "Service definitions and mappings",
    autoPct: 96, needsReview: 2,  conf: "High",
    impact: { label: "No cost impact",       tone: "neutral" } },
  { k: "salary",    label: "Direct Labor",    sub: "Salary, benefits, and FTE",
    autoPct: 92, needsReview: 6,  conf: "Medium",
    impact: { label: "+$260K cost",          tone: "neg" } },
  { k: "operating", label: "Operating",       sub: "Department non-labor costs",
    autoPct: 100, needsReview: 0, conf: "High",
    impact: { label: "+$12K cost",           tone: "neg" } },
  { k: "cap",       label: "Cost Allocation", sub: "Citywide indirect allocations",
    autoPct: 86, needsReview: 2,  conf: "Medium-High",
    impact: { label: "+$80K cost",           tone: "neg" } },
  { k: "workload",  label: "Workload",        sub: "Permit & application volumes",
    autoPct: 99, needsReview: 17, conf: "Medium",
    impact: { label: "+$120K cost / unit",   tone: "neg" } },
  { k: "costs",     label: "Cost of service", sub: "Calculated full cost per service",
    autoPct: 100, needsReview: 0, conf: "High",
    impact: { label: "Recomputed",           tone: "neutral" } },
  { k: "policy",    label: "Recovery Policy", sub: "Recovery targets and exceptions",
    autoPct: 100, needsReview: 1, conf: "High",
    impact: { label: "Policy review",        tone: "warn" } },
  { k: "fees",      label: "Fee schedule",    sub: "Recovery vs. adopted fees",
    autoPct: 99, needsReview: 2,  conf: "High",
    impact: { label: "−8 pts recovery",      tone: "neg" } },
];

export const SECTION_DATA: Record<SectionKey, SectionEntry> = {
  services: {
    summary: { autoPct: 96, needsReview: 2, conf: "High", impact: "No cost impact", impactTone: "neutral",
      narrative: "Service catalog reused from FY 2025-26 baseline. One position-title rename and one fee mapping change to confirm." },
    rows: [
      { id: "s1", item: "Planning Technician → Planning Specialist", prior: "Planning Technician", current: "Planning Specialist", delta: "Rename", deltaTone: "neutral", confidence: "High", status: "needs-review", note: "Affects 3 services. Mapping is automatic but needs confirmation." },
      { id: "s2", item: "Fire inspection fee mapping",               prior: "4 fees mapped",       current: "3 fees mapped",       delta: "−1 fee",   deltaTone: "warn",    confidence: "Low",  status: "low-confidence", note: "One fee no longer has a clean mapping. Review before continuing." },
      { id: "s3", item: "Service catalog (37 services)",             prior: "37 services",          current: "37 services",          delta: "No change", deltaTone: "neutral", confidence: "High", status: "auto" },
      { id: "s4", item: "Long-range planning exclusion",             prior: "Excluded",             current: "Excluded",             delta: "No change", deltaTone: "neutral", confidence: "High", status: "auto" },
    ],
    detail: "Affected services: Pre-application Meeting, Conditional Use Permit, Site Development Review (3 services use the renamed position).",
  },

  salary: {
    summary: { autoPct: 92, needsReview: 6, conf: "Medium", impact: "+$260K cost", impactTone: "neg",
      narrative: "Salary and benefits increased materially across Planning. Six positions need review — the largest is an 8.5% Planning increase driven by COLA + step changes." },
    rows: [
      { id: "sa1", item: "Planning department total S&B",          prior: "$2.31M",      current: "$2.51M",             delta: "+$200K (+8.5%)", deltaTone: "neg",     confidence: "High",   status: "needs-review", note: "Driver: COLA 4% + 4 positions stepped up + 1 new hire. Single biggest cost change this year." },
      { id: "sa2", item: "Building department total S&B",          prior: "$1.62M",      current: "$1.68M",             delta: "+$60K (+3.7%)",  deltaTone: "neg",     confidence: "High",   status: "auto" },
      { id: "sa3", item: "Engineering department total S&B",       prior: "$880K",       current: "$895K",              delta: "+$15K (+1.7%)",  deltaTone: "neg",     confidence: "High",   status: "auto" },
      { id: "sa4", item: "Fire Marshal — productive hours missing", prior: "1,720 hrs",   current: "—",                  delta: "Missing",         deltaTone: "warn",    confidence: "Low",    status: "unmapped", note: "Productive hours not in import. Defaulting to 1,720 from baseline. Confirm or override." },
      { id: "sa5", item: "Productive hours assumption",            prior: "1,720 hrs/yr", current: "1,720 hrs/yr",      delta: "No change",       deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "sa6", item: "Benefits load factor",                   prior: "35.5%",       current: "36.2%",              delta: "+0.7 pts",        deltaTone: "neg",     confidence: "Medium", status: "needs-review", note: "PERS rate update + medical premium increase." },
      { id: "sa7", item: "New position: Senior Planner",           prior: "—",           current: "1.0 FTE",            delta: "+1 FTE",          deltaTone: "neg",     confidence: "Medium", status: "needs-review", note: "Approved in adopted budget. Confirm role-rate mapping." },
      { id: "sa8", item: "Vacancy: Permit Technician",             prior: "1.0 FTE",     current: "1.0 FTE budgeted",   delta: "Vacant 4 mo",     deltaTone: "warn",    confidence: "Medium", status: "needs-review", note: "Use budgeted or actual? Affects $/hr by ~$8." },
      { id: "sa9", item: "Planning Technician title change",       prior: "Planning Technician", current: "Planning Specialist", delta: "Rename", deltaTone: "neutral", confidence: "High", status: "needs-review", note: "Same person, same comp. Title only." },
    ],
    detail: "Top driver: Planning S&B increase. Affected services: Planning Review, Conditional Use Permit, Design Review, Site Development Review.",
  },

  operating: {
    summary: { autoPct: 100, needsReview: 0, conf: "High", impact: "+$12K cost", impactTone: "neg",
      narrative: "All 22 operating cost lines mapped to the same departments as last year. Modest line-item drift; no new exclusions or recategorizations." },
    rows: [
      { id: "o1", item: "Building 3rd-party plan check overflow", prior: "$72K",   current: "$78K",   delta: "+$6K",    deltaTone: "neg",     confidence: "High", status: "auto" },
      { id: "o2", item: "Engineering on-call traffic + civil",    prior: "$50K",   current: "$54K",   delta: "+$4K",    deltaTone: "neg",     confidence: "High", status: "auto" },
      { id: "o3", item: "Citywide permit/agenda system",          prior: "$30K",   current: "$32.4K", delta: "+$2.4K",  deltaTone: "neg",     confidence: "High", status: "auto" },
      { id: "o4", item: "Capital outlay — vehicle reserve",       prior: "Excluded", current: "Excluded", delta: "No change", deltaTone: "neutral", confidence: "High", status: "auto" },
      { id: "o5", item: "Planning legal noticing reimbursement",  prior: "Excluded", current: "Excluded", delta: "No change", deltaTone: "neutral", confidence: "High", status: "auto" },
    ],
    detail: "All exclusions reused from baseline. No items routed to review.",
  },

  cap: {
    summary: { autoPct: 86, needsReview: 2, conf: "Medium-High", impact: "+$80K cost", impactTone: "neg",
      narrative: "CAP allocations tracked the new Sept 2025 plan. Two pools need review: City Attorney (legal recoverability question) and Council Support." },
    rows: [
      { id: "cap1", item: "City Attorney town-wide support",      prior: "$180K",   current: "$198K",   delta: "+$18K (+10%)",  deltaTone: "neg",     confidence: "Medium", status: "needs-review", note: "Recoverability question: how much of legal time is fee-related vs. policy?" },
      { id: "cap2", item: "City Manager Council/Legislative",     prior: "$525K",   current: "$550K",   delta: "+$25K (+4.8%)", deltaTone: "neg",     confidence: "Medium", status: "needs-review", note: "Allocation basis changed: agenda item count went up. Confirm." },
      { id: "cap3", item: "Finance Town-wide accounting support", prior: "$485K",   current: "$509K",   delta: "+$24K (+5%)",   deltaTone: "neg",     confidence: "High",   status: "auto" },
      { id: "cap4", item: "HR allocation",                        prior: "$66K",    current: "$69K",    delta: "+$3K (+5%)",    deltaTone: "neg",     confidence: "High",   status: "auto" },
      { id: "cap5", item: "Insurance town-wide liability",        prior: "$400K",   current: "$400K",   delta: "No change",      deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "cap6", item: "Boards & Committees (excluded)",       prior: "Excluded", current: "Excluded", delta: "No change",   deltaTone: "neutral", confidence: "High",   status: "auto" },
    ],
    detail: "Total CAP allocated to Planning/Building/Engineering/Fire = $1.21M (+$80K vs. prior). Allocation method unchanged.",
  },

  workload: {
    summary: { autoPct: 99, needsReview: 17, conf: "Medium", impact: "+$120K cost / unit", impactTone: "neg",
      narrative: "Permit volumes shifted noticeably. Building plan check and inspection volumes declined; encroachment permits up 12%. 17 services have material volume changes." },
    rows: [
      { id: "w1", item: "Building Plan Check",     prior: "117/yr", current: "110/yr", delta: "−7 (−6%)",   deltaTone: "warn",    confidence: "High",   status: "needs-review", note: "Direct cost recovery effect. Consider 3-year average if volume is volatile." },
      { id: "w2", item: "Building Inspection",     prior: "455/yr", current: "432/yr", delta: "−23 (−5%)",  deltaTone: "warn",    confidence: "High",   status: "needs-review", note: "Includes fewer reinspections — may be data quality, not real decline." },
      { id: "w3", item: "Encroachment Permit",     prior: "151/yr", current: "169/yr", delta: "+18 (+12%)", deltaTone: "pos",     confidence: "High",   status: "auto" },
      { id: "w4", item: "Design Review",           prior: "28/yr",  current: "30/yr",  delta: "+2 (+7%)",   deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "w5", item: "Sewer Review",            prior: "22/yr",  current: "—",      delta: "Missing",     deltaTone: "warn",    confidence: "Low",    status: "unmapped", note: "No FY 26-27 export. Use prior or default to 0?" },
      { id: "w6", item: "Fire Plan Review",        prior: "35/yr",  current: "38/yr",  delta: "+3 (+9%)",   deltaTone: "neutral", confidence: "Medium", status: "needs-review", note: "Source: prior study (no permit-system data). Reused last year." },
      { id: "w7", item: "Erosion Inspections",     prior: "160/yr", current: "157/yr", delta: "−3 (−2%)",   deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "w8", item: "Conditional Use Permit",  prior: "4/yr",   current: "4/yr",   delta: "No change",   deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "w9", item: "Zoning Clearance",        prior: "44/yr",  current: "46/yr",  delta: "+2 (+5%)",   deltaTone: "neutral", confidence: "High",   status: "auto" },
    ],
    detail: "Methodology question: should small-volume services use 3-yr rolling average to smooth noise? Currently using single-year actuals.",
  },

  costs: {
    summary: { autoPct: 100, needsReview: 0, conf: "High", impact: "Recomputed", impactTone: "neutral",
      narrative: "Cost of service is computed deterministically from the upstream sections. Nothing to review here directly — review the upstream sections to change these outputs." },
    rows: [
      { id: "c1", item: "Planning total cost",    prior: "$2.38M", current: "$2.58M", delta: "+$200K (+8.4%)", deltaTone: "neg", confidence: "High", status: "auto" },
      { id: "c2", item: "Building total cost",    prior: "$1.50M", current: "$1.59M", delta: "+$94K (+6.3%)",  deltaTone: "neg", confidence: "High", status: "auto" },
      { id: "c3", item: "Engineering total cost", prior: "$1.07M", current: "$1.10M", delta: "+$30K (+2.8%)",  deltaTone: "neg", confidence: "High", status: "auto" },
      { id: "c4", item: "Planning FBHR ($/hr)",   prior: "$301",   current: "$326",   delta: "+$25",            deltaTone: "neg", confidence: "High", status: "auto" },
      { id: "c5", item: "Building FBHR ($/hr)",   prior: "$362",   current: "$378",   delta: "+$16",            deltaTone: "neg", confidence: "High", status: "auto" },
      { id: "c6", item: "Engineering FBHR ($/hr)",prior: "$359",   current: "$369",   delta: "+$10",            deltaTone: "neg", confidence: "High", status: "auto" },
    ],
    detail: "Outputs are read-only here. To change them, update Salary, Operating, CAP, or Workload sections.",
  },

  policy: {
    summary: { autoPct: 100, needsReview: 1, conf: "High", impact: "Policy review", impactTone: "warn",
      narrative: "Recovery targets and exceptions carry forward from FY 2025-26 unchanged. Because cost rose, holding targets flat means recovery shortfall grows. Council may want to revisit." },
    rows: [
      { id: "p1", item: "Building recovery target",       prior: "95%",         current: "95%",              delta: "No change",   deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "p2", item: "Planning recovery target",       prior: "30%",         current: "30%",              delta: "No change",   deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "p3", item: "Engineering recovery target",    prior: "50%",         current: "50%",              delta: "No change",   deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "p4", item: "Fire recovery target",           prior: "40%",         current: "40%",              delta: "No change",   deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "p5", item: "Recovery shortfall vs. targets", prior: "$340K",       current: "$420K",            delta: "+$80K",       deltaTone: "warn",    confidence: "High",   status: "needs-review", note: "Targets unchanged but cost rose. Council can hold, raise targets, or accept growing subsidy." },
      { id: "p6", item: "Fee exceptions",                  prior: "4 exceptions", current: "4 exceptions",  delta: "No change",   deltaTone: "neutral", confidence: "High",   status: "auto" },
      { id: "p7", item: "Subsidy policy memo",             prior: "Adopted Jul 2024", current: "Unchanged", delta: "No change",   deltaTone: "neutral", confidence: "High",   status: "auto" },
    ],
    detail: "Targets and exceptions unchanged. Council policy choice: hold targets and accept growing subsidy, or raise targets to keep recovery flat.",
  },

  fees: {
    summary: { autoPct: 99, needsReview: 2, conf: "High", impact: "−8 pts recovery", impactTone: "neg",
      narrative: "Adopted fees are unchanged from FY 2025-26. Because cost rose, blended recovery dropped from 72% to 64% — recovery drift of $420K. This is the highest-impact item in the update." },
    rows: [
      { id: "f1", item: "Blended cost recovery",      prior: "72%",              current: "64%",                  delta: "−8 pts",          deltaTone: "warn", confidence: "High", status: "needs-review", note: "Highest-impact change. Council policy decision: hold fees, raise to full cost, or partial increase." },
      { id: "f2", item: "Recovery drift (vs. prior)", prior: "$0",               current: "$420K",                delta: "+$420K shortfall", deltaTone: "neg",  confidence: "High", status: "needs-review", note: "Annual subsidy increase from holding fees flat against rising cost." },
      { id: "f3", item: "Building recovery",          prior: "91%",              current: "83%",                  delta: "−8 pts",          deltaTone: "warn", confidence: "High", status: "auto" },
      { id: "f4", item: "Planning recovery",          prior: "27%",              current: "24%",                  delta: "−3 pts",          deltaTone: "warn", confidence: "High", status: "auto" },
      { id: "f5", item: "Engineering recovery",       prior: "14%",              current: "—",                    delta: "Pending",          deltaTone: "warn", confidence: "Low",  status: "auto" },
      { id: "f6", item: "Adopted fee schedule",       prior: "Jul 1, 2025",      current: "Jul 1, 2025 (unchanged)", delta: "No change",    deltaTone: "neutral", confidence: "High", status: "auto" },
    ],
    detail: "Council policy decision required. The model can produce a recommended fee schedule at any recovery target.",
  },
};

export const ANNUAL_CHANGES: AnnualChange[] = [
  { id: "c1",  change: "Planning salary & benefits increased 8.5%",
    prior: "$2.31M", current: "$2.51M", impact: "+$180K cost",
    affected: "Planning Review, Conditional Use Permit", confidence: "High",
    action: "Confirm salary mapping", badge: "Confirm" },
  { id: "c2",  change: "Building permit workload decreased 6%",
    prior: "577 permits", current: "542 permits", impact: "+$120K cost / unit",
    affected: "Building Plan Check, Building Inspection", confidence: "Medium",
    action: "Validate workload export", badge: "Needs review" },
  { id: "c3",  change: "City Attorney CAP allocation increased 10%",
    prior: "$180K", current: "$198K", impact: "+$18K across direct services",
    affected: "Planning, Building, Engineering", confidence: "Medium",
    action: "Legal review of recoverability", badge: "Legal review" },
  { id: "c4",  change: "Finance overhead allocation increased 5%",
    prior: "$485K", current: "$509K", impact: "+$24K",
    affected: "All direct service depts", confidence: "High",
    action: "Confirm allocation basis (accounting txns)", badge: "Confirm" },
  { id: "c5",  change: "Adopted fees unchanged since prior study",
    prior: "FY 25-26 schedule", current: "FY 25-26 schedule", impact: "Recovery drift +$420K",
    affected: "All fee items", confidence: "High",
    action: "Consider fee update for FY 26-27", badge: "High impact" },
  { id: "c6",  change: "Building fees unchanged",
    prior: "91% recovery", current: "83% recovery", impact: "−8 pts recovery",
    affected: "Building Plan Check, Inspection", confidence: "High",
    action: "Consider fee update", badge: "High impact" },
  { id: "c7",  change: "Fire inspection fee mapping changed",
    prior: "4 fees mapped", current: "3 fees mapped", impact: "Re-allocate 1 fee",
    affected: "Fire Prevention", confidence: "Low",
    action: "Review fee mapping", badge: "Low confidence" },
  { id: "c8",  change: "Productive hours assumption reused",
    prior: "1,720 hrs/yr", current: "1,720 hrs/yr", impact: "No change",
    affected: "All positions", confidence: "High",
    action: "Reused from baseline", badge: "Confirm" },
  { id: "c9",  change: "Planning Technician title changed",
    prior: "Planning Technician", current: "Planning Specialist", impact: "Mapping update only",
    affected: "3 services", confidence: "High",
    action: "Confirm title remap", badge: "Confirm" },
  { id: "c10", change: "Long-range planning excluded from recoverable base",
    prior: "Excluded", current: "Excluded", impact: "No change",
    affected: "Planning Admin", confidence: "High",
    action: "Reused exclusion", badge: "Confirm" },
  { id: "c11", change: "Encroachment permit volume +12%",
    prior: "151/yr", current: "169/yr", impact: "−$13K cost / unit",
    affected: "Encroachment Permit", confidence: "High",
    action: "Confirm permit system export", badge: "Confirm" },
  { id: "c12", change: "Insurance allocation reused",
    prior: "$400K", current: "$400K", impact: "No change",
    affected: "All direct service depts", confidence: "High",
    action: "Reused from baseline", badge: "Confirm" },
];

export const RECOVERY_DELTAS = {
  priorBlended:   72,
  currentBlended: 64,
  deltaPts:       -8,
};
