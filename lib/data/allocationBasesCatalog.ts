// Seed catalog of named allocation bases — Los Altos Hills FY 24/25 CAP.
// Mirrors the bases section of the published CAP bundle exactly: 15 named
// denominators, one DIRECT routing entry. Users can extend at runtime via
// the AllocationBasisCombobox; that state lives in BuildState.allocationBases.
//
// driverKey controls which column of the DRIVERS matrix (lib/data/capBasisRouting.ts)
// supplies the denominator when a pool with this basis is stepped down — but
// because every basis below has a corresponding BasisUnitRow in
// lib/data/cap.ts:CAP_BASIS_UNITS, the engine's fallback path almost never
// fires for seed pools.

import type { AllocationBasis } from "@/lib/types";

const SEED_AT = "2026-05-17T00:00:00.000Z";

export const SEED_ALLOCATION_BASES: AllocationBasis[] = [
  { id: "bas-fte-th-occupy",     name: "FY 24/25 Budgeted FTE Occupying Town Hall",
    source: "Allocations 3.2025 NBS.xlsx",
    driverKey: "FTE",      validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-direct-pr",         name: "Direct to Parks and Recreation",
    source: "Manual assignment",
    driverKey: "DIRECT",   directTo: "PARKS", validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-vehicle-dep",       name: "FY 23/24 Vehicle Depreciation Expense by Department",
    source: "Vehicle Listing - Dept usage_NBS.xlsx",
    driverKey: "EXPEND",   validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-agenda-count",      name: "FY 23/24 Agenda Item Count per Fund, Department, and/or Division",
    source: "Agenda Items by Dept.Fund.Program FY 23-24_NBS.xlsx",
    driverKey: "AGENDA",   validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-op-expend",         name: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers)",
    source: "Detail vs Budget Report FY 24-25 7.1-12.31.24_NBS.xlsx",
    driverKey: "EXPEND",   validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-op-expend-x",       name: "FY 24/25 Budgeted Expenditures per Fund, Department, and/or Division (excl. debt, capital outlay, transfers) - Excluding Planning, Building, & Engineering",
    source: "Detail vs Budget Report FY 24-25 7.1-12.31.24_NBS.xlsx",
    driverKey: "EXPEND_X", validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-pra-count",         name: "FY 23/24 Public Records Act (PRA) Requests per Fund, Department, and/or Division",
    source: "5.2 PRAs by Program.xlsx",
    driverKey: "PRA",      validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-contracts-count",   name: "FY 23/24 Contracts Count per Fund, Department, and/or Division",
    source: "5.3 Contracts per Program.xlsx",
    driverKey: "CONTRACT", validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-fte-budget",        name: "FY 24/25 Budgeted FTE per Fund, Department, and/or Division",
    source: "Allocations 3.2025 NBS",
    driverKey: "FTE",      validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-payroll-tx",        name: "FY 23/24 Number of Payroll Transactions excluding Payroll per Fund, Department, and/or Division",
    source: "Los Altos Hills _Count of Transactions.pdf",
    driverKey: "PAYROLL",  validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-acct-tx",           name: "FY 23/24 Number of Accounting Transactions per Fund, Department, and/or Division",
    source: "6.4 JE count by Dept request.xlsx & 6.4 Invoices by Program.xlsx",
    driverKey: "ACCT",     validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-committees-supp",   name: "Number of Committees Supported per Department",
    source: "Committees 3.20.25.xlsx",
    driverKey: "COMMITS",  validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-salary-dist",       name: "FY 24/25 Salary Cost Distribution per Fund, Department, and/or Division",
    source: "Detail vs Budget Report FY 24-25 7.1-12.31.24_NBS",
    driverKey: "PAYROLL",  validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-op-expend-pw",      name: "FY 24/25 Budgeted Expenditures (PW Departments Only)",
    source: "Detail vs Budget Report FY 24-25 7.1-12.31.24_NBS",
    driverKey: "EXPEND_PW",validationStatus: "verified", createdAt: SEED_AT },
  { id: "bas-vehicles-maint",    name: "FY 23/24 Vehicles Maintained per Department",
    source: "CapAssets_All_listing_CostAllocation_Nicole_04.01.2025_NBS",
    driverKey: "VEHICLE",  validationStatus: "verified", createdAt: SEED_AT },
];
