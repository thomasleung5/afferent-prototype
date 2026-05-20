import type {
  BasisUnitRow, CapPool, DirectAllocationRow, MatrixDeptCode,
} from "../types";
import { ALLOCATION_BASIS_ROWS, type AllocationBasisKey } from "./allocationBases";
import { SEED_ALLOCATION_BASES } from "./allocationBasesCatalog";

/* Source: data-extended.jsx CAP_POOLS (Town of Los Altos Hills CAP,
 * Sept 4 2025). The step-down engine reads these via the live store. */

// Each center's pools sum to its source-department cost. allocationPercent
// is derived from amount/centerTotal at seed time, then becomes the source
// of truth for the "%" column. amount stays in sync via store actions.
export const CAP_POOLS: CapPool[] = [
  // Building Use (centerTotal = 130,638)
  { id: "cap-bldguse-th", center: "Building Use",                      pool: "Town Hall",                                         allocationPercent: 93.41, amount: 122030, basisId: "bas-sqft",        basis: "Square footage",                              receiving: "Multiple departments", recoverability: "Recoverable where fee-related", review: "Reviewed" },
  { id: "cap-bldguse-pr", center: "Building Use",                      pool: "Parks and Recreation",                              allocationPercent:  6.59, amount:   8608, basisId: "bas-direct",      basis: "Direct allocation",                           receiving: "Parks and Recreation", recoverability: "Out of fee scope",              review: "Reviewed" },
  // Equipment Use (centerTotal = 37,315)
  { id: "cap-equip",      center: "Equipment Use",                     pool: "Vehicle / Equipment Operations",                    allocationPercent: 100,    amount:  37315, basisId: "bas-vehicle",     basis: "Vehicle depreciation",                        receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  // City Council (centerTotal = 404,077)
  { id: "cap-council",    center: "City Council",                      pool: "Council / Legislative",                             allocationPercent: 100,    amount: 404077, basisId: "bas-agenda",      basis: "Agenda item count",                           receiving: "Multiple departments", recoverability: "Excluded — public benefit",     review: "Reviewed" },
  // City Manager (centerTotal = 1,100,409)
  { id: "cap-cm-leg",     center: "City Manager",                      pool: "Council / Legislative Support",                     allocationPercent: 50.00, amount: 550205, basisId: "bas-agenda",      basis: "Agenda item count",                           receiving: "Multiple departments", recoverability: "Legislative support partially excluded under fee policy", review: "Review" },
  { id: "cap-cm-twdev",   center: "City Manager",                      pool: "Town-wide Operations Mgmt — Including Development", allocationPercent: 38.62, amount: 425015, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-cm-twxdev",  center: "City Manager",                      pool: "Town-wide Operations Mgmt — Excluding Development", allocationPercent: 11.38, amount: 125189, basisId: "bas-op-expend-x", basis: "Operating expenditures (excl. development)",  receiving: "Multiple departments", recoverability: "Non-development activities excluded", review: "Reviewed" },
  // City Clerk (centerTotal = 239,406)
  { id: "cap-clerk",      center: "City Clerk",                        pool: "Records & Public Information",                      allocationPercent: 100,    amount: 239406, basisId: "bas-pra",         basis: "PRA request count",                           receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  // Finance & Administrative Services (centerTotal = 974,544)
  { id: "cap-fas-hr",     center: "Finance & Administrative Services", pool: "Human Resources",                                   allocationPercent:  7.10, amount:  69193, basisId: "bas-fte-budget",  basis: "Budgeted FTE",                                receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-pay",    center: "Finance & Administrative Services", pool: "Payroll",                                           allocationPercent:  8.10, amount:  78938, basisId: "bas-payroll-tx",  basis: "Payroll transactions",                        receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-acct",   center: "Finance & Administrative Services", pool: "Town-wide Accounting Support",                      allocationPercent: 49.80, amount: 485323, basisId: "bas-acct-tx",     basis: "Accounting transactions",                     receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-proc",   center: "Finance & Administrative Services", pool: "Contracts & Procurement",                           allocationPercent: 35.00, amount: 341090, basisId: "bas-contracts",   basis: "Contract count",                              receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  // City Attorney (centerTotal = 180,000)
  { id: "cap-atty",       center: "City Attorney",                     pool: "Town-wide Support",                                 allocationPercent: 100,    amount: 180000, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Legal review recommended",      review: "Review" },
  // Insurance (centerTotal = 400,000)
  { id: "cap-ins",        center: "Insurance",                         pool: "Town-wide Liability Support",                       allocationPercent: 100,    amount: 400000, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  // Committees (centerTotal = 239,994)
  { id: "cap-cmte",       center: "Committees",                        pool: "Boards & Committees",                               allocationPercent: 100,    amount: 239994, basisId: "bas-committees",  basis: "Number of committees",                        receiving: "Multiple departments", recoverability: "Excluded — public benefit",     review: "Reviewed" },
];

/** Source department cost per cost center — the 100% reference for each
 *  pool's allocationPercent. Computed once from the seed CAP_POOLS so the
 *  initial state is internally consistent; user edits to center totals
 *  rescale all member pools proportionally. */
export const CAP_CENTER_TOTALS: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const p of CAP_POOLS) {
    map[p.center] = (map[p.center] ?? 0) + p.amount;
  }
  return map;
})();

/** Indirect-center GL codes (fund-division). Used as each center's
 *  routing identity in the step-down engine — without these, centers
 *  resolve to synth `seed:center:*` keys and can't reconcile against
 *  imported per-center allocations. Pattern: General Fund (011)
 *  · administrative-services range (11xx) for governance + finance
 *  · internal-service range (19xx) for facilities-style centers. */
export const CAP_CENTER_GLCODES: Record<string, string> = {
  "City Council":                       "011-1100",
  "City Manager":                       "011-1200",
  "City Clerk":                         "011-1300",
  "Finance & Administrative Services":  "011-1400",
  "City Attorney":                      "011-1500",
  "Insurance":                          "011-1600",
  "Committees":                         "011-1700",
  "Building Use":                       "011-1800",
  "Equipment Use":                      "011-1900",
};

/** Receiver-side GL codes for every MatrixDeptCode the step-down engine
 *  can route to. Indirect codes mirror CAP_CENTER_GLCODES so a center's
 *  identity is consistent whether it appears as a pool source or a
 *  pool receiver. Direct codes live in the General Fund operating range
 *  (3xxx), numbered in step-down-receiving order. */
export const CAP_DEPT_GLCODES: Record<MatrixDeptCode, string> = {
  // Indirect — mirror CAP_CENTER_GLCODES
  BLDG_USE: "011-1800",
  EQUIP:    "011-1900",
  COUNCIL:  "011-1100",
  CMGR:     "011-1200",
  CLERK:    "011-1300",
  FAS:      "011-1400",
  ATTY:     "011-1500",
  INS:      "011-1600",
  CMTE:     "011-1700",
  // Direct (operating divisions)
  PLAN:  "011-3100",
  BLDG:  "011-3200",
  ENG:   "011-3300",
  PW:    "011-3400",
  PARKS: "011-3500",
  PD:    "011-3600",
  FIRE:  "011-3700",
};

/** Seed per-basis allocation schedules. One BasisUnitRow per non-DIRECT
 *  seed basis that a CAP_POOLS entry references; receivers + units are
 *  pulled from ALLOCATION_BASIS_ROWS so the seed step-down has a
 *  ready-to-run schedule with GL codes attached — no AI import needed
 *  to see end-to-end routing. */
export const CAP_BASIS_UNITS: BasisUnitRow[] = (() => {
  const usedBasisIds = new Set(CAP_POOLS.map((p) => p.basisId));
  const seedDriverKeys = new Set<string>(ALLOCATION_BASIS_ROWS.flatMap((row) => Object.keys(row.values)));
  const isSeedDriverKey = (key: string): key is AllocationBasisKey => seedDriverKeys.has(key);
  const rows: BasisUnitRow[] = [];
  for (const basis of SEED_ALLOCATION_BASES) {
    if (!usedBasisIds.has(basis.id)) continue;
    if (basis.driverKey === "DIRECT") continue;
    if (!isSeedDriverKey(basis.driverKey)) continue;
    const driverKey: AllocationBasisKey = basis.driverKey;
    const receivers = ALLOCATION_BASIS_ROWS.flatMap((row) => {
      const v = row.values[driverKey];
      if (v == null || v <= 0) return [];
      const code = row.code as MatrixDeptCode;
      const glCode = CAP_DEPT_GLCODES[code];
      if (!glCode) return [];
      return [{ glCode, dept: row.name, deptCode: code, units: v }];
    });
    if (receivers.length === 0) continue;
    rows.push({
      basisId: basis.id, basis: basis.name, source: basis.source, receivers,
    });
  }
  return rows;
})();

/** Seed DIRECT-pool routing — one DirectAllocationRow per CAP_POOLS
 *  entry whose basis has driverKey "DIRECT". The Building Use → Parks
 *  pool is currently the only seeded direct allocation. */
export const CAP_DIRECT_ALLOCATIONS: DirectAllocationRow[] = [
  {
    poolId: "cap-bldguse-pr",
    pool: "Parks and Recreation",
    receivers: [
      {
        glCode: CAP_DEPT_GLCODES.PARKS,
        dept: "Parks & Recreation",
        deptCode: "PARKS",
        percent: 100,
      },
    ],
  },
];
