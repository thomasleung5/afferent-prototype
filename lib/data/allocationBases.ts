/* Denominator matrix for the CAP allocation bases. Each row is a department
 * (indirect cost centers first, fee-modeled direct depts second); each column
 * is one of the allocation bases referenced by the pool inventory.
 *
 * Values are the department's share of the denominator (FTE counts, sq ft,
 * payroll transactions, agenda items, etc.). Empty cells mean the basis
 * doesn't apply to that department (e.g. an indirect dept that doesn't
 * occupy Town Hall has no SQFT share).
 *
 * Source: Town of Los Altos Hills CAP workbook, FY 2025–26. */

export const ALLOCATION_BASES = [
  { key: "FTE",      label: "FTE",       unit: "FTE",     fmt: "decimal", note: "FY 24/25 budgeted FTE" },
  { key: "EXPEND",   label: "EXPEND",    unit: "$000",    fmt: "k",       note: "Budgeted expenditures excl. debt, capital, transfers" },
  { key: "EXPEND_X", label: "EXPEND_X",  unit: "$000",    fmt: "k",       note: "Budgeted expenditures excl. Planning, Building, Engineering" },
  { key: "PAYROLL",  label: "PAYROLL",   unit: "txns/yr", fmt: "int",     note: "Payroll transactions, FY 23/24" },
  { key: "ACCT",     label: "ACCT",      unit: "txns/yr", fmt: "int",     note: "Accounting transactions, FY 23/24" },
  { key: "AGENDA",   label: "AGENDA",    unit: "items/yr",fmt: "int",     note: "Council agenda item count, FY 23/24" },
  { key: "PRA",      label: "PRA",       unit: "req/yr",  fmt: "int",     note: "Public records requests, FY 23/24" },
  { key: "CONTRACT", label: "CONTRACT",  unit: "count/yr",fmt: "int",     note: "Contracts executed, FY 23/24" },
  { key: "SQFT",     label: "SQFT",      unit: "sq ft",   fmt: "int",     note: "Town Hall sq ft occupied" },
  { key: "VEHICLE",  label: "VEHICLE",   unit: "$000",    fmt: "k",       note: "Vehicle depreciation, FY 23/24" },
  { key: "COMMITS",  label: "COMMITS",   unit: "count",   fmt: "int",     note: "Standing committees supported" },
] as const;

export type AllocationBasisKey = (typeof ALLOCATION_BASES)[number]["key"];

export interface BasisRow {
  code: string;
  name: string;
  group: "indirect" | "direct";
  values: Partial<Record<AllocationBasisKey, number>>;
}

/* Indirect cost centers — listed in the CAP step-down sequence. */
const INDIRECT: BasisRow[] = [
  {
    code: "BLDG_USE", name: "Building Use", group: "indirect",
    values: { SQFT: 0 }, // Building Use IS the SQFT pool — itself owns no consuming share.
  },
  {
    code: "EQUIP", name: "Equipment Use", group: "indirect",
    values: { VEHICLE: 0 },
  },
  {
    code: "COUNCIL", name: "City Council", group: "indirect",
    values: { FTE: 0, EXPEND: 412, EXPEND_X: 412, AGENDA: 0, COMMITS: 0 },
  },
  {
    code: "CMGR", name: "City Manager", group: "indirect",
    values: {
      FTE: 3.0, EXPEND: 1100, EXPEND_X: 1100,
      PAYROLL: 86, ACCT: 410, AGENDA: 38, PRA: 14, CONTRACT: 22,
      SQFT: 980, VEHICLE: 4, COMMITS: 0,
    },
  },
  {
    code: "CLERK", name: "City Clerk", group: "indirect",
    values: {
      FTE: 1.5, EXPEND: 312, EXPEND_X: 312,
      PAYROLL: 42, ACCT: 196, AGENDA: 0, PRA: 0, CONTRACT: 18,
      SQFT: 420, VEHICLE: 0, COMMITS: 0,
    },
  },
  {
    code: "FAS", name: "Finance & Admin Services", group: "indirect",
    values: {
      FTE: 4.0, EXPEND: 1218, EXPEND_X: 1218,
      PAYROLL: 0, ACCT: 0, AGENDA: 12, PRA: 6, CONTRACT: 0,
      SQFT: 1180, VEHICLE: 3, COMMITS: 0,
    },
  },
  {
    code: "ATTY", name: "City Attorney", group: "indirect",
    values: { EXPEND: 180, EXPEND_X: 180, AGENDA: 22, CONTRACT: 28, PRA: 4 },
  },
  {
    code: "INS", name: "Insurance", group: "indirect",
    values: { EXPEND: 400, EXPEND_X: 400 },
  },
  {
    code: "CMTE", name: "Committees", group: "indirect",
    values: { AGENDA: 36, COMMITS: 0 },
  },
];

/* Direct (fee-modeled) departments. */
const DIRECT: BasisRow[] = [
  {
    code: "PLAN", name: "Planning", group: "direct",
    values: {
      FTE: 4.5, EXPEND: 1280, EXPEND_X: 0,
      PAYROLL: 124, ACCT: 612, AGENDA: 84, PRA: 92, CONTRACT: 36,
      SQFT: 1480, VEHICLE: 8, COMMITS: 2,
    },
  },
  {
    code: "BLDG", name: "Building", group: "direct",
    values: {
      FTE: 6.0, EXPEND: 1605, EXPEND_X: 0,
      PAYROLL: 168, ACCT: 818, AGENDA: 24, PRA: 38, CONTRACT: 24,
      SQFT: 1860, VEHICLE: 18, COMMITS: 1,
    },
  },
  {
    code: "ENG", name: "Engineering", group: "direct",
    values: {
      FTE: 2.5, EXPEND: 720, EXPEND_X: 0,
      PAYROLL: 68, ACCT: 354, AGENDA: 16, PRA: 22, CONTRACT: 14,
      SQFT: 780, VEHICLE: 12, COMMITS: 1,
    },
  },
];

export const ALLOCATION_BASIS_ROWS: BasisRow[] = [...INDIRECT, ...DIRECT];
