import type { CapAllocation, CapPool, DeptCode } from "../types";

/* Source: data-extended.jsx CAP_POOLS (Town of Los Altos Hills CAP, Sept 4 2025).
 * The full step-down engine isn't ported yet — we surface the pre-computed
 * allocations per direct department instead. */

export const CAP_POOLS: CapPool[] = [
  { id: "cap-bldguse-th", center: "Building Use",                      pool: "Town Hall",                                         amount: 122030, basisId: "bas-sqft",        basis: "Square footage",                              receiving: "Multiple departments", recoverability: "Recoverable where fee-related", review: "Reviewed" },
  { id: "cap-bldguse-pr", center: "Building Use",                      pool: "Parks and Recreation",                              amount:   8608, basisId: "bas-direct",      basis: "Direct allocation",                           receiving: "Parks and Recreation", recoverability: "Out of fee scope",              review: "Reviewed" },
  { id: "cap-equip",      center: "Equipment Use",                     pool: "Vehicle / Equipment Operations",                    amount:  37315, basisId: "bas-vehicle",     basis: "Vehicle depreciation",                        receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-council",    center: "City Council",                      pool: "Council / Legislative",                             amount: 404077, basisId: "bas-agenda",      basis: "Agenda item count",                           receiving: "Multiple departments", recoverability: "Excluded — public benefit",     review: "Reviewed" },
  { id: "cap-cm-leg",     center: "City Manager",                      pool: "Council / Legislative Support",                     amount: 550205, basisId: "bas-agenda",      basis: "Agenda item count",                           receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Review" },
  { id: "cap-cm-twdev",   center: "City Manager",                      pool: "Town-wide Operations Mgmt — Including Development", amount: 425015, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-cm-twxdev",  center: "City Manager",                      pool: "Town-wide Operations Mgmt — Excluding Development", amount: 125189, basisId: "bas-op-expend-x", basis: "Operating expenditures (excl. development)",  receiving: "Multiple departments", recoverability: "Excluded — non-development",    review: "Reviewed" },
  { id: "cap-clerk",      center: "City Clerk",                        pool: "Records & Public Information",                      amount: 239406, basisId: "bas-pra",         basis: "PRA request count",                           receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-hr",     center: "Finance & Administrative Services", pool: "Human Resources",                                   amount:  69193, basisId: "bas-fte-budget",  basis: "Budgeted FTE",                                receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-pay",    center: "Finance & Administrative Services", pool: "Payroll",                                           amount:  78938, basisId: "bas-payroll-tx",  basis: "Payroll transactions",                        receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-acct",   center: "Finance & Administrative Services", pool: "Town-wide Accounting Support",                      amount: 485323, basisId: "bas-acct-tx",     basis: "Accounting transactions",                     receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-fas-proc",   center: "Finance & Administrative Services", pool: "Contracts & Procurement",                           amount: 341090, basisId: "bas-contracts",   basis: "Contract count",                              receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-atty",       center: "City Attorney",                     pool: "Town-wide Support",                                 amount: 180000, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Legal review recommended",      review: "Review" },
  { id: "cap-ins",        center: "Insurance",                         pool: "Town-wide Liability Support",                       amount: 400000, basisId: "bas-op-expend",   basis: "Operating expenditures",                      receiving: "Multiple departments", recoverability: "Partially recoverable",         review: "Reviewed" },
  { id: "cap-cmte",       center: "Committees",                        pool: "Boards & Committees",                               amount: 239994, basisId: "bas-committees",  basis: "Number of committees",                        receiving: "Multiple departments", recoverability: "Excluded — public benefit",     review: "Reviewed" },
];

/** Final CAP allocation per direct department (from the legacy CAP_IMPACT rollup). */
export const CAP_ALLOCATION: Record<DeptCode, CapAllocation> = {
  PLAN: { dept: "PLAN", allocated: 420000 },
  BLDG: { dept: "BLDG", allocated: 510000 },
  ENG:  { dept: "ENG",  allocated: 190000 },
};
