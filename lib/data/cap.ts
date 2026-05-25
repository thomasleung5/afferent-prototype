import type {
  BasisUnitRow, CapPool, DirectAllocationRow, InstDeptCode,
} from "../types";
import { BASIS_DRIVERS, type AllocationBasisKey } from "./allocationBases";
import { INDIRECT_CODE_BY_NAME, INST_DEPTS } from "./institutionalDepts";
import { SEED_ALLOCATION_BASES } from "./allocationBasesCatalog";

/* Source: data-extended.jsx CAP_POOLS (Town of Los Altos Hills CAP,
 * Sept 4 2025). The step-down engine reads these via the live store. */

/** Canonical jurisdiction-scoped GL codes — LAH only. One entry per
 *  InstDeptCode covers every role the engine needs: indirect codes are
 *  the center's routing identity (mirrored into CAP_CENTER_GLCODES
 *  below), direct codes stamp glCode onto the generated BasisUnitRow +
 *  DirectAllocationRow receivers further down.
 *
 *  Pattern: General Fund (011)
 *  · administrative-services range (11xx) for governance + finance
 *  · internal-service range (19xx) for facilities-style centers
 *  · operating range (3xxx) for direct divisions, in step-down-receiving order.
 *
 *  Not exported — every consumer that needs a glCode either reads it
 *  off persisted receivers (post-seed) or goes through CAP_CENTER_GLCODES
 *  (centers). When a second jurisdiction lands this map forks per
 *  jurisdiction; InstDeptCode itself stays universal. */
const SEED_DEPT_GLCODES: Record<InstDeptCode, string> = {
  // Indirect cost centers
  BLDG_USE: "011-1800",
  EQUIP:    "011-1900",
  COUNCIL:  "011-1100",
  CMGR:     "011-1200",
  CLERK:    "011-1300",
  FAS:      "011-1400",
  ATTY:     "011-1500",
  INS:      "011-1600",
  CMTE:     "011-1700",
  // Direct operating divisions
  PLAN:  "011-3100",
  BLDG:  "011-3200",
  ENG:   "011-3300",
  PW:    "011-3400",
  PARKS: "011-3500",
  PD:    "011-3600",
  FIRE:  "011-3700",
};

/** Indirect-center GL codes, keyed by display name. The persisted store
 *  is still name-keyed (capCenterGlCodes is `Record<centerName, glCode>`),
 *  so this projection bridges the canonical code-keyed map above to the
 *  name-keyed shape every store consumer expects. Without it, centers
 *  resolve to synth `seed:center:*` keys and can't reconcile against
 *  imported per-center allocations. */
export const CAP_CENTER_GLCODES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const dept of INST_DEPTS) {
    if (dept.kind === "indirect") out[dept.name] = SEED_DEPT_GLCODES[dept.code];
  }
  return out;
})();

// Each center's pools sum to its source-department cost. allocationPercent
// is derived from amount/centerTotal at seed time, then becomes the source
// of truth for the "%" column. amount stays in sync via store actions.
//
// centerGlCode is stamped onto every seed pool via INDIRECT_CODE_BY_NAME +
// SEED_DEPT_GLCODES so the engine can route by glCode without going
// through the name-resolver. Centers whose display name doesn't appear
// in INST_DEPTS get no glCode (defensive — every LAH center should
// resolve, but the field stays optional in this PR).
export const CAP_POOLS: CapPool[] = ([
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
] as CapPool[]).map((p) => {
  const code = INDIRECT_CODE_BY_NAME.get(p.center);
  const glCode = code ? SEED_DEPT_GLCODES[code] : undefined;
  return glCode ? { ...p, centerGlCode: glCode } : p;
});

/** Source department cost per cost center — the 100% reference for each
 *  pool's allocationPercent. Keyed by centerGlCode (the canonical center
 *  identity) so state shape matches the store's glCode-keyed center maps.
 *  Computed once from the seed CAP_POOLS so the initial state is
 *  internally consistent; user edits to center totals rescale all member
 *  pools proportionally. */
export const CAP_CENTER_TOTALS: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const p of CAP_POOLS) {
    const key = p.centerGlCode;
    if (!key) continue;
    map[key] = (map[key] ?? 0) + p.amount;
  }
  return map;
})();

/** Seed center metadata, keyed by centerGlCode. Pair with CAP_CENTER_TOTALS
 *  to populate the store's glCode-keyed `capCenterSources` map at module
 *  init time. */
export const CAP_CENTER_SOURCES_SEED: Record<string, { name: string }> = (() => {
  const out: Record<string, { name: string }> = {};
  for (const p of CAP_POOLS) {
    const key = p.centerGlCode;
    if (!key || out[key]) continue;
    out[key] = { name: p.center };
  }
  return out;
})();

/** Seed per-basis allocation schedules. One BasisUnitRow per non-DIRECT
 *  seed basis that a CAP_POOLS entry references; receivers + units are
 *  pulled from BASIS_DRIVERS (in INST_DEPTS order) and stamped with the
 *  display name from the institutional-dept registry, so the seed
 *  step-down has a ready-to-run schedule with GL codes attached — no
 *  AI import needed to see end-to-end routing. */
export const CAP_BASIS_UNITS: BasisUnitRow[] = (() => {
  const usedBasisIds = new Set(CAP_POOLS.map((p) => p.basisId));
  const seedDriverKeys = new Set<string>(
    Object.values(BASIS_DRIVERS).flatMap((cell) => Object.keys(cell)),
  );
  const isSeedDriverKey = (key: string): key is AllocationBasisKey => seedDriverKeys.has(key);
  const rows: BasisUnitRow[] = [];
  for (const basis of SEED_ALLOCATION_BASES) {
    if (!usedBasisIds.has(basis.id)) continue;
    if (basis.driverKey === "DIRECT") continue;
    if (!isSeedDriverKey(basis.driverKey)) continue;
    const driverKey: AllocationBasisKey = basis.driverKey;
    const receivers = INST_DEPTS.flatMap((dept) => {
      const v = BASIS_DRIVERS[dept.code]?.[driverKey];
      if (v == null || v <= 0) return [];
      const glCode = SEED_DEPT_GLCODES[dept.code];
      if (!glCode) return [];
      return [{ glCode, dept: dept.name, deptCode: dept.code, units: v }];
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
        glCode: SEED_DEPT_GLCODES.PARKS,
        dept: "Parks & Recreation",
        deptCode: "PARKS",
        percent: 100,
      },
    ],
  },
];
