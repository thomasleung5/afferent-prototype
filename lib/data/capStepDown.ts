/* Step-down CAP allocation engine.
 *
 * SCOPE: The Allocation Matrix view only. The rest of the app uses the narrow
 * `DeptCode` type (PLAN/BLDG/ENG) for fee-modeled departments; the matrix
 * shows the full institutional picture — every direct department that
 * receives a share of citywide overhead, even ones we don't model fees for.
 *
 * METHOD: Sequential elimination. Each pool starts on its home indirect dept
 * (Initial placement). Indirect depts are then "closed" in step-order: when
 * indirect I is closed, every pool currently sitting on I is pushed to all
 * departments BELOW it in the sequence — both remaining indirects and the
 * full direct list — proportional to the receivers' values for that pool's
 * basis. After every indirect is stepped down, all cost has settled on the
 * direct departments.
 *
 * Conservation: Σ pool.amount === Σ alloc2[pool][direct], up to FP rounding.
 */

import type { CapPool } from "../types";

// ---------------------------------------------------------------------------
// Departments (matrix-only)
// ---------------------------------------------------------------------------

export type MatrixDeptCode =
  // Indirect cost centers
  | "BLDG_USE" | "EQUIP" | "COUNCIL" | "CMGR" | "CLERK" | "FAS"
  | "ATTY" | "INS" | "CMTE"
  // Direct (fee-modeled or otherwise receiving final allocation)
  | "PLAN" | "BLDG" | "ENG" | "PW" | "PARKS" | "PD" | "FIRE";

export interface MatrixDept {
  code: MatrixDeptCode;
  name: string;
  kind: "indirect" | "direct";
}

/** Step-down order is set by the user via the StepDownSequence card (see
 *  BuildContext.capCenterOrder). The names below are the human-readable
 *  center names that order references; the codes are the matrix dept IDs. */
export const INDIRECT_DEPTS: MatrixDept[] = [
  { code: "BLDG_USE", name: "Building Use",                       kind: "indirect" },
  { code: "EQUIP",    name: "Equipment Use",                      kind: "indirect" },
  { code: "COUNCIL",  name: "City Council",                       kind: "indirect" },
  { code: "CMGR",     name: "City Manager",                       kind: "indirect" },
  { code: "CLERK",    name: "City Clerk",                         kind: "indirect" },
  { code: "FAS",      name: "Finance & Administrative Services",  kind: "indirect" },
  { code: "ATTY",     name: "City Attorney",                      kind: "indirect" },
  { code: "INS",      name: "Insurance",                          kind: "indirect" },
  { code: "CMTE",     name: "Committees",                         kind: "indirect" },
];

export const DIRECT_DEPTS: MatrixDept[] = [
  { code: "PLAN",  name: "Planning",          kind: "direct" },
  { code: "BLDG",  name: "Building",          kind: "direct" },
  { code: "ENG",   name: "Engineering",       kind: "direct" },
  { code: "PW",    name: "Public Works",      kind: "direct" },
  { code: "PARKS", name: "Parks & Recreation",kind: "direct" },
  { code: "PD",    name: "Police Services",   kind: "direct" },
  { code: "FIRE",  name: "Fire Prevention",   kind: "direct" },
];

export const ALL_DEPTS: MatrixDept[] = [...INDIRECT_DEPTS, ...DIRECT_DEPTS];

/** Center-name → indirect-dept code (matches CAP_POOLS.center text). */
export const CENTER_NAME_TO_CODE: Record<string, MatrixDeptCode> = {
  "Building Use":                      "BLDG_USE",
  "Equipment Use":                     "EQUIP",
  "City Council":                      "COUNCIL",
  "City Manager":                      "CMGR",
  "City Clerk":                        "CLERK",
  "Finance & Administrative Services": "FAS",
  "City Attorney":                     "ATTY",
  "Insurance":                         "INS",
  "Committees":                        "CMTE",
};

// ---------------------------------------------------------------------------
// Bases
// ---------------------------------------------------------------------------

export type BasisKey =
  | "FTE" | "EXPEND" | "EXPEND_X" | "PAYROLL" | "ACCT" | "AGENDA"
  | "PRA" | "CONTRACT" | "SQFT" | "VEHICLE" | "COMMITS" | "DIRECT";

/** Per-pool basis key + (for DIRECT) target dept. Pool IDs match CAP_POOLS.
 *  Looking up by id is the simplest stable mapping — the descriptive `basis`
 *  text on CapPool is for display, not computation. */
export const POOL_BASIS: Record<string, { basis: BasisKey; directTo?: MatrixDeptCode }> = {
  "cap-bldguse-th":  { basis: "SQFT" },
  "cap-bldguse-pr":  { basis: "DIRECT",   directTo: "PARKS" },
  "cap-equip":       { basis: "VEHICLE" },
  "cap-council":     { basis: "AGENDA" },
  "cap-cm-leg":      { basis: "AGENDA" },
  "cap-cm-twdev":    { basis: "EXPEND" },
  "cap-cm-twxdev":   { basis: "EXPEND_X" },
  "cap-clerk":       { basis: "PRA" },
  "cap-fas-hr":      { basis: "FTE" },
  "cap-fas-pay":     { basis: "PAYROLL" },
  "cap-fas-acct":    { basis: "ACCT" },
  "cap-fas-proc":    { basis: "CONTRACT" },
  "cap-atty":        { basis: "EXPEND" },
  "cap-ins":         { basis: "EXPEND" },
  "cap-cmte":        { basis: "COMMITS" },
};

/** Best-effort fallback: derive basis from the pool's descriptive text for
 *  pools that aren't in POOL_BASIS (e.g. AI-imported pools). */
function inferBasis(p: CapPool): BasisKey {
  const t = p.basis.toLowerCase();
  if (t.includes("fte"))             return "FTE";
  if (t.includes("agenda"))          return "AGENDA";
  if (t.includes("payroll"))         return "PAYROLL";
  if (t.includes("accounting"))      return "ACCT";
  if (t.includes("pra") || t.includes("records request")) return "PRA";
  if (t.includes("contract") || t.includes("procurement")) return "CONTRACT";
  if (t.includes("sq ft") || t.includes("square") || t.includes("occupying town hall")) return "SQFT";
  if (t.includes("vehicle") || t.includes("equipment depreciation")) return "VEHICLE";
  if (t.includes("committee"))       return "COMMITS";
  if (t.includes("excl. planning") || t.includes("excluding development")) return "EXPEND_X";
  if (t.includes("budgeted expend")) return "EXPEND";
  if (t.includes("direct"))          return "DIRECT";
  return "EXPEND";
}

export function basisForPool(p: CapPool): { basis: BasisKey; directTo?: MatrixDeptCode } {
  return POOL_BASIS[p.id] ?? { basis: inferBasis(p) };
}

// ---------------------------------------------------------------------------
// Drivers (department × basis denominators)
// ---------------------------------------------------------------------------

/** Driver values per department. Indirect rows are receivers too — a pool
 *  sitting on Finance can be stepped down to City Attorney if Attorney comes
 *  later in the sequence. Values are realistic for Los Altos Hills scale. */
export const DRIVERS: Record<MatrixDeptCode, Partial<Record<BasisKey, number>>> = {
  // Indirect
  BLDG_USE:  {},
  EQUIP:     {},
  COUNCIL:   { EXPEND: 412,  EXPEND_X: 412 },
  CMGR:      { FTE: 3.0,  EXPEND: 1100, EXPEND_X: 1100, PAYROLL:  86, ACCT: 410, AGENDA: 38, PRA: 14, CONTRACT: 22, SQFT:  980, VEHICLE:  4, COMMITS: 0 },
  CLERK:     { FTE: 1.5,  EXPEND:  312, EXPEND_X:  312, PAYROLL:  42, ACCT: 196, AGENDA:  0, PRA:  0, CONTRACT: 18, SQFT:  420, VEHICLE:  0, COMMITS: 0 },
  FAS:       { FTE: 4.0,  EXPEND: 1218, EXPEND_X: 1218, PAYROLL:   0, ACCT:   0, AGENDA: 12, PRA:  6, CONTRACT:  0, SQFT: 1180, VEHICLE:  3, COMMITS: 0 },
  ATTY:      { FTE: 0.0,  EXPEND:  180, EXPEND_X:  180, PAYROLL:   0, ACCT:   0, AGENDA: 22, PRA:  4, CONTRACT: 28, SQFT:  140, VEHICLE:  0, COMMITS: 0 },
  INS:       { EXPEND: 400, EXPEND_X: 400 },
  CMTE:      { AGENDA: 36, COMMITS: 0 },
  // Direct
  PLAN:      { FTE: 4.5,  EXPEND: 1280, EXPEND_X: 0, PAYROLL: 124, ACCT: 612, AGENDA: 84, PRA: 92, CONTRACT: 36, SQFT: 1480, VEHICLE:  8, COMMITS: 2 },
  BLDG:      { FTE: 6.0,  EXPEND: 1605, EXPEND_X: 0, PAYROLL: 168, ACCT: 818, AGENDA: 24, PRA: 38, CONTRACT: 24, SQFT: 1860, VEHICLE: 18, COMMITS: 1 },
  ENG:       { FTE: 2.5,  EXPEND:  720, EXPEND_X: 0, PAYROLL:  68, ACCT: 354, AGENDA: 16, PRA: 22, CONTRACT: 14, SQFT:  780, VEHICLE: 12, COMMITS: 1 },
  PW:        { FTE: 4.2,  EXPEND:  890, EXPEND_X: 890, PAYROLL: 105, ACCT: 155, AGENDA:  9, PRA:  6, CONTRACT: 44, SQFT:  920, VEHICLE: 124, COMMITS: 1 },
  PARKS:     { FTE: 1.5,  EXPEND:  340, EXPEND_X: 340, PAYROLL:  38, ACCT:  72, AGENDA:  8, PRA:  5, CONTRACT: 21, SQFT:  240, VEHICLE:  18, COMMITS: 2 },
  PD:        { FTE: 0.5,  EXPEND:  720, EXPEND_X: 720, PAYROLL:  15, ACCT:  45, AGENDA:  5, PRA:  3, CONTRACT:  8, SQFT:  180, VEHICLE:   6, COMMITS: 0 },
  FIRE:      { FTE: 0.2,  EXPEND:  234, EXPEND_X: 234, PAYROLL:   8, ACCT:  18, AGENDA:  2, PRA:  1, CONTRACT:  6, SQFT:  140, VEHICLE:   3, COMMITS: 1 },
};

// ---------------------------------------------------------------------------
// Step-down compute
// ---------------------------------------------------------------------------

export interface StepContribution {
  poolId: string;
  fromCode: MatrixDeptCode;
  fromName: string;
  stepIndex: number;        // 1-based
  amount: number;           // $ pushed from this step to one specific receiver
  toCode: MatrixDeptCode;
}

export interface StepDownModel {
  /** Pool × dept initial placement (pool sits on home indirect). */
  alloc1: Record<string, Record<MatrixDeptCode, number>>;
  /** Pool × dept after all step-down passes. */
  alloc2: Record<string, Record<MatrixDeptCode, number>>;
  /** Indirect depts in processing order (cost center order). */
  stepOrder: MatrixDept[];
  /** Per-cell trace: every (pool, dept) contribution from a step. */
  contributions: StepContribution[];
  /** Final $ landing on each direct dept, summed across pools. */
  directTotals: Record<MatrixDeptCode, number>;
  /** Pool-level rollup. */
  byPool: Record<string, { allocatedToDirect: number; residual: number; leakage: number }>;
}

/** Translate the user's center-name order (see BuildContext.capCenterOrder)
 *  to indirect-dept codes, falling back to the canonical order for any
 *  centers the user hasn't placed yet. */
export function indirectOrder(centerNames: string[]): MatrixDept[] {
  const seen = new Set<MatrixDeptCode>();
  const out: MatrixDept[] = [];
  for (const n of centerNames) {
    const code = CENTER_NAME_TO_CODE[n];
    if (!code || seen.has(code)) continue;
    const d = INDIRECT_DEPTS.find((x) => x.code === code);
    if (!d) continue;
    out.push(d);
    seen.add(code);
  }
  for (const d of INDIRECT_DEPTS) {
    if (!seen.has(d.code)) out.push(d);
  }
  return out;
}

export function computeStepDown(pools: CapPool[], centerOrder: string[]): StepDownModel {
  const stepOrder = indirectOrder(centerOrder);
  const directList = DIRECT_DEPTS;

  // Empty pool × dept matrix.
  const zeroRow = (): Record<MatrixDeptCode, number> =>
    Object.fromEntries(ALL_DEPTS.map((d) => [d.code, 0])) as Record<MatrixDeptCode, number>;

  // === INITIAL PLACEMENT ===
  const alloc1: Record<string, Record<MatrixDeptCode, number>> = {};
  pools.forEach((p) => {
    const row = zeroRow();
    const { basis, directTo } = basisForPool(p);
    if (basis === "DIRECT") {
      if (directTo) row[directTo] = p.amount;
    } else {
      const home = CENTER_NAME_TO_CODE[p.center];
      if (home) row[home] = p.amount;
    }
    alloc1[p.id] = row;
  });

  // === STEP-DOWN ===
  const running: Record<string, Record<MatrixDeptCode, number>> = {};
  pools.forEach((p) => {
    running[p.id] = { ...alloc1[p.id] };
  });

  const contributions: StepContribution[] = [];

  stepOrder.forEach((I, i) => {
    const remainingIndirects = stepOrder.slice(i + 1);
    const receivers: MatrixDept[] = [...remainingIndirects, ...directList];

    pools.forEach((p) => {
      const sitting = running[p.id][I.code];
      if (sitting <= 0) return;
      const { basis } = basisForPool(p);
      if (basis === "DIRECT") return;

      const totalDriver = receivers.reduce(
        (a, r) => a + (DRIVERS[r.code]?.[basis] ?? 0), 0,
      );
      if (totalDriver <= 0) return;

      receivers.forEach((r) => {
        const drv = DRIVERS[r.code]?.[basis] ?? 0;
        if (drv <= 0) return;
        const share = sitting * (drv / totalDriver);
        running[p.id][r.code] += share;
        contributions.push({
          poolId: p.id,
          fromCode: I.code,
          fromName: I.name,
          stepIndex: i + 1,
          amount: share,
          toCode: r.code,
        });
      });
      running[p.id][I.code] = 0;
    });
  });

  const alloc2 = running;

  // === ROLLUPS ===
  const directTotals = Object.fromEntries(
    directList.map((d) => [
      d.code,
      pools.reduce((a, p) => a + (alloc2[p.id][d.code] || 0), 0),
    ]),
  ) as Record<MatrixDeptCode, number>;

  const byPool: Record<string, { allocatedToDirect: number; residual: number; leakage: number }> = {};
  pools.forEach((p) => {
    const allocatedToDirect = directList.reduce((a, d) => a + (alloc2[p.id][d.code] || 0), 0);
    const residual = INDIRECT_DEPTS.reduce((a, d) => a + (alloc2[p.id][d.code] || 0), 0);
    byPool[p.id] = {
      allocatedToDirect,
      residual,
      leakage: p.amount - allocatedToDirect,
    };
  });

  return { alloc1, alloc2, stepOrder, contributions, directTotals, byPool };
}
