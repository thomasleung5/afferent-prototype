// Afferent — aligned with Town of Los Altos Hills FY25–26 Development Services Fee Study
// Source: NBS final draft report, March 30, 2026. Tables 2, 4, 7; Appendices A.1–A.3.

const CITY = {
  name: "Town of Los Altos Hills",
  fiscal: "FY 2025–26",
  preparedBy: "Finance Department · NBS Consulting",
  peers: ["Atherton", "Portola Valley", "Woodside", "Hillsborough", "Monte Sereno"],
};

const DEPTS = {
  PLAN: { code: "PLAN", name: "Planning Administration", fbhr: 301 },
  BLDG: { code: "BLDG", name: "Building Administration",  fbhr: 362 },
  ENG:  { code: "ENG",  name: "Engineering Administration", fbhr: 359 },
};

// Real fee lines from Appendices A.1, A.2, A.3. Fee = current adopted fee.
// Cost = NBS-calculated full cost of service. Volume = NBS estimated annual volume.
// "peer" fields are illustrative peer medians used for benchmarking UI.
const SERVICES = [
  // ---------- Planning (FBHR $301) ----------
  { id:"plan-sdh",   name:"Site Development Hearing Review",                dept:"PLAN", volume: 19, hours: 51,  cost: 15369, fee: 4160, peer: 13800, target: 100 },
  { id:"plan-fth",   name:"Site Development — Fast Track Hearing",          dept:"PLAN", volume: 17, hours: 61,  cost: 18383, fee: 4880, peer: 16500, target: 100 },
  { id:"plan-minor", name:"Site Development — Minor Admin Review",          dept:"PLAN", volume: 8,  hours: 31,  cost:  9342, fee: 1560, peer:  8200, target: 100 },
  { id:"plan-major", name:"Site Development — Major Admin Review",          dept:"PLAN", volume: 3,  hours: 36,  cost: 10849, fee: 3010, peer:  9600, target: 100 },
  { id:"plan-pch",   name:"Site Development — Planning Commission Hearing", dept:"PLAN", volume: 3,  hours: 71,  cost: 21396, fee: 7125, peer: 19200, target: 100 },
  { id:"plan-cup",   name:"Conditional Use Permit — Additional/Hearing",    dept:"PLAN", volume: 2,  hours: 81,  cost: 24410, fee: 6000, peer: 21500, target: 100 },
  { id:"plan-cup2",  name:"CUP Renewal / Amendment — Additional/Hearing",   dept:"PLAN", volume: 2,  hours: 81,  cost: 24410, fee: 6000, peer: 21500, target: 100 },
  { id:"plan-cdp",   name:"Conditional Development Permit",                 dept:"PLAN", volume: 2,  hours: 19,  cost:  5726, fee: 2180, peer:  5100, target: 100 },
  { id:"plan-fence", name:"Fence Permit — Administrative",                  dept:"PLAN", volume: 30, hours:  5,  cost:  1507, fee:  520, peer:  1350, target: 100 },
  { id:"plan-oak",   name:"Oak Tree Removal",                               dept:"PLAN", volume: 32, hours:  3,  cost:   904, fee:  250, peer:   780, target: 100 },
  { id:"plan-preap", name:"Pre-Application — Formal Meeting",               dept:"PLAN", volume: 46, hours:  2,  cost:   603, fee:  520, peer:   560, target: 100 },
  { id:"plan-adu",   name:"Pre-Application — ADU Formal Meeting",           dept:"PLAN", volume: 21, hours:  2,  cost:   603, fee:  410, peer:   560, target: 100 },
  { id:"plan-mod",   name:"Permit Modification",                            dept:"PLAN", volume: 4,  hours:  9,  cost:  2712, fee: 1450, peer:  2450, target: 100 },
  { id:"plan-wlss",  name:"Wireless Facility Modification — Admin",         dept:"PLAN", volume: 3,  hours:  6,  cost:  1808, fee: 2180, peer:  1720, target: 100 },
  { id:"plan-mvar",  name:"Minor Variance — Planning Commission",           dept:"PLAN", volume: 4,  hours: 19,  cost:  5726, fee: 5200, peer:  5250, target: 100 },
  { id:"plan-site",  name:"Site Analysis — Minimum Processing",             dept:"PLAN", volume: 6,  hours:  2,  cost:   603, fee:  260, peer:   560, target: 100 },

  // ---------- Building (FBHR $362) ----------
  { id:"bldg-apr",   name:"Additional Plan Review — Minimum Processing",    dept:"BLDG", volume: 144, hours: 1.5, cost:   543, fee:  350, peer:   510, target: 100 },
  { id:"bldg-ext",   name:"Extension of Building Permit",                   dept:"BLDG", volume: 59,  hours: 1,   cost:   362, fee:  180, peer:   340, target: 100 },
  { id:"bldg-tco",   name:"Temporary Certificate of Occupancy",             dept:"BLDG", volume: 10,  hours: 1,   cost:   362, fee:  500, peer:   345, target: 100 },
  { id:"bldg-pc",    name:"Plan Check Administrative Fee (new)",            dept:"BLDG", volume: 110, hours: 3,   cost:  1086, fee:  280, peer:   970, target: 100 },
  { id:"bldg-sfr",   name:"Building Permit — New SFR (tiered, typ. $1.5M)", dept:"BLDG", volume: 28,  hours: 42,  cost: 15204, fee:13500, peer: 13800, target: 100 },
  { id:"bldg-rem",   name:"Building Permit — Major Remodel",                dept:"BLDG", volume: 64,  hours: 15,  cost:  5430, fee: 4100, peer:  5100, target: 100 },
  { id:"bldg-pool",  name:"Swimming Pool / Spa Permit (new)",               dept:"BLDG", volume: 18,  hours:  9,  cost:  3258, fee: 1900, peer:  3050, target: 100 },
  { id:"bldg-solar", name:"Residential Solar / PV Permit",                  dept:"BLDG", volume: 62,  hours:  1,  cost:   362, fee:  450, peer:   400, target:  80 }, // capped per CA Gov Code 66015
  { id:"bldg-mep",   name:"Stand-Alone MEP Permit",                         dept:"BLDG", volume: 82,  hours:  2,  cost:   724, fee:  320, peer:   680, target: 100 },

  // ---------- Engineering (FBHR $359) ----------
  { id:"eng-bldg",   name:"Engineering Review of Building Permits",         dept:"ENG",  volume: 127, hours: 4.25,cost:  1527, fee:    0, peer:  1400, target: 100 },
  { id:"eng-adu",    name:"Engineering Review — ADU / SB9",                 dept:"ENG",  volume: 30,  hours: 4.25,cost:  1527, fee:    0, peer:  1400, target: 100 },
  { id:"eng-erosion",name:"Erosion Control Inspections",                    dept:"ENG",  volume: 157, hours: 2,   cost:   719, fee:  210, peer:   640, target: 100 },
  { id:"eng-ency",   name:"Encroachment Permit — Application Fee",          dept:"ENG",  volume: 169, hours: 2.5, cost:   898, fee:  326, peer:   820, target: 100 },
  { id:"eng-minor",  name:"Site Development — Minor Engineering Review",    dept:"ENG",  volume: 50,  hours: 5,   cost:  1796, fee:    0, peer:  1620, target: 100 },
  { id:"eng-major",  name:"Site Development — Major Engineering Review",    dept:"ENG",  volume: 11,  hours: 10,  cost:  3593, fee:    0, peer:  3220, target: 100 },
  { id:"eng-hourly", name:"Engineering Blended Hourly Rate",                dept:"ENG",  volume: 21,  hours: 1,   cost:   359, fee:  228, peer:   310, target: 100 },
];

// Department rollups from Tables 2, 4, 7 (narrative report)
const DEPT_ROLLUPS = {
  PLAN: { totalCost: 2384243, eligibleCost: 1381738, currentRev: 341000, fullRev: 1300000, recovery: 27 },
  BLDG: { totalCost: 1495525, eligibleCost: 1443810, currentRev: 1047781, fullRev: 1528906, recovery: 69 },
  ENG:  { totalCost: 1068037, eligibleCost:  585766, currentRev:   92960, fullRev:  641379, recovery: 14 },
};

// Citywide totals (from Table 1 / Executive Summary)
const CITYWIDE = {
  eligibleCost: 3411314,       // ~$3.4M
  currentRevenue: 1481741,     // ~$1.5M
  fullCostRevenue: 3470285,    // potential at 100%
  gap: 1988544,                // ~$2.0M (report: ~$2M additional)
  recovery: 43.4,              // report: ~43%
};

// Enrichment
const enriched = SERVICES.map(s => {
  const recovery = s.cost > 0 ? (s.fee / s.cost) * 100 : 0;
  const gap = (s.cost - s.fee) * s.volume;
  return { ...s, recovery, gap };
});
enriched.sort((a,b) => b.gap - a.gap);

// Cost breakdown derived from real FBHR split (report table structure)
function costBreakdown(s) {
  const dept = DEPTS[s.dept];
  // Approx split from report tables: labor 33%, non-labor 25%, townwide overhead 25%, common activities 17%
  const labor     = s.cost * 0.33;
  const nonLabor  = s.cost * 0.25;
  const overhead  = s.cost * 0.25;
  const common    = s.cost * 0.17;
  return [
    { label:"Direct labor",             value: labor,    note:`${s.hours} hrs @ $${dept.fbhr}/hr fully-burdened` },
    { label:"Recurring non-labor",       value: nonLabor, note:"Contractor costs, third-party charges, materials" },
    { label:"Townwide overhead",         value: overhead, note:"Town Manager, Finance, HR — per Cost Allocation Plan" },
    { label:"Allocated common activities", value: common, note:"Division supervision, administration, support" },
  ];
}

function staffMix(s) {
  const fbhr = DEPTS[s.dept].fbhr;
  if (s.dept === "BLDG") return [
    { role:"Building Official",        rate: 405, hrs: s.hours * 0.15 },
    { role:"Plans Examiner / Plan Check", rate: 370, hrs: s.hours * 0.45 },
    { role:"Building Inspector",       rate: 345, hrs: s.hours * 0.30 },
    { role:"Permit Technician",        rate: 235, hrs: s.hours * 0.10 },
  ];
  if (s.dept === "PLAN") return [
    { role:"Planning Director",        rate: 340, hrs: s.hours * 0.10 },
    { role:"Senior Planner",            rate: 310, hrs: s.hours * 0.55 },
    { role:"Associate Planner",         rate: 275, hrs: s.hours * 0.25 },
    { role:"Administrative Support",    rate: 210, hrs: s.hours * 0.10 },
  ];
  return [
    { role:"Public Works Director / City Engineer", rate: 395, hrs: s.hours * 0.10 },
    { role:"Senior / Associate Engineer",           rate: 365, hrs: s.hours * 0.55 },
    { role:"Public Works Inspector",                rate: 335, hrs: s.hours * 0.25 },
    { role:"Administrative Support",                rate: 215, hrs: s.hours * 0.10 },
  ];
}

function peerComparison(s) {
  const m = s.peer;
  const jitter = [0.78, 0.91, 1.00, 1.08, 1.22];
  return CITY.peers.map((p, i) => ({
    city: p,
    fee: Math.max(0, Math.round(m * jitter[i] / 10) * 10),
  }));
}

function narrativeFor(s) {
  const recPct = Math.round(s.recovery);
  const peerDelta = (s.peer || 0) - s.fee;
  const lift = Math.round((s.cost - s.fee) * s.volume / 1000);
  const deptName = DEPTS[s.dept].name;
  return (
`Based on the ${CITY.fiscal} Development Services Fee Study prepared by NBS, the current ${s.name.toLowerCase()} fee of $${s.fee.toLocaleString()} recovers approximately ${recPct}% of the fully-burdened cost of providing this service ($${s.cost.toLocaleString()}). The full cost is based on an estimated ${s.hours} hours of staff time applied at the ${deptName}'s fully-burdened hourly rate of $${DEPTS[s.dept].fbhr}.

A comparative fee survey of five neighboring jurisdictions — ${CITY.peers.slice(0,3).join(", ")}, and others — indicates a median fee of $${(s.peer||0).toLocaleString()} for the same or substantially similar service, ${peerDelta > 0 ? `$${peerDelta.toLocaleString()} above` : `$${Math.abs(peerDelta).toLocaleString()} below`} the Town's current rate.

Staff recommends adopting the fee at 100% of the full cost of service, consistent with the Town Council's cost-recovery policy and California Constitution Article XIII C § 1(e). At current service volumes of ${s.volume.toLocaleString()} per year, this adjustment would recover approximately $${lift.toLocaleString()}K in costs currently absorbed by the General Fund.`
  );
}

window.AFFERENT_DATA = {
  CITY, DEPTS, SERVICES: enriched, DEPT_ROLLUPS, CITYWIDE,
  TOTAL_GAP: CITYWIDE.gap,
  AVG_RECOVERY: CITYWIDE.recovery,
  costBreakdown, staffMix, peerComparison, narrativeFor,
};
