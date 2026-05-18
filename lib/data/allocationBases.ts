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
  { key: "FTE",      label: "FTE",       longName: "Full-Time Equivalents",                       unit: "FTE",     unitLong: "Budgeted FTE",                       fmt: "decimal", note: "FY 24/25 budgeted FTE" },
  { key: "EXPEND",   label: "EXPEND",    longName: "Operating Expenditures",                      unit: "$000",    unitLong: "Thousands of dollars",               fmt: "k",       note: "Budgeted expenditures excl. debt, capital, transfers" },
  { key: "EXPEND_X", label: "EXPEND_X",  longName: "Operating Expenditures (excl. Dev Services)", unit: "$000",    unitLong: "Thousands of dollars",               fmt: "k",       note: "Budgeted expenditures excl. Planning, Building, Engineering" },
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

export interface BasisRow {
  code: string;
  name: string;
  group: "indirect" | "direct";
  values: Partial<Record<AllocationBasisKey, number>>;
}

/* Indirect cost centers — listed in the CAP step-down sequence. */
/* EXPEND / EXPEND_X / VEHICLE values are stored as RAW DOLLARS (not $K) so
 * the seed and AI-imported receivers share one unit convention; the
 * Allocation Bases formatter no longer needs to scale. */
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
    values: { FTE: 0, EXPEND: 412000, EXPEND_X: 412000, AGENDA: 0, COMMITS: 0 },
  },
  {
    code: "CMGR", name: "City Manager", group: "indirect",
    values: {
      FTE: 3.0, EXPEND: 1100000, EXPEND_X: 1100000,
      PAYROLL: 86, ACCT: 410, AGENDA: 38, PRA: 14, CONTRACT: 22,
      SQFT: 980, VEHICLE: 4000, COMMITS: 0,
    },
  },
  {
    code: "CLERK", name: "City Clerk", group: "indirect",
    values: {
      FTE: 1.5, EXPEND: 312000, EXPEND_X: 312000,
      PAYROLL: 42, ACCT: 196, AGENDA: 0, PRA: 0, CONTRACT: 18,
      SQFT: 420, VEHICLE: 0, COMMITS: 0,
    },
  },
  {
    code: "FAS", name: "Finance & Admin Services", group: "indirect",
    values: {
      FTE: 4.0, EXPEND: 1218000, EXPEND_X: 1218000,
      PAYROLL: 0, ACCT: 0, AGENDA: 12, PRA: 6, CONTRACT: 0,
      SQFT: 1180, VEHICLE: 3000, COMMITS: 0,
    },
  },
  {
    code: "ATTY", name: "City Attorney", group: "indirect",
    values: { EXPEND: 180000, EXPEND_X: 180000, AGENDA: 22, CONTRACT: 28, PRA: 4 },
  },
  {
    code: "INS", name: "Insurance", group: "indirect",
    values: { EXPEND: 400000, EXPEND_X: 400000 },
  },
  {
    code: "CMTE", name: "Committees", group: "indirect",
    values: { AGENDA: 36, COMMITS: 0 },
  },
];

/* Direct departments — fee-modeled + every other direct dept that
 * receives a step-down share of citywide overhead. */
const DIRECT: BasisRow[] = [
  {
    code: "PLAN", name: "Planning", group: "direct",
    values: {
      FTE: 4.5, EXPEND: 1280000, EXPEND_X: 0,
      PAYROLL: 124, ACCT: 612, AGENDA: 84, PRA: 92, CONTRACT: 36,
      SQFT: 1480, VEHICLE: 8000, COMMITS: 2,
    },
  },
  {
    code: "BLDG", name: "Building", group: "direct",
    values: {
      FTE: 6.0, EXPEND: 1605000, EXPEND_X: 0,
      PAYROLL: 168, ACCT: 818, AGENDA: 24, PRA: 38, CONTRACT: 24,
      SQFT: 1860, VEHICLE: 18000, COMMITS: 1,
    },
  },
  {
    code: "ENG", name: "Engineering", group: "direct",
    values: {
      FTE: 2.5, EXPEND: 720000, EXPEND_X: 0,
      PAYROLL: 68, ACCT: 354, AGENDA: 16, PRA: 22, CONTRACT: 14,
      SQFT: 780, VEHICLE: 12000, COMMITS: 1,
    },
  },
  {
    code: "PW", name: "Public Works", group: "direct",
    values: {
      FTE: 4.2, EXPEND: 890000, EXPEND_X: 890000,
      PAYROLL: 105, ACCT: 155, AGENDA: 9, PRA: 6, CONTRACT: 44,
      SQFT: 920, VEHICLE: 124000, COMMITS: 1,
    },
  },
  {
    code: "PARKS", name: "Parks & Recreation", group: "direct",
    values: {
      FTE: 1.5, EXPEND: 340000, EXPEND_X: 340000,
      PAYROLL: 38, ACCT: 72, AGENDA: 8, PRA: 5, CONTRACT: 21,
      SQFT: 240, VEHICLE: 18000, COMMITS: 2,
    },
  },
  {
    code: "PD", name: "Police Services", group: "direct",
    values: {
      FTE: 0.5, EXPEND: 720000, EXPEND_X: 720000,
      PAYROLL: 15, ACCT: 45, AGENDA: 5, PRA: 3, CONTRACT: 8,
      SQFT: 180, VEHICLE: 6000, COMMITS: 0,
    },
  },
  {
    code: "FIRE", name: "Fire Prevention", group: "direct",
    values: {
      FTE: 0.2, EXPEND: 234000, EXPEND_X: 234000,
      PAYROLL: 8, ACCT: 18, AGENDA: 2, PRA: 1, CONTRACT: 6,
      SQFT: 140, VEHICLE: 3000, COMMITS: 1,
    },
  },
];

export const ALLOCATION_BASIS_ROWS: BasisRow[] = [...INDIRECT, ...DIRECT];
