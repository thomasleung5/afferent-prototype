import type {
  BasisUnitRow, CapPool, DirectAllocationRow, InstDeptCode,
} from "../types";
import { INST_DEPTS } from "./institutionalDepts";

/* Source: Los Altos Hills FY 24/25 CAP bundle (AI-parsed export of the
 * Sept 2025 cost allocation workbook). The step-down engine reads these via the
 * live store. To refresh the seed against a future CAP edition, replace
 * the four exported constants below with the corresponding sections of
 * the new bundle — every other map in this file derives from them. */

/** Canonical jurisdiction-scoped GL codes per InstDeptCode — LAH FY 24/25.
 *  Indirect codes are the center's routing identity; direct codes stamp
 *  glCode onto the BasisUnitRow + DirectAllocationRow receivers further
 *  down. Used by the KEY() helper below to assign centerGlCode on each
 *  seed pool.
 *
 *  Pattern: General Fund (011) for governance/operating, Internal Service
 *  Funds (061) for fleet/facilities. Building Use and Equipment Use are
 *  the LAH document's own short codes (no fund prefix in the source).
 *
 *  Not exported. When a second jurisdiction lands this map forks per
 *  jurisdiction; InstDeptCode itself stays universal. */
const SEED_DEPT_GLCODES: Record<InstDeptCode, string> = {
  // Indirect cost centers
  BLDG_USE: "BLDG",
  EQUIP:    "EQUIP",
  COUNCIL:  "011-1100",
  CMGR:     "011-1200",
  CLERK:    "011-1300",
  FAS:      "011-1400",
  ATTY:     "011-1500",
  INS:      "011-1510",
  CMTE:     "011-1700",
  // Direct operating divisions
  ADMIN:     "011-3000",
  CLK:       "011-3050",
  FIN:       "011-3900",
  HR:        "011-1420",
  IT:        "011-1430",
  LEGAL:     "011-1500-D",
  PLAN:      "011-3100",
  BLDG:      "011-3200",
  ENG:       "011-3300",
  CODE:      "011-3350",
  FIRE:      "011-3700",
  PW:        "011-3400",
  TRANS:     "011-3450",
  ENV:       "011-3460",
  UTIL:      "011-3470",
  PD:        "011-3600",
  PARKS:     "011-3500",
  LIB:       "011-4000",
  ANIMAL:    "011-4100",
  HOUSING:   "011-4200",
  ECON:      "011-4300",
  HEALTH:    "011-4400",
  COMMUNITY: "011-4500",
  AIR_HARBOR:"011-4600",
  GEN_GOV:   "011-9990",
};

/** Additional indirect centers the LAH CAP publishes that aren't part of
 *  the universal InstDeptCode classification — internal service funds
 *  whose role is jurisdiction-specific. They get real glCodes for engine
 *  routing but no InstDeptCode classification (the engine treats their
 *  `classification` as undefined, which is display-only). */
const NON_INST_CENTER_GLCODES: Record<string, string> = {
  "Fringe Benefits Allocation":     "061-1470",
  "Town Center Operations":         "061-1480",
  "Corp Yard Operations":           "061-4300",
  "Vehicle / Equipment Operations": "061-4400",
};

/** Internal: indirect-center GL codes keyed by display name. Used only by
 *  the KEY() helper below to stamp centerGlCode onto each seed pool. No
 *  longer exported — every store consumer reads the glCode straight off
 *  the pool / off the engine node, never via a name lookup. */
const CAP_CENTER_GLCODES: Record<string, string> = (() => {
  const out: Record<string, string> = { ...NON_INST_CENTER_GLCODES };
  for (const dept of INST_DEPTS) {
    if (dept.kind === "indirect") out[dept.name] = SEED_DEPT_GLCODES[dept.code];
  }
  return out;
})();

// Pre-resolve every center's identity key so the CAP_POOLS literals below
// don't have to repeat the lookup. Defensive: a center missing from
// CAP_CENTER_GLCODES would fall back to the seed:center:NAME synth (engine
// still accepts it).
const KEY = (centerName: string): string =>
  CAP_CENTER_GLCODES[centerName] ?? `seed:center:${centerName}`;

/** Published source-department totals per cost center, keyed by center
 *  identity (glCode). Pool amounts roll up to these figures with minor
 *  rounding (e.g. FAS pools sum to 974,545 against the published total of
 *  974,544 — one-dollar drift in the source workbook, preserved here for
 *  fidelity). User edits to a center total rescale all member pools
 *  proportionally. */
export const CAP_CENTER_TOTALS: Record<string, number> = {
  [KEY("Building Use")]:                        130638,
  [KEY("Equipment Use")]:                        37315,
  [KEY("City Council")]:                        404077,
  [KEY("City Manager")]:                       1100409,
  [KEY("City Clerk")]:                          239406,
  [KEY("Finance & Administrative Services")]:   974544,
  [KEY("City Attorney")]:                       180000,
  [KEY("Insurance")]:                           400000,
  [KEY("Committees")]:                          239994,
  [KEY("Fringe Benefits Allocation")]:               0,
  [KEY("Town Center Operations")]:                   0,
  [KEY("Corp Yard Operations")]:                     0,
  [KEY("Vehicle / Equipment Operations")]:           0,
};

/** Seed center metadata keyed by glCode. Pairs with CAP_CENTER_TOTALS to
 *  populate the store's `capCenterSources` map at module init time. */
export const CAP_CENTER_SOURCES_SEED: Record<string, { name: string }> = {
  [KEY("Building Use")]:                        { name: "Building Use" },
  [KEY("Equipment Use")]:                        { name: "Equipment Use" },
  [KEY("City Council")]:                        { name: "City Council" },
  [KEY("City Manager")]:                        { name: "City Manager" },
  [KEY("City Clerk")]:                          { name: "City Clerk" },
  [KEY("Finance & Administrative Services")]:   { name: "Finance & Administrative Services" },
  [KEY("City Attorney")]:                       { name: "City Attorney" },
  [KEY("Insurance")]:                           { name: "Insurance" },
  [KEY("Committees")]:                          { name: "Committees" },
  [KEY("Fringe Benefits Allocation")]:          { name: "Fringe Benefits Allocation" },
  [KEY("Town Center Operations")]:              { name: "Town Center Operations" },
  [KEY("Corp Yard Operations")]:                { name: "Corp Yard Operations" },
  [KEY("Vehicle / Equipment Operations")]:      { name: "Vehicle / Equipment Operations" },
};

/** Pool inventory — one row per CAP cost pool. Each pool's amount is the
 *  NET ALLOCABLE figure the engine distributes; personnelCost +
 *  operatingCost − disallowedCost reconciles to amount (or to 0 for
 *  internal-service redistribution pools where the entire cost is
 *  carved into disallowed and only incoming overhead routes through).
 *  allocationPercent is the pool's claimed share of its center's net
 *  allocable balance — sums to ~100% within a center. centerGlCode is
 *  the engine's routing identity. */
export const CAP_POOLS: CapPool[] = [
  // ── Building Use (centerTotal = 130,638) ───────────────────────────────
  { id: "cap-bldguse-th",          center: "Building Use",                       centerGlCode: KEY("Building Use"),                       pool: "Town Hall",                                                   allocationPercent: 93.41, amount: 122030, basisId: "bas-fte-th-occupy",  basis: "FY 24/25 Budgeted FTE Occupying Town Hall",                                                                                       receiving: "Multiple departments", recoverability: "Recoverable where fee-related", review: "Reviewed" },
  { id: "cap-bldguse-pr",          center: "Building Use",                       centerGlCode: KEY("Building Use"),                       pool: "Parks and Recreation",                                        allocationPercent:  6.59, amount:   8608, basisId: "bas-direct-pr",      basis: "Direct to Parks and Recreation",                                                                                                  receiving: "Recreation Administration", recoverability: "Out of fee scope", review: "Reviewed" },
  // ── Equipment Use (centerTotal = 37,315) ───────────────────────────────
  { id: "cap-equip-vehicles",      center: "Equipment Use",                       centerGlCode: KEY("Equipment Use"),                      pool: "Town Vehicles",                                               allocationPercent: 100,   amount:  37315, basisId: "bas-vehicle-dep",    basis: "FY 23/24 Vehicle Depreciation Expense by Department",                                                                             operatingCost: 37315,                                                                                                 receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  // ── City Council (centerTotal = 404,077) ───────────────────────────────
  { id: "cap-council-twsupp",      center: "City Council",                        centerGlCode: KEY("City Council"),                       pool: "Town-wide Support",                                           allocationPercent: 100,   amount: 404077, basisId: "bas-agenda-count",   basis: "FY 23/24 Agenda Item Count per Fund, Department, and/or Division",                                                                personnelCost: 101377, operatingCost: 347700, disallowedCost: 45000,                                            receiving: "Multiple departments", recoverability: "Community program expenses excluded", review: "Reviewed" },
  // ── City Manager (centerTotal = 1,100,409) ─────────────────────────────
  { id: "cap-cm-leg",              center: "City Manager",                        centerGlCode: KEY("City Manager"),                       pool: "Council / Legislative Support",                               allocationPercent:  50.00, amount: 550205, basisId: "bas-agenda-count",  basis: "FY 23/24 Agenda Item Count per Fund, Department, and/or Division",                                                                personnelCost: 333605, operatingCost: 251600, disallowedCost: 35000,                                            receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  { id: "cap-cm-twdev",            center: "City Manager",                        centerGlCode: KEY("City Manager"),                       pool: "Town-wide Operations Management - Including Development",     allocationPercent:  38.62, amount: 425015, basisId: "bas-op-expend",     basis: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers)",                    personnelCost: 257699, operatingCost: 194353, disallowedCost: 27036,                                            receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  { id: "cap-cm-twxdev",           center: "City Manager",                        centerGlCode: KEY("City Manager"),                       pool: "Town-wide Operations Management - Excluding Development",     allocationPercent:  11.38, amount: 125189, basisId: "bas-op-expend-x",   basis: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers) - Excluding Planning, Building, & Engineering", personnelCost: 75906, operatingCost: 57247, disallowedCost: 7964, receiving: "Multiple departments", recoverability: "Non-development activities excluded", review: "Reviewed" },
  // ── City Clerk (centerTotal = 239,406) ─────────────────────────────────
  { id: "cap-clerk-twsupp",        center: "City Clerk",                          centerGlCode: KEY("City Clerk"),                         pool: "Town-wide City Clerk Support",                                allocationPercent:  77.80, amount: 186258, basisId: "bas-agenda-count",  basis: "FY 23/24 Agenda Item Count per Fund, Department, and/or Division",                                                                personnelCost: 136116, operatingCost: 81262, disallowedCost: 31120,                                             receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  { id: "cap-clerk-pra",           center: "City Clerk",                          centerGlCode: KEY("City Clerk"),                         pool: "Public Records Act Request",                                  allocationPercent:  17.20, amount:  41178, basisId: "bas-pra-count",     basis: "FY 23/24 Public Records Act (PRA) Requests per Fund, Department, and/or Division",                                                personnelCost: 30092, operatingCost: 17965, disallowedCost: 6880,                                               receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  { id: "cap-clerk-contracts",     center: "City Clerk",                          centerGlCode: KEY("City Clerk"),                         pool: "Contracts",                                                   allocationPercent:   5.00, amount:  11970, basisId: "bas-contracts-count", basis: "FY 23/24 Contracts Count per Fund, Department, and/or Division",                                                               personnelCost: 8748, operatingCost: 5223, disallowedCost: 2000,                                                receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  // ── Finance & Administrative Services (centerTotal = 974,544) ──────────
  { id: "cap-fas-hr",              center: "Finance & Administrative Services",   centerGlCode: KEY("Finance & Administrative Services"),  pool: "Human Resources",                                             allocationPercent:   7.10, amount:  69193, basisId: "bas-fte-budget",    basis: "FY 24/25 Budgeted FTE per Fund, Department, and/or Division",                                                                     personnelCost: 58630, operatingCost: 12693, disallowedCost: 2130,                                              receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  { id: "cap-fas-twsupp",          center: "Finance & Administrative Services",   centerGlCode: KEY("Finance & Administrative Services"),  pool: "Town-wide Finance Support",                                   allocationPercent:  35.00, amount: 341091, basisId: "bas-op-expend",     basis: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers)",                    personnelCost: 289021, operatingCost: 62570, disallowedCost: 10500,                                            receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  { id: "cap-fas-payroll",         center: "Finance & Administrative Services",   centerGlCode: KEY("Finance & Administrative Services"),  pool: "Payroll",                                                     allocationPercent:   8.10, amount:  78938, basisId: "bas-payroll-tx",    basis: "FY 23/24 Number of Payroll Transactions excluding Payroll per Fund, Department, and/or Division",                                 personnelCost: 66888, operatingCost: 14480, disallowedCost: 2430,                                              receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  { id: "cap-fas-acct",            center: "Finance & Administrative Services",   centerGlCode: KEY("Finance & Administrative Services"),  pool: "Town-wide Accounting Support",                                allocationPercent:  49.80, amount: 485323, basisId: "bas-acct-tx",       basis: "FY 23/24 Number of Accounting Transactions per Fund, Department, and/or Division",                                                personnelCost: 411236, operatingCost: 89027, disallowedCost: 14940,                                            receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  // ── City Attorney (centerTotal = 180,000) ──────────────────────────────
  { id: "cap-atty-twsupp",         center: "City Attorney",                       centerGlCode: KEY("City Attorney"),                      pool: "Town-wide Support",                                           allocationPercent: 100,   amount: 180000, basisId: "bas-op-expend",      basis: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers)",                    operatingCost: 340000, disallowedCost: 160000,                                                                receiving: "Multiple departments", recoverability: "One-time legal expenses unallowable", review: "Reviewed" },
  // ── Insurance (centerTotal = 400,000) ──────────────────────────────────
  { id: "cap-ins-twliab",          center: "Insurance",                           centerGlCode: KEY("Insurance"),                          pool: "Town-wide Liability Support",                                 allocationPercent: 100,   amount: 400000, basisId: "bas-op-expend",      basis: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers)",                    operatingCost: 400000,                                                                                          receiving: "Multiple departments", recoverability: "Partially recoverable", review: "Reviewed" },
  // ── Committees (centerTotal = 239,994) ─────────────────────────────────
  { id: "cap-cmte-cmtesupp",       center: "Committees",                          centerGlCode: KEY("Committees"),                         pool: "Town-wide Committee Support",                                 allocationPercent: 100,   amount: 239994, basisId: "bas-committees-supp",basis: "Number of Committees Supported per Department",                                                                                   personnelCost: 230494, operatingCost: 31500, disallowedCost: 22000,                                             receiving: "Multiple departments", recoverability: "Community program expenses excluded", review: "Reviewed" },
  // ── Fringe Benefits Allocation (internal service — $0 own) ─────────────
  { id: "cap-fringe-twbenefits",   center: "Fringe Benefits Allocation",          centerGlCode: KEY("Fringe Benefits Allocation"),         pool: "Town-wide Benefits",                                          allocationPercent: 100,   amount:      0, basisId: "bas-salary-dist",   basis: "FY 24/25 Salary Cost Distribution per Fund, Department, and/or Division",                                                          personnelCost: 105800, disallowedCost: 105800,                                                                 receiving: "Multiple departments", recoverability: "Internal Service Fund - only incoming overhead allocated", review: "Reviewed" },
  // ── Town Center Operations (internal service — $0 own) ─────────────────
  { id: "cap-tco-tcops",           center: "Town Center Operations",              centerGlCode: KEY("Town Center Operations"),             pool: "Town Center Operations",                                      allocationPercent:  64.39, amount:      0, basisId: "bas-fte-th-occupy", basis: "FY 24/25 Budgeted FTE Occupying Town Hall",                                                                                       personnelCost: 125123, operatingCost: 488038, disallowedCost: 613161,                                           receiving: "Multiple departments", recoverability: "Internal Service Fund - only incoming overhead allocated", review: "Reviewed" },
  { id: "cap-tco-twops",           center: "Town Center Operations",              centerGlCode: KEY("Town Center Operations"),             pool: "Town-wide Operations",                                        allocationPercent:   2.10, amount:      0, basisId: "bas-op-expend",     basis: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers)",                    operatingCost: 20000, disallowedCost: 20000,                                                                  receiving: "Multiple departments", recoverability: "Internal Service Fund - only incoming overhead allocated", review: "Reviewed" },
  { id: "cap-tco-twit",            center: "Town Center Operations",              centerGlCode: KEY("Town Center Operations"),             pool: "Town-wide IT Support",                                        allocationPercent:  33.50, amount:      0, basisId: "bas-fte-budget",    basis: "FY 24/25 Budgeted FTE per Fund, Department, and/or Division",                                                                     operatingCost: 319000, disallowedCost: 319000,                                                                receiving: "Multiple departments", recoverability: "Internal Service Fund - only incoming overhead allocated", review: "Reviewed" },
  // ── Corp Yard Operations (internal service — $0 own) ───────────────────
  { id: "cap-corpyard-cysupp",     center: "Corp Yard Operations",                centerGlCode: KEY("Corp Yard Operations"),               pool: "Corporation Yard Support",                                    allocationPercent: 100,   amount:      0, basisId: "bas-op-expend-pw",  basis: "FY 24/25 Budgeted Expenditures (PW Departments Only)",                                                                            personnelCost: 50432, operatingCost: 131250, disallowedCost: 181682,                                            receiving: "Multiple departments", recoverability: "Internal Service Fund - only incoming overhead allocated", review: "Reviewed" },
  // ── Vehicle / Equipment Operations (internal service — $0 own) ─────────
  { id: "cap-vehops-fleetmaint",   center: "Vehicle / Equipment Operations",      centerGlCode: KEY("Vehicle / Equipment Operations"),     pool: "Town-wide Fleet Maintenance",                                 allocationPercent: 100,   amount:      0, basisId: "bas-vehicles-maint",basis: "FY 23/24 Vehicles Maintained per Department",                                                                                     personnelCost: 56386, operatingCost: 75700, disallowedCost: 132086,                                             receiving: "Multiple departments", recoverability: "Internal Service Fund - only incoming overhead allocated", review: "Reviewed" },
];

/** Per-basis allocation schedules — one BasisUnitRow per non-DIRECT seed
 *  basis. Receivers are stamped with their published glCode + InstDeptCode
 *  classification; "OTHER" deptCodes are valid for funds/programs outside
 *  the InstDeptCode catalog (CIP funds, Sewer Fund, "All Other"). The
 *  engine derives each pool's per-receiver percent as units / Σ units
 *  across this schedule; pools sharing a basisId share the same units. */
export const CAP_BASIS_UNITS: BasisUnitRow[] = [
  {
    basisId: "bas-fte-th-occupy",
    basis: "FY 24/25 Budgeted FTE Occupying Town Hall",
    source: "Allocations 3.2025 NBS.xlsx",
    receivers: [
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",  units: 3.00 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK", units: 1.00 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",   units: 4.00 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",  units: 2.92 },
      { dept: "Building Admin",                     glCode: "011-3200", deptCode: "BLDG",  units: 2.81 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",   units: 1.40 },
      { dept: "WWB Facility",                       glCode: "011-5300", deptCode: "OTHER", units: 0.41 },
    ],
  },
  {
    basisId: "bas-vehicle-dep",
    basis: "FY 23/24 Vehicle Depreciation Expense by Department",
    source: "Vehicle Listing - Dept usage_NBS.xlsx",
    receivers: [
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",  units:  8200 },
      { dept: "Corp Yard Operations",               glCode: "061-4300", deptCode: "OTHER", units: 29115 },
    ],
  },
  {
    basisId: "bas-agenda-count",
    basis: "FY 23/24 Agenda Item Count per Fund, Department, and/or Division",
    source: "Agenda Items by Dept.Fund.Program FY 23-24_NBS.xlsx",
    receivers: [
      { dept: "City Council",                       glCode: "011-1100", deptCode: "COUNCIL", units: 42 },
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",    units: 35 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK",   units: 43 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",     units: 52 },
      { dept: "City Attorney",                      glCode: "011-1500", deptCode: "ATTY",    units: 21 },
      { dept: "Committees",                         glCode: "011-1700", deptCode: "CMTE",    units: 21 },
      { dept: "Town Center Operations",             glCode: "061-1480", deptCode: "OTHER",   units:  1 },
      { dept: "Administration",                     glCode: "011-0000", deptCode: "OTHER",   units:  1 },
      { dept: "Community Service Grants",           glCode: "011-1600", deptCode: "OTHER",   units:  1 },
      { dept: "Public Safety",                      glCode: "011-2100", deptCode: "PD",      units: 10 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",    units: 40 },
      { dept: "Planning Commission",                glCode: "011-3110", deptCode: "OTHER",   units:  1 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",     units: 18 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",      units:  1 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",      units:  3 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",      units:  1 },
      { dept: "Sewer Fund CIP",                     glCode: "048-6900", deptCode: "OTHER",   units:  1 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER",   units:  7 },
    ],
  },
  {
    basisId: "bas-op-expend",
    basis: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers)",
    source: "Detail vs Budget Report FY 24-25 7.1-12.31.24_NBS.xlsx",
    receivers: [
      { dept: "City Council",                       glCode: "011-1100", deptCode: "COUNCIL", units:  449077 },
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",    units:  976864 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK",   units:  279406 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",     units: 1004544 },
      { dept: "City Attorney",                      glCode: "011-1500", deptCode: "ATTY",    units:  340000 },
      { dept: "Insurance",                          glCode: "011-1510", deptCode: "INS",     units:  400000 },
      { dept: "Committees",                         glCode: "011-1700", deptCode: "CMTE",    units:  261994 },
      { dept: "Fringe Benefits Allocation",         glCode: "061-1470", deptCode: "OTHER",   units:  105800 },
      { dept: "Town Center Operations",             glCode: "061-1480", deptCode: "OTHER",   units:  952161 },
      { dept: "Corp Yard Operations",               glCode: "061-4300", deptCode: "OTHER",   units:  181682 },
      { dept: "Vehicle / Equipment Operations",     glCode: "061-4400", deptCode: "OTHER",   units:  132086 },
      { dept: "Recreation Administration",          glCode: "011-1000", deptCode: "OTHER",   units:  909980 },
      { dept: "Community Service Grants",           glCode: "011-1600", deptCode: "OTHER",   units:   41762 },
      { dept: "Public Safety",                      glCode: "011-2100", deptCode: "PD",      units: 2700326 },
      { dept: "Animal Control",                     glCode: "011-2150", deptCode: "OTHER",   units:  161335 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",    units: 2262601 },
      { dept: "Planning Commission",                glCode: "011-3110", deptCode: "OTHER",   units:   78382 },
      { dept: "Code Enforcement",                   glCode: "011-3120", deptCode: "OTHER",   units:  212111 },
      { dept: "Building Admin",                     glCode: "011-3200", deptCode: "BLDG",    units: 2690548 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",     units: 1394527 },
      { dept: "P & R Fee Programs",                 glCode: "011-4110", deptCode: "OTHER",   units:   45820 },
      { dept: "Parks & Rec Special Events",         glCode: "011-4120", deptCode: "OTHER",   units:  262721 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",      units:  504509 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",      units:  837652 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",      units:  814148 },
      { dept: "Playing Fields",                     glCode: "011-5100", deptCode: "OTHER",   units:  251003 },
      { dept: "WWB Facility",                       glCode: "011-5300", deptCode: "OTHER",   units:  364205 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER",   units: 1529103 },
    ],
  },
  {
    basisId: "bas-op-expend-x",
    basis: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers) - Excluding Planning, Building, & Engineering",
    source: "Detail vs Budget Report FY 24-25 7.1-12.31.24_NBS.xlsx",
    receivers: [
      { dept: "City Council",                       glCode: "011-1100", deptCode: "COUNCIL", units:  449077 },
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",    units:  976864 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK",   units:  279406 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",     units: 1004544 },
      { dept: "City Attorney",                      glCode: "011-1500", deptCode: "ATTY",    units:  340000 },
      { dept: "Insurance",                          glCode: "011-1510", deptCode: "INS",     units:  400000 },
      { dept: "Committees",                         glCode: "011-1700", deptCode: "CMTE",    units:  261994 },
      { dept: "Fringe Benefits Allocation",         glCode: "061-1470", deptCode: "OTHER",   units:  105800 },
      { dept: "Town Center Operations",             glCode: "061-1480", deptCode: "OTHER",   units:  952161 },
      { dept: "Corp Yard Operations",               glCode: "061-4300", deptCode: "OTHER",   units:  181682 },
      { dept: "Vehicle / Equipment Operations",     glCode: "061-4400", deptCode: "OTHER",   units:  132086 },
      { dept: "Recreation Administration",          glCode: "011-1000", deptCode: "OTHER",   units:  909980 },
      { dept: "Community Service Grants",           glCode: "011-1600", deptCode: "OTHER",   units:   41762 },
      { dept: "Public Safety",                      glCode: "011-2100", deptCode: "PD",      units: 2700326 },
      { dept: "Animal Control",                     glCode: "011-2150", deptCode: "OTHER",   units:  161335 },
      { dept: "Planning Commission",                glCode: "011-3110", deptCode: "OTHER",   units:   78382 },
      { dept: "Code Enforcement",                   glCode: "011-3120", deptCode: "OTHER",   units:  212111 },
      { dept: "P & R Fee Programs",                 glCode: "011-4110", deptCode: "OTHER",   units:   45820 },
      { dept: "Parks & Rec Special Events",         glCode: "011-4120", deptCode: "OTHER",   units:  262721 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",      units:  504509 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",      units:  837652 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",      units:  814148 },
      { dept: "Playing Fields",                     glCode: "011-5100", deptCode: "OTHER",   units:  251003 },
      { dept: "WWB Facility",                       glCode: "011-5300", deptCode: "OTHER",   units:  364205 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER",   units: 1529103 },
    ],
  },
  {
    basisId: "bas-pra-count",
    basis: "FY 23/24 Public Records Act (PRA) Requests per Fund, Department, and/or Division",
    source: "5.2 PRAs by Program.xlsx",
    receivers: [
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR", units:  2 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",  units:  6 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN", units:  7 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",  units: 16 },
    ],
  },
  {
    basisId: "bas-contracts-count",
    basis: "FY 23/24 Contracts Count per Fund, Department, and/or Division",
    source: "5.3 Contracts per Program.xlsx",
    receivers: [
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",  units: 20 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK", units:  5 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",   units: 11 },
      { dept: "City Attorney",                      glCode: "011-1500", deptCode: "ATTY",  units:  2 },
      { dept: "Corp Yard Operations",               glCode: "061-4300", deptCode: "OTHER", units:  3 },
      { dept: "Recreation Administration",          glCode: "011-1000", deptCode: "OTHER", units:  5 },
      { dept: "Public Safety",                      glCode: "011-2100", deptCode: "PD",    units:  5 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",  units:  4 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",   units: 20 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",    units:  4 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",    units:  3 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",    units:  5 },
      { dept: "Playing Fields",                     glCode: "011-5100", deptCode: "OTHER", units:  1 },
      { dept: "Westwind Barn CIP Admin",            glCode: "043",      deptCode: "OTHER", units:  2 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER", units: 13 },
    ],
  },
  {
    basisId: "bas-fte-budget",
    basis: "FY 24/25 Budgeted FTE per Fund, Department, and/or Division",
    source: "Allocations 3.2025 NBS",
    receivers: [
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",  units: 3.00 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK", units: 1.00 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",   units: 4.00 },
      { dept: "Committees",                         glCode: "011-1700", deptCode: "CMTE",  units: 0.95 },
      { dept: "Town Center Operations",             glCode: "061-1480", deptCode: "OTHER", units: 0.85 },
      { dept: "Corp Yard Operations",               glCode: "061-4300", deptCode: "OTHER", units: 0.35 },
      { dept: "Vehicle / Equipment Operations",     glCode: "061-4400", deptCode: "OTHER", units: 0.49 },
      { dept: "Recreation Administration",          glCode: "011-1000", deptCode: "OTHER", units: 0.15 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",  units: 2.92 },
      { dept: "Planning Commission",                glCode: "011-3110", deptCode: "OTHER", units: 0.37 },
      { dept: "Code Enforcement",                   glCode: "011-3120", deptCode: "OTHER", units: 0.20 },
      { dept: "Building Admin",                     glCode: "011-3200", deptCode: "BLDG",  units: 2.81 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",   units: 1.40 },
      { dept: "Parks & Rec Special Events",         glCode: "011-4120", deptCode: "OTHER", units: 0.50 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",    units: 1.20 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",    units: 1.85 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",    units: 2.80 },
      { dept: "Playing Fields",                     glCode: "011-5100", deptCode: "OTHER", units: 0.45 },
      { dept: "WWB Facility",                       glCode: "011-5300", deptCode: "OTHER", units: 0.41 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER", units: 1.30 },
    ],
  },
  {
    basisId: "bas-payroll-tx",
    basis: "FY 23/24 Number of Payroll Transactions excluding Payroll per Fund, Department, and/or Division",
    source: "Los Altos Hills _Count of Transactions.pdf",
    receivers: [
      { dept: "City Council",                       glCode: "011-1100", deptCode: "COUNCIL", units: 130 },
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",    units:  72 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK",   units:  59 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",     units:  58 },
      { dept: "Corp Yard Operations",               glCode: "061-4300", deptCode: "OTHER",   units: 144 },
      { dept: "Recreation Administration",          glCode: "011-1000", deptCode: "OTHER",   units:  50 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",    units: 127 },
      { dept: "Planning Commission",                glCode: "011-3110", deptCode: "OTHER",   units: 130 },
      { dept: "Building Admin",                     glCode: "011-3200", deptCode: "BLDG",    units:  50 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",     units: 150 },
    ],
  },
  {
    basisId: "bas-acct-tx",
    basis: "FY 23/24 Number of Accounting Transactions per Fund, Department, and/or Division",
    source: "6.4 JE count by Dept request.xlsx & 6.4 Invoices by Program.xlsx",
    receivers: [
      { dept: "City Council",                       glCode: "011-1100", deptCode: "COUNCIL", units:  60 },
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",    units:  58 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK",   units:  23 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",     units: 285 },
      { dept: "City Attorney",                      glCode: "011-1500", deptCode: "ATTY",    units:  32 },
      { dept: "Insurance",                          glCode: "011-1510", deptCode: "INS",     units:   1 },
      { dept: "Committees",                         glCode: "011-1700", deptCode: "CMTE",    units:  16 },
      { dept: "Fringe Benefits Allocation",         glCode: "061-1470", deptCode: "OTHER",   units:  47 },
      { dept: "Town Center Operations",             glCode: "061-1480", deptCode: "OTHER",   units: 639 },
      { dept: "Corp Yard Operations",               glCode: "061-4300", deptCode: "OTHER",   units: 220 },
      { dept: "Vehicle / Equipment Operations",     glCode: "061-4400", deptCode: "OTHER",   units:  64 },
      { dept: "Administration",                     glCode: "011-0000", deptCode: "OTHER",   units: 474 },
      { dept: "Recreation Administration",          glCode: "011-1000", deptCode: "OTHER",   units:  11 },
      { dept: "Community Service Grants",           glCode: "011-1600", deptCode: "OTHER",   units:   6 },
      { dept: "Public Safety",                      glCode: "011-2100", deptCode: "PD",      units: 104 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",    units:  77 },
      { dept: "Planning Commission",                glCode: "011-3110", deptCode: "OTHER",   units:   4 },
      { dept: "Code Enforcement",                   glCode: "011-3120", deptCode: "OTHER",   units:   3 },
      { dept: "Building Admin",                     glCode: "011-3200", deptCode: "BLDG",    units:  86 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",     units:  52 },
      { dept: "P & R Fee Programs",                 glCode: "011-4110", deptCode: "OTHER",   units:   7 },
      { dept: "Parks & Rec Special Events",         glCode: "011-4120", deptCode: "OTHER",   units:  55 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",      units:   6 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",      units:  50 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",      units:  43 },
      { dept: "Playing Fields",                     glCode: "011-5100", deptCode: "OTHER",   units:  90 },
      { dept: "WWB Facility",                       glCode: "011-5300", deptCode: "OTHER",   units:  79 },
      { dept: "COPS Fund",                          glCode: "021",      deptCode: "OTHER",   units:   5 },
      { dept: "General CIP Fund",                   glCode: "041",      deptCode: "OTHER",   units: 152 },
      { dept: "Pathways CIP",                       glCode: "042",      deptCode: "OTHER",   units:  16 },
      { dept: "Westwind Barn CIP Admin",            glCode: "043",      deptCode: "OTHER",   units:   2 },
      { dept: "Drainage CIP",                       glCode: "045",      deptCode: "OTHER",   units:  18 },
      { dept: "Street CIP",                         glCode: "046",      deptCode: "OTHER",   units:  14 },
      { dept: "Sewer Fund CIP",                     glCode: "048-6900", deptCode: "OTHER",   units:  16 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER",   units:  82 },
      { dept: "All Other",                          glCode: "AO",       deptCode: "OTHER",   units: 110 },
    ],
  },
  {
    basisId: "bas-committees-supp",
    basis: "Number of Committees Supported per Department",
    source: "Committees 3.20.25.xlsx",
    receivers: [
      { dept: "City Council",                       glCode: "011-1100", deptCode: "COUNCIL", units: 5 },
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",    units: 2 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",     units: 1 },
      { dept: "Recreation Administration",          glCode: "011-1000", deptCode: "OTHER",   units: 2 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",    units: 5 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",      units: 2 },
    ],
  },
  {
    basisId: "bas-salary-dist",
    basis: "FY 24/25 Salary Cost Distribution per Fund, Department, and/or Division",
    source: "Detail vs Budget Report FY 24-25 7.1-12.31.24_NBS",
    receivers: [
      { dept: "City Council",                       glCode: "011-1100", deptCode: "COUNCIL", units:  18826 },
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",    units: 378901 },
      { dept: "City Clerk",                         glCode: "011-1300", deptCode: "CLERK",   units: 135699 },
      { dept: "Finance & Administrative Services",  glCode: "011-1400", deptCode: "FAS",     units: 587047 },
      { dept: "Committees",                         glCode: "011-1700", deptCode: "CMTE",    units: 170823 },
      { dept: "Town Center Operations",             glCode: "061-1480", deptCode: "OTHER",   units:  95116 },
      { dept: "Corp Yard Operations",               glCode: "061-4300", deptCode: "OTHER",   units:  36073 },
      { dept: "Vehicle / Equipment Operations",     glCode: "061-4400", deptCode: "OTHER",   units:  38893 },
      { dept: "Recreation Administration",          glCode: "011-1000", deptCode: "OTHER",   units:  99452 },
      { dept: "Planning Admin",                     glCode: "011-3100", deptCode: "PLAN",    units: 448767 },
      { dept: "Planning Commission",                glCode: "011-3110", deptCode: "OTHER",   units:  38525 },
      { dept: "Code Enforcement",                   glCode: "011-3120", deptCode: "OTHER",   units:  31407 },
      { dept: "Building Admin",                     glCode: "011-3200", deptCode: "BLDG",    units: 416920 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",     units: 242597 },
      { dept: "Parks & Rec Special Events",         glCode: "011-4120", deptCode: "OTHER",   units:  79211 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",      units: 185107 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",      units: 221664 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",      units: 322996 },
      { dept: "Playing Fields",                     glCode: "011-5100", deptCode: "OTHER",   units:  46878 },
      { dept: "WWB Facility",                       glCode: "011-5300", deptCode: "OTHER",   units:  54784 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER",   units: 222643 },
    ],
  },
  {
    basisId: "bas-op-expend-pw",
    basis: "FY 24/25 Budgeted Expenditures (PW Departments Only)",
    source: "Detail vs Budget Report FY 24-25 7.1-12.31.24_NBS",
    receivers: [
      { dept: "Vehicle / Equipment Operations",     glCode: "061-4400", deptCode: "OTHER", units:  132086 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",   units: 1394527 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",    units:  504509 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",    units:  837652 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",    units:  814148 },
      { dept: "Playing Fields",                     glCode: "011-5100", deptCode: "OTHER", units:  251003 },
      { dept: "WWB Facility",                       glCode: "011-5300", deptCode: "OTHER", units:  364205 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER", units: 1529103 },
    ],
  },
  {
    basisId: "bas-vehicles-maint",
    basis: "FY 23/24 Vehicles Maintained per Department",
    source: "CapAssets_All_listing_CostAllocation_Nicole_04.01.2025_NBS",
    receivers: [
      { dept: "City Manager",                       glCode: "011-1200", deptCode: "CMGR",  units: 1.00 },
      { dept: "Engineering Administration",         glCode: "011-3300", deptCode: "ENG",   units: 2.08 },
      { dept: "Storm Drain Operations",             glCode: "011-4500", deptCode: "PW",    units: 1.79 },
      { dept: "Street Operations",                  glCode: "011-4600", deptCode: "PW",    units: 2.75 },
      { dept: "Pathway Operations",                 glCode: "011-4740", deptCode: "PW",    units: 4.17 },
      { dept: "Playing Fields",                     glCode: "011-5100", deptCode: "OTHER", units: 0.67 },
      { dept: "WWB Facility",                       glCode: "011-5300", deptCode: "OTHER", units: 0.61 },
      { dept: "Sewer Fund",                         glCode: "051-0000", deptCode: "OTHER", units: 1.93 },
    ],
  },
];

/** Per-DIRECT-pool explicit routing. The Building Use → Parks pool is the
 *  only seeded direct allocation; 100% routes to the Recreation
 *  Administration division (glCode 011-1000). */
export const CAP_DIRECT_ALLOCATIONS: DirectAllocationRow[] = [
  {
    poolId: "cap-bldguse-pr",
    pool: "Parks and Recreation",
    receivers: [
      { glCode: "011-1000", dept: "Recreation Administration", deptCode: "OTHER", percent: 100 },
    ],
  },
];
