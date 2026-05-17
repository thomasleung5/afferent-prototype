// Seed catalog of named allocation bases. Users can extend at runtime via
// the AllocationBasisCombobox; that state lives in BuildState.allocationBases.
//
// The 14 canonical entries are the standardized bases requested by the user.
// The trailing 5 (VEHICLE / EXPEND_X / PRA / COMMITS / DIRECT) exist so every
// pool in the seed CAP_POOLS has a catalog entry to point at — without them,
// legacy pools would dangle.

import type { AllocationBasis } from "@/lib/types";

const SEED_AT = "2026-05-17T00:00:00.000Z";

export const SEED_ALLOCATION_BASES: AllocationBasis[] = [
  // ── canonical 14 (user-listed) ──────────────────────────────────────────
  { id: "bas-fte-budget",   name: "Budgeted FTE",             source: "HRIS budget worksheet",       validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-fte-actual",   name: "Actual FTE",               source: "Payroll system",              validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-salaries",     name: "Salaries",                 source: "Payroll system",              validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-payroll-tx",   name: "Payroll transactions",     source: "Finance ledger",              validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-ap-invoices",  name: "AP invoices",              source: "Finance ledger",              validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-agenda",       name: "Agenda item count",        source: "Clerk annual report",         validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-contracts",    name: "Contract count",           source: "Procurement system",          validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-sqft",         name: "Square footage",           source: "Facilities inventory",        validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-labor-hours",  name: "Direct labor hours",       source: "Time tracking",               validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-permits",      name: "Permit volume",            source: "Permit system",               validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-op-expend",    name: "Operating expenditures",   source: "Budget book",                 validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-acct-tx",      name: "Accounting transactions",  source: "GL extract",                  validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-time-study",   name: "Time study %",             source: "Annual time survey",          validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-population",   name: "Population",               source: "DOF demographic estimates",   validationStatus: "verified", createdAt: SEED_AT },

  // ── additional entries needed by the existing CAP_POOLS seed ────────────
  { id: "bas-vehicle",      name: "Vehicle depreciation",     source: "Fleet inventory",             validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-op-expend-x",  name: "Operating expenditures (excl. development)", source: "Budget book", validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-pra",          name: "PRA request count",        source: "Clerk records log",           validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-committees",   name: "Number of committees",     source: "Council records",             validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-direct",       name: "Direct allocation",        source: "Manual assignment",           validationStatus: "verified", createdAt: SEED_AT },
];
