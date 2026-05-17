import type { CapAllocation, CapPool, DeptCode } from "../types";

/* Source: data-extended.jsx CAP_POOLS (Town of Los Altos Hills CAP, Sept 4 2025).
 * The full step-down engine isn't ported yet — we surface the pre-computed
 * allocations per direct department instead. */

// Each center's pools sum to its source-department cost. allocationPercent
// is derived from amount/centerTotal at seed time, then becomes the source
// of truth for the "%" column. amount stays in sync via store actions.
export const CAP_POOLS: CapPool[] = [
  // Building Use (centerTotal = 130,638)
  { id: "cap-bldguse-th", center: "Building Use",                      pool: "Town Hall",                                         allocationPercent: 93.41, amount: 122030, eligiblePercent: 100, basisId: "bas-sqft",        basis: "Square footage",                              receiving: "Multiple departments", recoverability: "Recoverable where fee-related", review: "Reviewed" },
  { id: "cap-bldguse-pr", center: "Building Use",                      pool: "Parks and Recreation",                              allocationPercent:  6.59, amount:   8608, eligiblePercent:   0, basisId: "bas-direct",      basis: "Direct allocation",                           receiving: "Parks and Recreation", recoverability: "Out of fee scope",              review: "Reviewed" },
  // Equipment Use (centerTotal = 37,315)
  { id: "cap-equip",      center: "Equipment Use",                     pool: "Vehicle / Equipment Operations",                    allocationPercent: 100,    amount:  37315, eligiblePercent:  50, basisId: "bas-vehicle",     basis: "Vehicle depreciation",                        receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  // City Council (centerTotal = 404,077)
  { id: "cap-council",    center: "City Council",                      pool: "Council / Legislative",                             allocationPercent: 100,    amount: 404077, eligiblePercent:   0, basisId: "bas-agenda",      basis: "Agenda item count",                           receiving: "Multiple departments", recoverability: "Excluded — public benefit",     review: "Reviewed" },
  // City Manager (centerTotal = 1,100,409)
  { id: "cap-cm-leg",     center: "City Manager",                      pool: "Council / Legislative Support",                     allocationPercent: 50.00, amount: 550205, eligiblePercent:  30, basisId: "bas-agenda",      basis: "Agenda item count",                           receiving: "Multiple departments", recoverability: "Legislative support partially excluded under fee policy", review: "Review" },
  { id: "cap-cm-twdev",   center: "City Manager",                      pool: "Town-wide Operations Mgmt — Including Development", allocationPercent: 38.62, amount: 425015, eligiblePercent:  75, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-cm-twxdev",  center: "City Manager",                      pool: "Town-wide Operations Mgmt — Excluding Development", allocationPercent: 11.38, amount: 125189, eligiblePercent:   0, basisId: "bas-op-expend-x", basis: "Operating expenditures (excl. development)",  receiving: "Multiple departments", recoverability: "Non-development activities excluded", review: "Reviewed" },
  // City Clerk (centerTotal = 239,406)
  { id: "cap-clerk",      center: "City Clerk",                        pool: "Records & Public Information",                      allocationPercent: 100,    amount: 239406, eligiblePercent:  60, basisId: "bas-pra",         basis: "PRA request count",                           receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  // Finance & Administrative Services (centerTotal = 974,544)
  { id: "cap-fas-hr",     center: "Finance & Administrative Services", pool: "Human Resources",                                   allocationPercent:  7.10, amount:  69193, eligiblePercent:  80, basisId: "bas-fte-budget",  basis: "Budgeted FTE",                                receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-pay",    center: "Finance & Administrative Services", pool: "Payroll",                                           allocationPercent:  8.10, amount:  78938, eligiblePercent:  80, basisId: "bas-payroll-tx",  basis: "Payroll transactions",                        receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-acct",   center: "Finance & Administrative Services", pool: "Town-wide Accounting Support",                      allocationPercent: 49.80, amount: 485323, eligiblePercent:  80, basisId: "bas-acct-tx",     basis: "Accounting transactions",                     receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-proc",   center: "Finance & Administrative Services", pool: "Contracts & Procurement",                           allocationPercent: 35.00, amount: 341090, eligiblePercent:  80, basisId: "bas-contracts",   basis: "Contract count",                              receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  // City Attorney (centerTotal = 180,000)
  { id: "cap-atty",       center: "City Attorney",                     pool: "Town-wide Support",                                 allocationPercent: 100,    amount: 180000, eligiblePercent:  50, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Legal review recommended",      review: "Review" },
  // Insurance (centerTotal = 400,000)
  { id: "cap-ins",        center: "Insurance",                         pool: "Town-wide Liability Support",                       allocationPercent: 100,    amount: 400000, eligiblePercent:  80, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  // Committees (centerTotal = 239,994)
  { id: "cap-cmte",       center: "Committees",                        pool: "Boards & Committees",                               allocationPercent: 100,    amount: 239994, eligiblePercent:   0, basisId: "bas-committees",  basis: "Number of committees",                        receiving: "Multiple departments", recoverability: "Excluded — public benefit",     review: "Reviewed" },
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

/** Final CAP allocation per direct department (from the legacy CAP_IMPACT rollup). */
export const CAP_ALLOCATION: Record<DeptCode, CapAllocation> = {
  PLAN: { dept: "PLAN", allocated: 420000 },
  BLDG: { dept: "BLDG", allocated: 510000 },
  ENG:  { dept: "ENG",  allocated: 190000 },
};
