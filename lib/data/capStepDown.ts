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

import type { AllocationBasis, BasisKey, CapPool, MatrixDeptCode } from "../types";
import { ALLOCATION_BASIS_ROWS } from "./allocationBases";

// Re-export for backwards compat — these types now live in lib/types.ts so
// AllocationBasis (also in types.ts) can reference them without a cycle.
export type { BasisKey, MatrixDeptCode };

export type CapStepDownMethod = "step-down" | "double-step-down";

// ---------------------------------------------------------------------------
// Departments (matrix-only)
// ---------------------------------------------------------------------------

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
//
// A pool's basis is resolved by looking up pool.basisId in the AllocationBasis
// catalog (state.allocationBases). The catalog entry's driverKey is what
// selects the DRIVERS column for the step-down split — i.e. changing a pool's
// basis from "Agenda item count" to "Budgeted FTE" actually changes the
// allocation distribution because driverKey switches from AGENDA to FTE.
//
// inferBasis is the legacy text-matching fallback for pools whose basisId is
// empty or orphaned (AI-imported rows, hand-crafted pools without catalog
// reference). It guesses from the descriptive pool.basis text. Once every
// pool has a valid basisId, inferBasis stops firing.
// ---------------------------------------------------------------------------

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

export function basisForPool(
  p: CapPool,
  bases: AllocationBasis[],
): { basis: BasisKey; directTo?: MatrixDeptCode } {
  const cat = p.basisId ? bases.find((b) => b.id === p.basisId) : undefined;
  if (cat) return { basis: cat.driverKey, directTo: cat.directTo };
  return { basis: inferBasis(p) };
}

// ---------------------------------------------------------------------------
// Drivers (department × basis denominators)
// ---------------------------------------------------------------------------

export type DriverMatrix = Record<MatrixDeptCode, Partial<Record<BasisKey, number>>>;

/** Seed driver values per department × basis — derived from the Allocation
 *  Bases matrix (lib/data/allocationBases.ts) so the Allocation Bases tab
 *  and the step-down engine share one source of truth when no pools have
 *  imported receivers.
 *
 *  Indirect rows are receivers too — a pool sitting on Finance can be
 *  stepped down to City Attorney if Attorney comes later in the sequence.
 *  Departments not present in ALLOCATION_BASIS_ROWS get an empty row. */
export const DRIVERS: DriverMatrix = (() => {
  const out = Object.fromEntries(
    ALL_DEPTS.map((d) => [d.code, {}]),
  ) as DriverMatrix;
  for (const row of ALLOCATION_BASIS_ROWS) {
    const code = row.code as MatrixDeptCode;
    if (!(code in out)) continue;
    for (const [k, v] of Object.entries(row.values)) {
      if (v != null) out[code][k as BasisKey] = v as number;
    }
  }
  return out;
})();

/** Derive a department × basis driver matrix from imported pool receivers.
 *
 *  Units are a PER-DEPARTMENT attribute, not per-pool: a department's
 *  budgeted FTE / EXPEND / PRA count is the same number no matter how many
 *  pools list it. Documents repeat the same receiver row in every pool's
 *  allocation schedule, so the same (deptCode, driverKey, glCode) tuple
 *  shows up N times. We dedup by glCode within each cell so each unique
 *  receiver contributes its units exactly once; distinct receivers sharing
 *  a deptCode (e.g. several Public Works divisions) still aggregate by
 *  sum into the dept-level denominator the step-down routes through:
 *  out[PW][FTE] = Σ FTE over every distinct PW-coded receiver.
 *
 *  Earlier "+= units for every receiver row" logic multiplied each cell by
 *  the pool count for any receiver listed in multiple pools — that's the
 *  4000× EXPEND inflation we just hit.
 *
 *  Pools with basis "DIRECT" are skipped — DIRECT is a routing rule, not a
 *  denominator. Receivers missing `units` are skipped — no count, no driver.
 *  Receivers with deptCode "OTHER" are skipped — they fall outside the matrix.
 *
 *  Conflict detection: if two listings of the same (deptCode, glCode,
 *  driverKey) carry different units, console-warn (silent averaging /
 *  summing is not acceptable for audit data). First-seen wins. */
export function deriveDriversFromReceivers(
  pools: CapPool[],
  bases: AllocationBasis[],
): DriverMatrix {
  const out = Object.fromEntries(
    ALL_DEPTS.map((d) => [d.code, {}]),
  ) as DriverMatrix;

  // Per-(deptCode, driverKey) set of receiver identities already counted.
  // The set value is the units we recorded for each glCode in that cell,
  // used to detect inconsistent repeated listings.
  const seen = new Map<string, Map<string, number>>();

  for (const p of pools) {
    if (!p.receivers || p.receivers.length === 0) continue;
    const { basis: driverKey } = basisForPool(p, bases);
    if (driverKey === "DIRECT") continue;
    for (const r of p.receivers) {
      if (r.deptCode === "OTHER") continue;
      if (typeof r.units !== "number" || !Number.isFinite(r.units) || r.units <= 0) continue;
      const cell = out[r.deptCode];
      if (!cell) continue;
      const cellKey = `${r.deptCode}|${driverKey}`;
      const receiverId = r.glCode ?? `noglcode:${r.dept.toLowerCase()}`;
      let seenInCell = seen.get(cellKey);
      if (!seenInCell) {
        seenInCell = new Map();
        seen.set(cellKey, seenInCell);
      }
      const previousUnits = seenInCell.get(receiverId);
      if (previousUnits != null) {
        if (Math.abs(previousUnits - r.units) > 0.001) {
          // eslint-disable-next-line no-console
          console.warn(
            `[deriveDriversFromReceivers] inconsistent units for ${receiverId} in ${cellKey}: ${previousUnits} vs ${r.units}; keeping first-seen`,
          );
        }
        continue; // already counted this receiver in this cell
      }
      seenInCell.set(receiverId, r.units);
      cell[driverKey] = (cell[driverKey] ?? 0) + r.units;
    }
  }
  return out;
}

/** Overlay `b` on top of `a` — for any (dept, basis) cell `b` provides, the
 *  value wins. Used to merge derived (imported) drivers onto the seed so
 *  every cell the user has data for reflects the import while uncovered
 *  cells keep the seed reference values. */
export function mergeDriverMatrices(a: DriverMatrix, b: DriverMatrix): DriverMatrix {
  const out: DriverMatrix = {} as DriverMatrix;
  for (const d of ALL_DEPTS) {
    out[d.code] = { ...(a[d.code] ?? {}) };
  }
  for (const d of ALL_DEPTS) {
    const overlay = b[d.code];
    if (!overlay) continue;
    for (const [k, v] of Object.entries(overlay)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        out[d.code][k as BasisKey] = v;
      }
    }
  }
  return out;
}

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
  /** Pool × dept initial placement (pool sits on home indirect).
   *  Seeded with the ELIGIBLE amount (pool.amount × eligiblePercent/100),
   *  not the raw amount. The excluded share is held off the matrix. */
  alloc1: Record<string, Record<MatrixDeptCode, number>>;
  /** Pool × dept after all step-down passes. */
  alloc2: Record<string, Record<MatrixDeptCode, number>>;
  /** Indirect depts in processing order (cost center order). */
  stepOrder: MatrixDept[];
  /** Per-cell trace: every (pool, dept) contribution from a step. */
  contributions: StepContribution[];
  /** Final $ landing on each direct dept, summed across pools. Reflects
   *  the eligible-only flow — totals reconcile to Σ pool.eligibleAmount. */
  directTotals: Record<MatrixDeptCode, number>;
  /** Pool-level rollup. */
  byPool: Record<string, {
    /** Raw pool amount before policy filtering. */
    rawAmount: number;
    /** Policy-filtered amount that enters the step-down (= rawAmount × eligiblePercent/100). */
    eligibleAmount: number;
    /** Pool $ that policy explicitly excludes (= rawAmount − eligibleAmount). */
    excluded: number;
    /** Eligible $ that landed on direct depts after step-down. */
    allocatedToDirect: number;
    /** Eligible $ stuck on indirect depts (sequencing artifact; normally 0). */
    residual: number;
    /** Eligible $ that fell out of the matrix (no basis denominator match). */
    leakage: number;
  }>;
  /** Allocation methodology used to build this model. */
  method: CapStepDownMethod;
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

/** Resolves a center NAME (the string carried on pool.center) to a
 *  MatrixDeptCode. Defaults to the LAH-specific CENTER_NAME_TO_CODE map;
 *  the store layer wraps this to try glCode-first when imported centers
 *  carry account codes. */
export type CenterCodeResolver = (centerName: string) => MatrixDeptCode | undefined;

const defaultCenterResolver: CenterCodeResolver = (n) => CENTER_NAME_TO_CODE[n];

export function computeStepDown(
  pools: CapPool[],
  centerOrder: string[],
  bases: AllocationBasis[],
  /** Optional driver matrix override. Defaults to the seed DRIVERS built
   *  from ALLOCATION_BASIS_ROWS; the store layer overlays receiver-derived
   *  values on top for imported pools. */
  drivers: DriverMatrix = DRIVERS,
  /** Optional center-name → MatrixDeptCode resolver. Defaults to the LAH
   *  name map; the store wraps this to prefer the center's glCode (which
   *  is robust across non-LAH documents whose center names won't match). */
  resolveCenterCode: CenterCodeResolver = defaultCenterResolver,
  /** Sequential step-down is the legacy default. Double step-down mirrors
   *  CAP schedules that publish a first allocation to other indirect/direct
   *  receivers, then a second allocation of indirect receipts to directs. */
  method: CapStepDownMethod = "step-down",
): StepDownModel {
  const stepOrder = indirectOrder(centerOrder);
  const directList = DIRECT_DEPTS;

  // Empty pool × dept matrix.
  const zeroRow = (): Record<MatrixDeptCode, number> =>
    Object.fromEntries(ALL_DEPTS.map((d) => [d.code, 0])) as Record<MatrixDeptCode, number>;

  // === INITIAL PLACEMENT ===
  // Seed with eligible amount only. The excluded share (policy-filtered
  // out by eligiblePercent < 100) never enters the matrix.
  const alloc1: Record<string, Record<MatrixDeptCode, number>> = {};
  pools.forEach((p) => {
    const row = zeroRow();
    const eligible = p.amount * (p.eligiblePercent / 100);
    const { basis, directTo } = basisForPool(p, bases);
    if (basis === "DIRECT") {
      if (directTo) row[directTo] = eligible;
    } else {
      const home = resolveCenterCode(p.center);
      if (home) row[home] = eligible;
    }
    alloc1[p.id] = row;
  });

  // === STEP-DOWN ===
  const running: Record<string, Record<MatrixDeptCode, number>> = {};
  pools.forEach((p) => {
    running[p.id] = { ...alloc1[p.id] };
  });

  const contributions: StepContribution[] = [];

  const pushSitting = (
    p: CapPool,
    from: MatrixDept,
    receivers: MatrixDept[],
    stepIndex: number,
  ) => {
    const sitting = running[p.id][from.code];
    if (sitting <= 0) return;
    const { basis } = basisForPool(p, bases);
    if (basis === "DIRECT") return;

    const totalDriver = receivers.reduce(
      (a, r) => a + (drivers[r.code]?.[basis] ?? 0),
      0,
    );
    if (totalDriver <= 0) return;

    receivers.forEach((r) => {
      const drv = drivers[r.code]?.[basis] ?? 0;
      if (drv <= 0) return;
      const share = sitting * (drv / totalDriver);
      running[p.id][r.code] += share;
      contributions.push({
        poolId: p.id,
        fromCode: from.code,
        fromName: from.name,
        stepIndex,
        amount: share,
        toCode: r.code,
      });
    });
    running[p.id][from.code] = 0;
  };

  if (method === "double-step-down") {
    // First allocation: each pool's original eligible amount moves from its
    // home center to every other indirect center plus direct departments.
    pools.forEach((p) => {
      const homeCode = resolveCenterCode(p.center);
      const home = homeCode ? INDIRECT_DEPTS.find((d) => d.code === homeCode) : undefined;
      if (!home) return;
      const receivers: MatrixDept[] = [
        ...INDIRECT_DEPTS.filter((d) => d.code !== home.code),
        ...directList,
      ];
      pushSitting(p, home, receivers, 1);
    });

    // Second allocation: indirect receipts are closed to direct departments.
    stepOrder.forEach((I, i) => {
      pools.forEach((p) => {
        pushSitting(p, I, directList, i + 2);
      });
    });
  } else {
    stepOrder.forEach((I, i) => {
      const remainingIndirects = stepOrder.slice(i + 1);
      const receivers: MatrixDept[] = [...remainingIndirects, ...directList];

      pools.forEach((p) => {
        pushSitting(p, I, receivers, i + 1);
      });
    });
  }

  const alloc2 = running;

  // === ROLLUPS ===
  const directTotals = Object.fromEntries(
    directList.map((d) => [
      d.code,
      pools.reduce((a, p) => a + (alloc2[p.id][d.code] || 0), 0),
    ]),
  ) as Record<MatrixDeptCode, number>;

  const byPool: StepDownModel["byPool"] = {};
  pools.forEach((p) => {
    const rawAmount = p.amount;
    const eligibleAmount = rawAmount * (p.eligiblePercent / 100);
    const excluded = rawAmount - eligibleAmount;
    const allocatedToDirect = directList.reduce((a, d) => a + (alloc2[p.id][d.code] || 0), 0);
    const residual = INDIRECT_DEPTS.reduce((a, d) => a + (alloc2[p.id][d.code] || 0), 0);
    byPool[p.id] = {
      rawAmount,
      eligibleAmount,
      excluded,
      allocatedToDirect,
      residual,
      // Eligible $ that fell out of the matrix (no basis denominator match
      // for any receiving dept). Excludes the policy-filtered share.
      leakage: eligibleAmount - allocatedToDirect - residual,
    };
  });

  return { alloc1, alloc2, stepOrder, contributions, directTotals, byPool, method };
}
