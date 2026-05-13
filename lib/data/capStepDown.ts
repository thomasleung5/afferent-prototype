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
import { ALLOCATION_BASIS_ROWS } from "./allocationBases";

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

/** Driver values per department × basis — derived from the Allocation
 *  Bases matrix (lib/data/allocationBases.ts) so that the Allocation
 *  Bases tab and the step-down engine share one source of truth.
 *
 *  Indirect rows are receivers too — a pool sitting on Finance can be
 *  stepped down to City Attorney if Attorney comes later in the sequence.
 *  Departments not present in ALLOCATION_BASIS_ROWS get an empty row. */
export const DRIVERS: Record<MatrixDeptCode, Partial<Record<BasisKey, number>>> = (() => {
  const out = Object.fromEntries(
    ALL_DEPTS.map((d) => [d.code, {}]),
  ) as Record<MatrixDeptCode, Partial<Record<BasisKey, number>>>;
  for (const row of ALLOCATION_BASIS_ROWS) {
    const code = row.code as MatrixDeptCode;
    if (!(code in out)) continue;
    for (const [k, v] of Object.entries(row.values)) {
      if (v != null) out[code][k as BasisKey] = v as number;
    }
  }
  return out;
})();

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
