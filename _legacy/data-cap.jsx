// data-cap.jsx — NBS-style Cost Allocation Plan seed data
//
// Anchored to the Town of Los Altos Hills CAP (Sept 4, 2025).
// CAP scope: ONLY allocate indirect cost centers to all departments.
// No recoverability, no fee logic, no public-vs-private-benefit.
//
// Schema:
//   CENTER  { id, name, totalCost, kind:"indirect" }
//   POOL    { id, centerId, name, amount, basis, explanation }
//   BASIS   { id, label, unit, description }
//   DEPT    { id, name, kind:"direct"|"indirect" }
//   DRIVERS { [deptId]: { [basisId]: number } }

(function(){
  // ---------- Departments ----------
  // INDIRECT departments are themselves cost centers.
  // DIRECT departments receive final allocated cost.
  // The step-down engine processes indirect depts in array order: each pool
  // starts on its home indirect dept, then when that dept is closed its
  // current balance is pushed to all departments BELOW it in the order using
  // each pool's own basis. Order here = step-down sequence (editable in UI).
  const DEPARTMENTS = [
    // Indirect (central service providers)
    { id:"BLDG_USE",  name:"Building Use",                       kind:"indirect" },
    { id:"EQUIP_USE", name:"Equipment Use",                      kind:"indirect" },
    { id:"COUNCIL",   name:"City Council",                       kind:"indirect" },
    { id:"CITYMGR",   name:"City Manager",                       kind:"indirect" },
    { id:"CLERK",     name:"City Clerk",                         kind:"indirect" },
    { id:"FINANCE",   name:"Finance & Administrative Services",  kind:"indirect" },
    { id:"ATTY",      name:"City Attorney",                      kind:"indirect" },
    { id:"INSUR",     name:"Insurance",                          kind:"indirect" },
    { id:"COMMITS",   name:"Committees",                         kind:"indirect" },

    // Direct (fee-modeled service departments)
    { id:"PLAN",      name:"Planning",                           kind:"direct"   },
    { id:"BLDG",      name:"Building",                           kind:"direct"   },
    { id:"ENG",       name:"Engineering",                        kind:"direct"   },
    { id:"PW",        name:"Public Works",                       kind:"direct"   },
    { id:"PARKS",     name:"Parks & Recreation",                 kind:"direct"   },
    { id:"PD",        name:"Police Services",                    kind:"direct"   },
    { id:"FIRE",      name:"Fire Prevention",                    kind:"direct"   },
  ];

  // ---------- Allocation bases ----------
  const BASES = [
    { id:"FTE",      label:"Budgeted FTE",            unit:"fte",      description:"Full-time equivalent staff in each department." },
    { id:"EXPEND",   label:"Budgeted expenditures",   unit:"$",        description:"Departmental budget excluding debt service, capital outlay, and inter-fund transfers." },
    { id:"EXPEND_X", label:"Budgeted expend. excl. dev",unit:"$",      description:"Budgeted expenditures with development services (Planning, Building, Engineering) excluded." },
    { id:"PAYROLL",  label:"Payroll transactions",    unit:"txns",     description:"Number of payroll line items processed in the prior fiscal year." },
    { id:"ACCT",     label:"Accounting transactions", unit:"txns",     description:"Number of A/P, A/R, journal entries processed in the prior fiscal year." },
    { id:"AGENDA",   label:"Agenda items",            unit:"items",    description:"Items presented to City Council in the prior fiscal year, by sponsoring department." },
    { id:"PRA",      label:"Public Records requests", unit:"requests", description:"PRA requests routed to each department in the prior fiscal year." },
    { id:"CONTRACT", label:"Contracts & POs",         unit:"contracts",description:"Contracts and purchase orders processed in the prior fiscal year." },
    { id:"SQFT",     label:"Square footage",          unit:"sf",       description:"Town Hall square footage occupied by each department." },
    { id:"VEHICLE",  label:"Vehicle depreciation",    unit:"$",        description:"Vehicle/equipment depreciation expense by department, prior fiscal year." },
    { id:"COMMITS",  label:"Committees supported",    unit:"committees",description:"Committees and boards staffed by each department." },
    { id:"DIRECT",   label:"Direct charge",           unit:"—",        description:"Pool is charged 100% to a single named department." },
  ];

  // ---------- Cost centers ----------
  // Each center has a total allocable cost, broken into pools below.
  const CENTERS = [
    { id:"BLDG_USE",  code:"061-1480", name:"Building Use",                       fy:"FY 24-25 budget" },
    { id:"EQUIP_USE", code:"061-4400", name:"Equipment Use",                      fy:"FY 23-24 actual" },
    { id:"COUNCIL",   code:"011-1100", name:"City Council",                       fy:"FY 24-25 budget" },
    { id:"CITYMGR",   code:"011-1200", name:"City Manager",                       fy:"FY 24-25 budget" },
    { id:"CLERK",     code:"011-1300", name:"City Clerk",                         fy:"FY 24-25 budget" },
    { id:"FINANCE",   code:"011-1400", name:"Finance & Administrative Services",  fy:"FY 24-25 budget" },
    { id:"ATTY",      code:"011-1500", name:"City Attorney",                      fy:"FY 24-25 budget" },
    { id:"INSUR",     code:"011-1510", name:"Insurance",                          fy:"FY 24-25 budget" },
    { id:"COMMITS",   code:"011-1700", name:"Committees",                         fy:"FY 24-25 budget" },
  ];

  // ---------- Cost pools ----------
  // Each pool MUST have exactly one allocation basis. Mixed bases not allowed.
  // direct-charge pools target a single department via `directTo`.
  const POOLS = [
    // Building Use
    { id:"P01", centerId:"BLDG_USE",  name:"Town Hall",                                amount:122030, basis:"SQFT",     explanation:"Square footage of Town Hall occupied by each department, per facilities inventory." },
    { id:"P02", centerId:"BLDG_USE",  name:"Parks & Recreation building",              amount:  8608, basis:"DIRECT",   directTo:"PARKS", explanation:"Direct charge to Parks & Recreation; the building is exclusively used by that department." },

    // Equipment Use
    { id:"P03", centerId:"EQUIP_USE", name:"Vehicle / Equipment Operations",           amount: 37315, basis:"VEHICLE",  explanation:"FY 23/24 vehicle depreciation expense by department." },

    // City Council
    { id:"P04", centerId:"COUNCIL",   name:"Council legislative time",                 amount:404077, basis:"AGENDA",   explanation:"FY 23/24 agenda item count by sponsoring department." },

    // City Manager
    { id:"P05", centerId:"CITYMGR",   name:"Legislative support",                      amount:550205, basis:"AGENDA",   explanation:"Mirrors City Council basis — same agenda item count drives staff support time." },
    { id:"P06", centerId:"CITYMGR",   name:"Operations Mgmt — including development",  amount:425015, basis:"EXPEND",   explanation:"Budgeted expenditures excluding debt, capital outlay, and transfers; covers town-wide oversight." },
    { id:"P07", centerId:"CITYMGR",   name:"Operations Mgmt — excluding development",  amount:125189, basis:"EXPEND_X", explanation:"Budgeted expenditures with Planning, Building, and Engineering excluded; isolates non-development management." },

    // City Clerk
    { id:"P08", centerId:"CLERK",     name:"Records & Public Records Act",             amount:239406, basis:"PRA",      explanation:"FY 23/24 Public Records Act request count by department." },

    // Finance & Administrative Services
    { id:"P09", centerId:"FINANCE",   name:"Human Resources",                          amount: 69193, basis:"FTE",      explanation:"Budgeted FTE per department drives HR support load." },
    { id:"P10", centerId:"FINANCE",   name:"Payroll",                                  amount: 78938, basis:"PAYROLL",  explanation:"Payroll transaction count per department." },
    { id:"P11", centerId:"FINANCE",   name:"Town-wide accounting support",             amount:485323, basis:"ACCT",     explanation:"Accounting transaction count per department." },
    { id:"P12", centerId:"FINANCE",   name:"Contracts & procurement",                  amount:341090, basis:"CONTRACT", explanation:"Contract and purchase order count per department." },

    // City Attorney
    { id:"P13", centerId:"ATTY",      name:"Town-wide legal support",                  amount:180000, basis:"EXPEND",   explanation:"Budgeted expenditures (excl. debt/capital/transfers) as a proxy for legal support demand." },

    // Insurance
    { id:"P14", centerId:"INSUR",     name:"Town-wide liability support",              amount:400000, basis:"EXPEND",   explanation:"Budgeted expenditures as a proxy for relative risk exposure." },

    // Committees
    { id:"P15", centerId:"COMMITS",   name:"Boards & committees support",              amount:239994, basis:"COMMITS",  explanation:"Number of committees staffed by each department." },
  ];

  // ---------- Driver values per department ----------
  // Realistic sample data. All values are editable in the UI.
  const DRIVERS = {
    // Indirect departments
    BLDG_USE:  { FTE: 0,    EXPEND:       0, EXPEND_X:       0, PAYROLL:   0, ACCT:    0, AGENDA:  0, PRA:  0, CONTRACT:   0, SQFT: 1200, VEHICLE:     0, COMMITS: 0 },
    EQUIP_USE: { FTE: 0,    EXPEND:       0, EXPEND_X:       0, PAYROLL:   0, ACCT:    0, AGENDA:  0, PRA:  0, CONTRACT:   0, SQFT:    0, VEHICLE:     0, COMMITS: 0 },
    COUNCIL:   { FTE: 0,    EXPEND:  154000, EXPEND_X:  154000, PAYROLL:   0, ACCT:    0, AGENDA:  0, PRA:  0, CONTRACT:   0, SQFT:    0, VEHICLE:     0, COMMITS: 0 },
    CITYMGR:   { FTE: 2.0,  EXPEND:  680000, EXPEND_X:  680000, PAYROLL:  85, ACCT:  120, AGENDA: 22, PRA: 18, CONTRACT:  44, SQFT:  680, VEHICLE:     0, COMMITS: 0 },
    CLERK:     { FTE: 1.0,  EXPEND:  295000, EXPEND_X:  295000, PAYROLL:  41, ACCT:   62, AGENDA:  6, PRA:  4, CONTRACT:  18, SQFT:  320, VEHICLE:     0, COMMITS: 0 },
    FINANCE:   { FTE: 3.0,  EXPEND:  920000, EXPEND_X:  920000, PAYROLL: 110, ACCT:  280, AGENDA: 14, PRA:  8, CONTRACT:  62, SQFT:  580, VEHICLE:     0, COMMITS: 0 },
    ATTY:      { FTE: 0,    EXPEND:  180000, EXPEND_X:  180000, PAYROLL:   0, ACCT:    0, AGENDA: 12, PRA:  3, CONTRACT:   8, SQFT:  140, VEHICLE:     0, COMMITS: 0 },
    INSUR:     { FTE: 0,    EXPEND:       0, EXPEND_X:       0, PAYROLL:   0, ACCT:    0, AGENDA:  0, PRA:  0, CONTRACT:   0, SQFT:    0, VEHICLE:     0, COMMITS: 0 },
    COMMITS:   { FTE: 0,    EXPEND:  239994, EXPEND_X:  239994, PAYROLL:   0, ACCT:    0, AGENDA: 18, PRA:  0, CONTRACT:   0, SQFT:    0, VEHICLE:     0, COMMITS: 0 },

    // Direct departments
    PLAN:      { FTE: 2.85, EXPEND: 2384243, EXPEND_X:       0, PAYROLL:  72, ACCT:  185, AGENDA: 38, PRA: 24, CONTRACT:  41, SQFT: 1850, VEHICLE:  4200, COMMITS: 4 },
    BLDG:      { FTE: 3.75, EXPEND: 1495525, EXPEND_X:       0, PAYROLL:  92, ACCT:  220, AGENDA: 16, PRA: 19, CONTRACT:  28, SQFT: 2100, VEHICLE:  6800, COMMITS: 1 },
    ENG:       { FTE: 1.90, EXPEND: 1068037, EXPEND_X:       0, PAYROLL:  48, ACCT:  140, AGENDA: 24, PRA: 12, CONTRACT:  35, SQFT: 1300, VEHICLE: 11200, COMMITS: 2 },
    PW:        { FTE: 4.20, EXPEND:  890000, EXPEND_X:  890000, PAYROLL: 105, ACCT:  155, AGENDA:  9, PRA:  6, CONTRACT:  44, SQFT:  920, VEHICLE: 12400, COMMITS: 1 },
    PARKS:     { FTE: 1.50, EXPEND:  340000, EXPEND_X:  340000, PAYROLL:  38, ACCT:   72, AGENDA:  8, PRA:  5, CONTRACT:  21, SQFT:  240, VEHICLE:  1800, COMMITS: 2 },
    PD:        { FTE: 0.50, EXPEND:  720000, EXPEND_X:  720000, PAYROLL:  15, ACCT:   45, AGENDA:  5, PRA:  3, CONTRACT:   8, SQFT:  180, VEHICLE:   600, COMMITS: 0 },
    FIRE:      { FTE: 0.20, EXPEND:  234000, EXPEND_X:  234000, PAYROLL:   8, ACCT:   18, AGENDA:  2, PRA:  1, CONTRACT:   6, SQFT:  140, VEHICLE:   315, COMMITS: 1 },
  };

  // Source documents
  const CAP_SOURCES = {
    file:        "Los Altos Hills CAP — Sept 4, 2025.pdf",
    fy:          "FY 2024-25 budgeted",
    importedAt:  "Sept 4, 2025 · CAP report import",
    revision:    "Final (3.30.2026)",
  };

  window.AFFERENT_CAP_DATA = {
    DEPARTMENTS, BASES, CENTERS, POOLS, DRIVERS, CAP_SOURCES,
  };
})();
