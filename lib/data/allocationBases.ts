/* Allocation-basis column metadata + the per-dept driver-unit matrix.
 *
 * ALLOCATION_BASES is the column catalog — label/unit/format info every
 * basis the UI ever displays. Source-of-truth for the AllocationBasisKey
 * union.
 *
 * BASIS_DRIVERS is the dept × basis denominator matrix. Each key is an
 * InstDeptCode (the institutional-dept catalog is the registry); each
 * value is the dept's share of every basis denominator it participates
 * in. Empty / omitted cells mean the basis doesn't apply to that dept
 * (e.g. an indirect dept that doesn't occupy Town Hall has no SQFT share).
 *
 * Display name + indirect-vs-direct grouping for each dept come from
 * INST_DEPTS at the use site — they are NOT repeated here.
 *
 * Source: Town of Los Altos Hills CAP workbook, FY 2025–26. */

import type { InstDeptCode } from "./institutionalDepts";

export const ALLOCATION_BASES = [
  { key: "FTE",      label: "FTE",       longName: "Full-Time Equivalents",                       unit: "FTE",     unitLong: "Budgeted FTE",                       fmt: "decimal", note: "FY 24/25 budgeted FTE" },
  { key: "EXPEND",   label: "EXPEND",    longName: "Operating Expenditures",                      unit: "$000",    unitLong: "Thousands of dollars",               fmt: "k",       note: "Budgeted expenditures excl. debt, capital, transfers" },
  { key: "EXPEND_X", label: "EXPEND_X",  longName: "Operating Expenditures (excl. Dev Services)", unit: "$000",    unitLong: "Thousands of dollars",               fmt: "k",       note: "Budgeted expenditures excl. Planning, Building, Engineering" },
  { key: "EXPEND_PW",label: "EXPEND_PW", longName: "Operating Expenditures (PW Departments Only)",unit: "$000",    unitLong: "Thousands of dollars",               fmt: "k",       note: "Budgeted expenditures of Public Works departments only" },
  { key: "PAYROLL",  label: "PAYROLL",   longName: "Payroll Transactions per Year",               unit: "txns/yr", unitLong: "Payroll transactions per year",      fmt: "int",     note: "Payroll transactions, FY 23/24" },
  { key: "ACCT",     label: "ACCT",      longName: "Accounting Transactions per Year",            unit: "txns/yr", unitLong: "Accounting transactions per year",   fmt: "int",     note: "Accounting transactions, FY 23/24" },
  { key: "AGENDA",   label: "AGENDA",    longName: "Council Agenda Items per Year",               unit: "items/yr",unitLong: "Council agenda items per year",      fmt: "int",     note: "Council agenda item count, FY 23/24" },
  { key: "PRA",      label: "PRA",       longName: "Public Records Requests per Year",            unit: "req/yr",  unitLong: "Public records requests per year",   fmt: "int",     note: "Public records requests, FY 23/24" },
  { key: "CONTRACT", label: "CONTRACT",  longName: "Contracts Executed per Year",                 unit: "count/yr",unitLong: "Contracts executed per year",        fmt: "int",     note: "Contracts executed, FY 23/24" },
  { key: "SQFT",     label: "SQFT",      longName: "Town Hall Square Footage",                    unit: "sq ft",   unitLong: "Square feet occupied",               fmt: "int",     note: "Town Hall sq ft occupied" },
  { key: "VEHICLE",  label: "VEHICLE",   longName: "Vehicle Depreciation",                        unit: "$000",    unitLong: "Thousands of dollars",               fmt: "k",       note: "Vehicle depreciation, FY 23/24" },
  { key: "COMMITS",  label: "COMMITS",   longName: "Standing Committees Supported",               unit: "count",   unitLong: "Committee count",                    fmt: "int",     note: "Standing committees supported" },
] as const;

export type AllocationBasisKey = (typeof ALLOCATION_BASES)[number]["key"];

/** Dept × basis denominator units, keyed on InstDeptCode. Iterate in
 *  INST_DEPTS order at the use site so callers preserve the canonical
 *  indirect-then-direct sequence.
 *
 *  EXPEND / EXPEND_X / VEHICLE values are stored as RAW DOLLARS (not $K)
 *  so seed and AI-imported receivers share one unit convention; the
 *  Allocation Bases formatter does no scaling.
 *
 *  Building Use IS the SQFT pool — its own SQFT share is 0 by design so
 *  the pool doesn't allocate to itself. Same idea for EQUIP × VEHICLE. */
export const BASIS_DRIVERS: Record<InstDeptCode, Partial<Record<AllocationBasisKey, number>>> = {
  // Indirect cost centers
  BLDG_USE: { SQFT: 0 },
  EQUIP:    { VEHICLE: 0 },
  COUNCIL:  { FTE: 0,   EXPEND:  412000, EXPEND_X:  412000, AGENDA: 0, COMMITS: 0 },
  CMGR:     { FTE: 3.0, EXPEND: 1100000, EXPEND_X: 1100000, PAYROLL:  86, ACCT: 410, AGENDA: 38, PRA: 14, CONTRACT: 22, SQFT:  980, VEHICLE:   4000, COMMITS: 0 },
  CLERK:    { FTE: 1.5, EXPEND:  312000, EXPEND_X:  312000, PAYROLL:  42, ACCT: 196, AGENDA:  0, PRA:  0, CONTRACT: 18, SQFT:  420, VEHICLE:      0, COMMITS: 0 },
  FAS:      { FTE: 4.0, EXPEND: 1218000, EXPEND_X: 1218000, PAYROLL:   0, ACCT:   0, AGENDA: 12, PRA:  6, CONTRACT:  0, SQFT: 1180, VEHICLE:   3000, COMMITS: 0 },
  ATTY:     {           EXPEND:  180000, EXPEND_X:  180000,                          AGENDA: 22, PRA:  4, CONTRACT: 28                                            },
  INS:      {           EXPEND:  400000, EXPEND_X:  400000                                                                                                          },
  CMTE:     {                                                                        AGENDA: 36,                                                          COMMITS: 0 },
  // Direct departments — fee-modeled + every other direct dept that
  // receives a step-down share of citywide overhead.
  PLAN:     { FTE: 4.5, EXPEND: 1280000, EXPEND_X:       0, PAYROLL: 124, ACCT: 612, AGENDA: 84, PRA: 92, CONTRACT: 36, SQFT: 1480, VEHICLE:   8000, COMMITS: 2 },
  BLDG:     { FTE: 6.0, EXPEND: 1605000, EXPEND_X:       0, PAYROLL: 168, ACCT: 818, AGENDA: 24, PRA: 38, CONTRACT: 24, SQFT: 1860, VEHICLE:  18000, COMMITS: 1 },
  ENG:      { FTE: 2.5, EXPEND:  720000, EXPEND_X:       0, PAYROLL:  68, ACCT: 354, AGENDA: 16, PRA: 22, CONTRACT: 14, SQFT:  780, VEHICLE:  12000, COMMITS: 1 },
  PW:       { FTE: 4.2, EXPEND:  890000, EXPEND_X:  890000, EXPEND_PW: 890000, PAYROLL: 105, ACCT: 155, AGENDA:  9, PRA: 6, CONTRACT: 44, SQFT: 920, VEHICLE: 124000, COMMITS: 1 },
  PARKS:    { FTE: 1.5, EXPEND:  340000, EXPEND_X:  340000, PAYROLL:  38, ACCT:  72, AGENDA:  8, PRA:  5, CONTRACT: 21, SQFT:  240, VEHICLE:  18000, COMMITS: 2 },
  PD:       { FTE: 0.5, EXPEND:  720000, EXPEND_X:  720000, PAYROLL:  15, ACCT:  45, AGENDA:  5, PRA:  3, CONTRACT:  8, SQFT:  180, VEHICLE:   6000, COMMITS: 0 },
  FIRE:     { FTE: 0.2, EXPEND:  234000, EXPEND_X:  234000, PAYROLL:   8, ACCT:  18, AGENDA:  2, PRA:  1, CONTRACT:  6, SQFT:  140, VEHICLE:   3000, COMMITS: 1 },
};
