// Seed catalog of named allocation bases. Users can extend at runtime via
// the AllocationBasisCombobox; that state lives in BuildState.allocationBases.
//
// The 14 canonical entries are the standardized bases requested by the user.
// The trailing 5 (VEHICLE / EXPEND_X / PRA / COMMITS / DIRECT) exist so every
// pool in the seed CAP_POOLS has a catalog entry to point at — without them,
// legacy pools would dangle.

import type { AllocationBasis } from "@/lib/types";

const SEED_AT = "2026-05-17T00:00:00.000Z";

// driverKey controls which column of the DRIVERS matrix (lib/data/capStepDown.ts)
// supplies the denominator when a pool with this basis is stepped down. When
// the underlying driver type doesn't have a perfect existing column, we map to
// the closest available denominator — noted inline.
export const SEED_ALLOCATION_BASES: AllocationBasis[] = [
  // ── canonical 14 (user-listed) ──────────────────────────────────────────
  { id: "bas-fte-budget",   name: "Budgeted FTE",             source: "HRIS budget worksheet",       driverKey: "FTE",      validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-fte-actual",   name: "Actual FTE",               source: "Payroll system",              driverKey: "FTE",      validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-salaries",     name: "Salaries",                 source: "Payroll system",              driverKey: "PAYROLL",  validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-payroll-tx",   name: "Payroll transactions",     source: "Finance ledger",              driverKey: "PAYROLL",  validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-ap-invoices",  name: "AP invoices",              source: "Finance ledger",              driverKey: "EXPEND",   validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-agenda",       name: "Agenda item count",        source: "Clerk annual report",         driverKey: "AGENDA",   validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-contracts",    name: "Contract count",           source: "Procurement system",          driverKey: "CONTRACT", validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-sqft",         name: "Square footage",           source: "Facilities inventory",        driverKey: "SQFT",     validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-labor-hours",  name: "Direct labor hours",       source: "Time tracking",               driverKey: "FTE",      validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-permits",      name: "Permit volume",            source: "Permit system",               driverKey: "EXPEND",   validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-op-expend",    name: "Operating expenditures",   source: "Budget book",                 driverKey: "EXPEND",   validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-acct-tx",      name: "Accounting transactions",  source: "GL extract",                  driverKey: "ACCT",     validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-time-study",   name: "Time study %",             source: "Annual time survey",          driverKey: "FTE",      validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-population",   name: "Population",               source: "DOF demographic estimates",   driverKey: "EXPEND",   validationStatus: "verified", createdAt: SEED_AT },

  // ── additional entries needed by the existing CAP_POOLS seed ────────────
  { id: "bas-vehicle",      name: "Vehicle depreciation",     source: "Fleet inventory",             driverKey: "VEHICLE",  validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-op-expend-x",  name: "Operating expenditures (excl. development)", source: "Budget book", driverKey: "EXPEND_X", validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-op-expend-pw", name: "Operating expenditures (PW departments only)", source: "Budget book", driverKey: "EXPEND_PW", validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-pra",          name: "PRA request count",        source: "Clerk records log",           driverKey: "PRA",      validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-committees",   name: "Number of committees",     source: "Council records",             driverKey: "COMMITS",  validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-direct",       name: "Direct allocation",        source: "Manual assignment",           driverKey: "DIRECT",   directTo: "PARKS", validationStatus: "verified", createdAt: SEED_AT },
];
