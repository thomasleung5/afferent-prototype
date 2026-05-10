// Extended sample data — CAP cost pools, sources, change review, revenue tracking, completeness.
// Anchored to the Town of Los Altos Hills CAP (Sept 4, 2025) and Development Services Fee Study (Mar 30, 2026).

(function(){
  const CITY_EXT = {
    fiscalCurrent:  "FY 2026-27",
    fiscalPrior:    "FY 2025-26",
    fiscalBudget:   "FY 2025-26",
    modelStatus:    "Annual update in review",
    completeness:   91,
  };

  // ---------- Source documents ----------
  const SOURCES = [
    { id:"cap",    name:"Cost Allocation Plan",            short:"CAP Report",
      status:"Uploaded",  date:"Sep 4, 2025",  fiscal:"FY 2024-25 budgeted",
      purpose:"Allocate citywide and departmental overhead to direct service areas.",
      confidence:"High", mappedFields: 22, issues: 1 },
    { id:"fee",    name:"Development Services Fee Study", short:"Fee Study",
      status:"Uploaded",  date:"Mar 30, 2026", fiscal:"FY 2025-26",
      purpose:"Baseline methodology, service categories, hourly rates, recovery targets, fee-level outputs.",
      confidence:"High", mappedFields: 41, issues: 0 },
    { id:"budget", name:"Adopted Budget",                  short:"Budget",
      status:"Referenced",date:"Jul 1, 2025",  fiscal:"FY 2025-26",
      purpose:"Current department and division costs.",
      confidence:"Medium-High", mappedFields: 31, issues: 4 },
    { id:"salary", name:"Salary and Benefits Data",        short:"Salary",
      status:"Referenced",date:"Apr 8, 2026",  fiscal:"FY 2026-27",
      purpose:"Calculate productive hourly rates by position.",
      confidence:"Medium", mappedFields: 73, issues: 6 },
    { id:"workload",name:"Workload Data",                  short:"Workload",
      status:"Referenced",date:"Apr 14, 2026", fiscal:"FY 2025-26",
      purpose:"Permit counts, application counts, inspections, staff time assumptions.",
      confidence:"Medium", mappedFields: 184, issues: 17 },
    { id:"schedule",name:"Current Fee Schedule",           short:"Fee Schedule",
      status:"Referenced",date:"Jul 1, 2025",  fiscal:"FY 2025-26",
      purpose:"Compare current adopted fees to calculated full cost.",
      confidence:"Medium-High", mappedFields: 216, issues: 2 },
  ];

  // ---------- CAP cost pools (CAP Allocation Inventory) ----------
  const CAP_POOLS = [
    { center:"Building Use",                      pool:"Town Hall",                                          amount:122030,  basis:"FY 24/25 budgeted FTE occupying Town Hall",                              receiving:"Multiple departments",        recoverability:"Recoverable where fee-related", source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"Building Use",                      pool:"Parks and Recreation",                               amount: 8608,   basis:"Direct allocation to Parks and Recreation",                              receiving:"Parks and Recreation",        recoverability:"Out of fee scope",              source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"Equipment Use",                     pool:"Vehicle / Equipment Operations",                     amount:37315,   basis:"FY 23/24 vehicle depreciation expense by department",                    receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"City Council",                      pool:"Council / Legislative",                              amount:404077,  basis:"FY 23/24 agenda item count",                                             receiving:"Multiple departments",        recoverability:"Excluded — public benefit",     source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"City Manager",                      pool:"Council / Legislative Support",                      amount:550205,  basis:"FY 23/24 agenda item count",                                             receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Review" },
    { center:"City Manager",                      pool:"Town-wide Operations Mgmt — Including Development",  amount:425015,  basis:"Budgeted expenditures excl. debt, capital, transfers",                   receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"City Manager",                      pool:"Town-wide Operations Mgmt — Excluding Development",  amount:125189,  basis:"Budgeted expenditures excl. Planning, Building, Engineering",            receiving:"Multiple departments",        recoverability:"Excluded — non-development",    source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"City Clerk",                        pool:"Records & Public Information",                       amount:239406,  basis:"FY 23/24 PRA request count",                                             receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"Finance & Administrative Services", pool:"Human Resources",                                    amount:69193,   basis:"FY 24/25 budgeted FTE",                                                  receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"Finance & Administrative Services", pool:"Payroll",                                            amount:78938,   basis:"Payroll transactions",                                                   receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"Finance & Administrative Services", pool:"Town-wide Accounting Support",                       amount:485323,  basis:"Accounting transactions",                                                receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"Finance & Administrative Services", pool:"Contracts & Procurement",                            amount:341090,  basis:"FY 23/24 contract count",                                                receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"City Attorney",                     pool:"Town-wide Support",                                  amount:180000,  basis:"Budgeted expenditures excl. debt, capital, transfers",                   receiving:"Multiple departments",        recoverability:"Legal review recommended",      source:"CAP Allocation Inventory", review:"Review" },
    { center:"Insurance",                         pool:"Town-wide Liability Support",                        amount:400000,  basis:"Budgeted expenditures excl. debt, capital, transfers",                   receiving:"Multiple departments",        recoverability:"Partially recoverable",         source:"CAP Allocation Inventory", review:"Reviewed" },
    { center:"Committees",                        pool:"Boards & Committees",                                amount:239994,  basis:"Number of committees supported",                                          receiving:"Multiple departments",        recoverability:"Excluded — public benefit",     source:"CAP Allocation Inventory", review:"Reviewed" },
  ];

  const CAP_TOTAL = CAP_POOLS.reduce((a,p) => a + p.amount, 0); // ~$3.7M

  // CAP impact on modeled departments (illustrative rollup)
  const CAP_IMPACT = [
    { dept:"Planning",       amount: 420000 },
    { dept:"Building",       amount: 510000 },
    { dept:"Engineering",    amount: 190000 },
    { dept:"Fire Prevention",amount:  85000 },
  ];

  // ---------- Build-model progress ----------
  const BUILD_STEPS = [
    { k:"services", label:"Define services",         done:true  },
    { k:"salary",    label:"Build salary model",      done:true  },
    { k:"operating", label:"Add operating costs",     done:true  },
    { k:"cap",       label:"Build CAP",               done:true  },
    { k:"workload",  label:"Add revenue scaling",     done:true  },
    { k:"costs",     label:"Calculate service costs", done:true  },
    { k:"policy",    label:"Set recovery policy",     done:false },
    { k:"feestudy",  label:"Generate fee schedule",   done:false },
  ];

  // ---------- Annual Update changes ----------
  const ANNUAL_CHANGES = [
    { id:"c1", change:"Planning salary & benefits increased 8.5%",
      prior:"$2.31M", current:"$2.51M", impact:"+$180K cost",
      affected:"Planning Review, Conditional Use Permit", confidence:"High",
      action:"Confirm salary mapping", badge:"Confirm" },
    { id:"c2", change:"Building permit workload decreased 6%",
      prior:"577 permits", current:"542 permits", impact:"+$120K cost / unit",
      affected:"Building Plan Check, Building Inspection", confidence:"Medium",
      action:"Validate workload export", badge:"Needs review" },
    { id:"c3", change:"City Attorney CAP allocation increased 10%",
      prior:"$180K", current:"$198K", impact:"+$18K across direct services",
      affected:"Planning, Building, Engineering", confidence:"Medium",
      action:"Legal review of recoverability", badge:"Legal review" },
    { id:"c4", change:"Finance overhead allocation increased 5%",
      prior:"$485K", current:"$509K", impact:"+$24K",
      affected:"All direct service depts", confidence:"High",
      action:"Confirm allocation basis (accounting txns)", badge:"Confirm" },
    { id:"c5", change:"Adopted fees unchanged since prior study",
      prior:"FY 25-26 schedule", current:"FY 25-26 schedule", impact:"Recovery drift +$420K",
      affected:"All fee items", confidence:"High",
      action:"Consider fee update for FY 26-27", badge:"High impact" },
    { id:"c6", change:"Building fees unchanged",
      prior:"91% recovery", current:"83% recovery", impact:"−8 pts recovery",
      affected:"Building Plan Check, Inspection", confidence:"High",
      action:"Consider fee update", badge:"High impact" },
    { id:"c7", change:"Fire inspection fee mapping changed",
      prior:"4 fees mapped", current:"3 fees mapped", impact:"Re-allocate 1 fee",
      affected:"Fire Prevention", confidence:"Low",
      action:"Review fee mapping", badge:"Low confidence" },
    { id:"c8", change:"Productive hours assumption reused",
      prior:"1,720 hrs/yr", current:"1,720 hrs/yr", impact:"No change",
      affected:"All positions", confidence:"High",
      action:"Reused from baseline", badge:"Confirm" },
    { id:"c9", change:"Planning Technician title changed",
      prior:"Planning Technician", current:"Planning Specialist", impact:"Mapping update only",
      affected:"3 services", confidence:"High",
      action:"Confirm title remap", badge:"Confirm" },
    { id:"c10",change:"Long-range planning excluded from recoverable base",
      prior:"Excluded", current:"Excluded", impact:"No change",
      affected:"Planning Admin", confidence:"High",
      action:"Reused exclusion", badge:"Confirm" },
    { id:"c11",change:"Encroachment permit volume +12%",
      prior:"151/yr", current:"169/yr", impact:"−$13K cost / unit",
      affected:"Encroachment Permit", confidence:"High",
      action:"Confirm permit system export", badge:"Confirm" },
    { id:"c12",change:"Insurance allocation reused",
      prior:"$400K", current:"$400K", impact:"No change",
      affected:"All direct service depts", confidence:"High",
      action:"Reused from baseline", badge:"Confirm" },
  ];

  // ---------- Recovery deltas (annual) ----------
  const RECOVERY_DELTAS = {
    priorBlended:   72,
    currentBlended: 64,
    deltaPts:       -8,
    driftIncrease:  420000,
    drivers: [
      { driver:"Salary & benefits",    impact: 260000, dir:"up" },
      { driver:"Workload decline",     impact: 120000, dir:"up" },
      { driver:"CAP allocation",       impact:  80000, dir:"up" },
      { driver:"Fee schedule updates", impact: -40000, dir:"down" },
    ],
    byDept: [
      { dept:"Planning",   prior: 27, curr: 24, delta: -3, top:"Salary & benefit increase" },
      { dept:"Building",   prior: 91, curr: 83, delta: -8, top:"Workload decline" },
      { dept:"Engineering",prior: null, curr: null, delta: null, top:"Source review required" },
    ],
  };

  // ---------- Revenue tracking ----------
  const REV_TRACKING = [
    { fee:"Design Review",          rec:"$5,200",  adopted:"$5,200",  effective:"Jul 1, 2025",
      expected: 180000, actual: 150000, variance: -30000, note:"Lower application volume" },
    { fee:"Conditional Use Permit", rec:"$6,000",  adopted:"$6,000",  effective:"Jul 1, 2025",
      expected:  60000, actual:  54000, variance:  -6000, note:"Mix of major / minor" },
    { fee:"Building Plan Check",    rec:"$1,086",  adopted:"$1,086",  effective:"Jul 1, 2025",
      expected: 260000, actual: 245000, variance: -15000, note:"Valuation mix changed" },
    { fee:"Building Inspection",    rec:"$362",    adopted:"$362",    effective:"Jul 1, 2025",
      expected: 220000, actual: 198000, variance: -22000, note:"Fewer reinspections" },
    { fee:"Encroachment Permit",    rec:"$898",    adopted:"$898",    effective:"Jul 1, 2025",
      expected:  75000, actual:  88000, variance:  13000, note:"Higher permit count" },
    { fee:"Fire Inspection",        rec:"$540",    adopted:"$540",    effective:"Jul 1, 2025",
      expected:  42000, actual:  39000, variance:  -3000, note:"Slightly under projection" },
  ];
  const REV_SUMMARY = {
    expected: 1800000, actual: 1540000, variance: -260000,
    onTrackPct: 71, primary:"Lower permit volume",
  };

  // ---------- Salary positions (full list) ----------
  const POSITIONS = [
    { title:"Planning Director",         dept:"PLAN", fte: 0.35, salary: 312000, benefits: 110000, hours: 1720 },
    { title:"Senior Planner",            dept:"PLAN", fte: 1.00, salary: 214000, benefits:  78000, hours: 1720 },
    { title:"Associate Planner",         dept:"PLAN", fte: 1.00, salary: 178000, benefits:  64000, hours: 1720 },
    { title:"Planning Technician",       dept:"PLAN", fte: 0.50, salary:  98000, benefits:  35000, hours: 1720, flag:"title-changed" },
    { title:"Building Official",         dept:"BLDG", fte: 0.75, salary: 286000, benefits: 102000, hours: 1720 },
    { title:"Plans Examiner",            dept:"BLDG", fte: 1.00, salary: 238000, benefits:  85000, hours: 1720 },
    { title:"Building Inspector",        dept:"BLDG", fte: 1.00, salary: 198000, benefits:  72000, hours: 1720 },
    { title:"Permit Technician",         dept:"BLDG", fte: 1.00, salary: 132000, benefits:  48000, hours: 1720 },
    { title:"City Engineer",             dept:"ENG",  fte: 0.30, salary: 298000, benefits: 106000, hours: 1720 },
    { title:"Senior / Associate Engineer", dept:"ENG", fte: 1.00, salary: 204000, benefits: 73000, hours: 1720 },
    { title:"Public Works Inspector",    dept:"ENG",  fte: 0.60, salary: 168000, benefits:  60000, hours: 1720 },
    { title:"Fire Marshal",              dept:"FIRE", fte: 0.20, salary: 234000, benefits:  84000, hours: 1720, flag:"missing-hours" },
  ];

  // Workload sample
  const WORKLOAD = [
    { svc:"Design Review",          unit:"Application",  current: 30,  prior: 28,  source:"Permit system",     status:"Validated" },
    { svc:"Conditional Use Permit", unit:"Application",  current: 4,   prior: 4,   source:"Permit system",     status:"Validated" },
    { svc:"Zoning Clearance",       unit:"Clearance",    current: 46,  prior: 44,  source:"Permit system",     status:"Validated" },
    { svc:"Building Plan Check",    unit:"Plan check",   current:110,  prior:117,  source:"Permit system",     status:"Imported" },
    { svc:"Building Inspection",    unit:"Inspection",   current:432,  prior:455,  source:"Permit system",     status:"Imported" },
    { svc:"Encroachment Permit",    unit:"Permit",       current:169,  prior:151,  source:"Permit system",     status:"Validated" },
    { svc:"Fire Plan Review",       unit:"Plan",         current: 38,  prior: 35,  source:"Prior study",       status:"Reused" },
    { svc:"Erosion Inspections",    unit:"Inspection",   current:157,  prior:160,  source:"Permit system",     status:"Validated" },
    { svc:"Sewer Review",           unit:"Review",       current: null,prior: 22,  source:"—",                 status:"Missing" },
  ];

  // ---------- Department totals (Tables 2/4/7 from Fee Study) ----------
  const DEPT_DETAIL = [
    { dept:"Planning",    totalCost: 2384243, eligibleCost: 1381738, currentRev:  341000, fullRev: 1300000, recovery: 27, fbhr: 301, status:"Review policy targets" },
    { dept:"Building",    totalCost: 1495525, eligibleCost: 1443810, currentRev: 1047781, fullRev: 1528906, recovery: 69, fbhr: 362, status:"Review fee tables" },
    { dept:"Engineering", totalCost: 1068037, eligibleCost:  585766, currentRev:   92960, fullRev:  641379, recovery: 14, fbhr: 359, status:"Source review required" },
  ];

  // ---------- Operating costs (department-direct non-labor) ----------
  // These are budgeted department expenses other than salaries/benefits — software,
  // training, supplies, contracts, vehicles, etc. They flow straight into FBHR as
  // department $/hr, separate from CAP (which is citywide indirect).
  //
  // Each entry is one budget line. `include: false` greys the row out of the rate
  // calc but keeps it visible for audit. `dept` is "PLAN" | "BLDG" | "ENG" |
  // "SHARED:CDS" — the latter splits across all three Community Development
  // Services depts proportional to productive hours.
  const OPERATING_COSTS = [
    // Planning
    { id:"OP-PL-01", code:"011-2410", dept:"PLAN", category:"Software & subscriptions", line:"Planning permit system (share)",  amount:  18400, source:"FY25 Budget · 011-2410-5210", include:true },
    { id:"OP-PL-02", code:"011-2410", dept:"PLAN", category:"Professional services",    line:"On-call planning consultants",     amount:  42000, source:"FY25 Budget · 011-2410-5310", include:true },
    { id:"OP-PL-03", code:"011-2410", dept:"PLAN", category:"Training & travel",        line:"APA conference, CEUs",             amount:   6800, source:"FY25 Budget · 011-2410-5410", include:true },
    { id:"OP-PL-04", code:"011-2410", dept:"PLAN", category:"Office & supplies",        line:"Office supplies, printing, postage", amount: 4200, source:"FY25 Budget · 011-2410-5510", include:true },
    { id:"OP-PL-05", code:"011-2410", dept:"PLAN", category:"Memberships & dues",       line:"AICP, APA, ABAG dues",             amount:   3100, source:"FY25 Budget · 011-2410-5610", include:true },
    { id:"OP-PL-06", code:"011-2410", dept:"PLAN", category:"Legal noticing",           line:"Public hearing notices",           amount:   8500, source:"FY25 Budget · 011-2410-5620", include:false, excludeReason:"Reimbursed by applicant — not in $/hr" },

    // Building
    { id:"OP-BD-01", code:"011-2420", dept:"BLDG", category:"Software & subscriptions", line:"Permit system + ICC code books",   amount:  21600, source:"FY25 Budget · 011-2420-5210", include:true },
    { id:"OP-BD-02", code:"011-2420", dept:"BLDG", category:"Professional services",    line:"3rd-party plan check overflow",    amount:  78000, source:"FY25 Budget · 011-2420-5310", include:true },
    { id:"OP-BD-03", code:"011-2420", dept:"BLDG", category:"Vehicles & equipment",     line:"Inspector vehicle O&M",            amount:  14200, source:"FY25 Budget · 011-2420-5710", include:true },
    { id:"OP-BD-04", code:"011-2420", dept:"BLDG", category:"Training & travel",        line:"ICC certs, CALBO conference",      amount:   8400, source:"FY25 Budget · 011-2420-5410", include:true },
    { id:"OP-BD-05", code:"011-2420", dept:"BLDG", category:"Office & supplies",        line:"Inspection forms, field supplies", amount:   5300, source:"FY25 Budget · 011-2420-5510", include:true },
    { id:"OP-BD-06", code:"011-2420", dept:"BLDG", category:"Memberships & dues",       line:"ICC, CALBO memberships",           amount:   2400, source:"FY25 Budget · 011-2420-5610", include:true },

    // Engineering
    { id:"OP-EN-01", code:"011-3100", dept:"ENG",  category:"Software & subscriptions", line:"GIS, AutoCAD, Bluebeam",           amount:  16800, source:"FY25 Budget · 011-3100-5210", include:true },
    { id:"OP-EN-02", code:"011-3100", dept:"ENG",  category:"Professional services",    line:"On-call traffic + civil review",   amount:  54000, source:"FY25 Budget · 011-3100-5310", include:true },
    { id:"OP-EN-03", code:"011-3100", dept:"ENG",  category:"Vehicles & equipment",     line:"PW inspector vehicle, survey gear", amount:  11600, source:"FY25 Budget · 011-3100-5710", include:true },
    { id:"OP-EN-04", code:"011-3100", dept:"ENG",  category:"Training & travel",        line:"PE renewals, APWA",                amount:   4200, source:"FY25 Budget · 011-3100-5410", include:true },
    { id:"OP-EN-05", code:"011-3100", dept:"ENG",  category:"Office & supplies",        line:"Plotter, drafting supplies",       amount:   3100, source:"FY25 Budget · 011-3100-5510", include:true },
    { id:"OP-EN-06", code:"011-3100", dept:"ENG",  category:"Capital outlay",           line:"Vehicle replacement reserve",       amount:  18000, source:"FY25 Budget · 011-3100-5810", include:false, excludeReason:"One-time capital — excluded by policy" },

    // Shared (CDS-wide — split across PLAN/BLDG/ENG by productive hours)
    { id:"OP-SH-01", code:"011-2400", dept:"SHARED:CDS", category:"Software & subscriptions", line:"Citywide permit/agenda system", amount: 32400, source:"FY25 Budget · 011-2400-5210", include:true },
    { id:"OP-SH-02", code:"011-2400", dept:"SHARED:CDS", category:"Office & supplies",        line:"Front-counter & printing",     amount:  6800, source:"FY25 Budget · 011-2400-5510", include:true },
  ];

  // ---------- Role-rate definitions ----------
  // Used when a service is priced as a mix of roles rather than a single
  // department blended rate. Each role's $/hr is computed from POSITIONS
  // (salary+benefits ÷ productive hours) plus the dept's CAP $/hr and Operating
  // $/hr — i.e. roles inherit indirect costs from their parent dept.
  // The role list below is the canonical set surfaced in the Services screen.
  const ROLES = [
    { id:"role-pdir",  title:"Planning Director",      dept:"PLAN", positionTitle:"Planning Director" },
    { id:"role-srpln", title:"Senior Planner",         dept:"PLAN", positionTitle:"Senior Planner" },
    { id:"role-aspln", title:"Associate Planner",      dept:"PLAN", positionTitle:"Associate Planner" },
    { id:"role-pltch", title:"Planning Technician",    dept:"PLAN", positionTitle:"Planning Technician" },
    { id:"role-bofcl", title:"Building Official",      dept:"BLDG", positionTitle:"Building Official" },
    { id:"role-plnex", title:"Plans Examiner",         dept:"BLDG", positionTitle:"Plans Examiner" },
    { id:"role-binsp", title:"Building Inspector",     dept:"BLDG", positionTitle:"Building Inspector" },
    { id:"role-pmttc", line:"Permit Technician",       title:"Permit Technician", dept:"BLDG", positionTitle:"Permit Technician" },
    { id:"role-ceng",  title:"City Engineer",          dept:"ENG",  positionTitle:"City Engineer" },
    { id:"role-sreng", title:"Sr / Assoc Engineer",    dept:"ENG",  positionTitle:"Senior / Associate Engineer" },
    { id:"role-pwins", title:"Public Works Inspector", dept:"ENG",  positionTitle:"Public Works Inspector" },
  ];

  window.AFFERENT_EXT = {
    CITY_EXT, SOURCES, CAP_POOLS, CAP_TOTAL, CAP_IMPACT,
    BUILD_STEPS, ANNUAL_CHANGES, RECOVERY_DELTAS, REV_TRACKING, REV_SUMMARY,
    POSITIONS, WORKLOAD, DEPT_DETAIL,
    OPERATING_COSTS, ROLES,
  };
})();
