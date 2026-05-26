/* Functional Allocation calc — derives per-bucket and per-dept implied
 * FBHR from FunctionalAllocationBucket rows + the dept's fully burdened
 * cost (post-overhead-allocation). All math is per-render; bucket rows
 * carry only the analyst-editable inputs (directHours, recoverabilityPct).
 *
 * Policy intent — a department's full cost must be recovered through
 * fees on the recoverable share of its activity. A 50%-recoverable dept
 * has an implied FBHR roughly 2× the engine FBHR because half the hours
 * are absorbing the cost of the other half (long-range planning, CIP,
 * etc. — public-benefit work funded by the General Fund implicitly
 * across the dept's whole cost).
 *
 * The implied FBHR is informational by default and is only routed into
 * cost-of-service math when the useFunctionalAllocationFbhr flag is on
 * (see lib/store.ts). When off, the FBHR engine is unchanged.
 */

import type { DeptCode, FunctionalAllocationBucket } from "@/lib/types";
import type { FBHR } from "@/lib/calc";

export interface FunctionalAllocationBucketDerived {
  bucket: FunctionalAllocationBucket;
  /** This bucket's share of the dept's fully burdened cost. Split by
   *  directHours when any bucket in the dept has non-zero hours; else
   *  an even split across the dept's buckets so the page reads sensibly
   *  on first load. */
  fullyBurdenedCost: number;
  /** fullyBurdenedCost × recoverabilityPct / 100. */
  recoverableCost: number;
  /** fullyBurdenedCost − recoverableCost. */
  nonRecoverableCost: number;
  /** directHours × recoverabilityPct / 100. */
  recoverableHours: number;
  /** Bucket-level $/hr — fullyBurdenedCost / directHours (or 0 when
   *  directHours is 0). NOT the rate used by Cost of Service; that's
   *  the dept-level impliedFbhr below. */
  impliedFbhr: number;
}

export interface FunctionalAllocationDeptDerived {
  dept: DeptCode;
  /** All buckets that belong to this dept, with their derived fields. */
  buckets: FunctionalAllocationBucketDerived[];
  /** Dept's fully burdened cost (direct labor + operating + allocated
   *  overhead) — equal to the engine-derived FBHR's dollar total. The
   *  per-bucket cost split sums to this. */
  fullyBurdenedCost: number;
  /** Σ bucket.recoverableCost across the dept. */
  recoverableCost: number;
  /** fullyBurdenedCost − recoverableCost. */
  nonRecoverableCost: number;
  /** Σ bucket.directHours across the dept. */
  directHours: number;
  /** Σ bucket.recoverableHours across the dept. */
  recoverableHours: number;
  /** Dept-level implied FBHR for downstream cost-of-service math:
   *  fullyBurdenedCost ÷ recoverableHours. Null when recoverableHours
   *  is zero (no analyst input yet) — consumers fall back to the
   *  engine FBHR in that case. */
  impliedFbhr: number | null;
  /** Σ (directHours × recoverabilityPct) ÷ Σ directHours, expressed as
   *  a percent. Surfaces the dept's "recoverability ratio" in the UI. */
  weightedRecoverabilityPct: number;
}

export interface FunctionalAllocationDerived {
  /** Per-dept derivation, keyed by dept code. Only the depts that have
   *  at least one bucket appear here. */
  byDept: Partial<Record<DeptCode, FunctionalAllocationDeptDerived>>;
  /** Quick lookup: dept → implied FBHR (null when not computable). */
  impliedFbhrByDept: Partial<Record<DeptCode, number | null>>;
}

/** Compute the Functional Allocation derived state from raw buckets +
 *  the engine-derived FBHR (which carries the dept's fully burdened
 *  cost dollars). The FBHR engine is unchanged; this just reads its
 *  per-dept dollar totals. */
export function deriveFunctionalAllocation(
  buckets: FunctionalAllocationBucket[],
  fbhr: Record<DeptCode, FBHR>,
): FunctionalAllocationDerived {
  const byDept: Partial<Record<DeptCode, FunctionalAllocationDeptDerived>> = {};
  const impliedFbhrByDept: Partial<Record<DeptCode, number | null>> = {};

  // Pre-bucket by dept so we can split cost proportionally within each
  // dept without re-filtering per bucket.
  const grouped = new Map<DeptCode, FunctionalAllocationBucket[]>();
  for (const b of buckets) {
    const arr = grouped.get(b.dept) ?? [];
    arr.push(b);
    grouped.set(b.dept, arr);
  }

  for (const [dept, list] of grouped) {
    const deptFbhr = fbhr[dept];
    if (!deptFbhr) continue;
    const fullyBurdenedCost =
      deptFbhr.directDollars + deptFbhr.operatingDollars + deptFbhr.capDollars;
    const totalDirectHours = list.reduce((a, b) => a + b.directHours, 0);
    // Cost split rule: weight by directHours when any bucket has
    // non-zero hours; else split evenly so the table reads sensibly on
    // first load (seed defaults directHours: 0 across the board).
    const evenSplit = totalDirectHours <= 0;

    const derivedBuckets: FunctionalAllocationBucketDerived[] = list.map((b) => {
      const share = evenSplit
        ? 1 / list.length
        : b.directHours / totalDirectHours;
      const bucketCost = fullyBurdenedCost * share;
      const recPct = b.recoverabilityPct / 100;
      const recoverableCost = bucketCost * recPct;
      const recoverableHours = b.directHours * recPct;
      return {
        bucket: b,
        fullyBurdenedCost: bucketCost,
        recoverableCost,
        nonRecoverableCost: bucketCost - recoverableCost,
        recoverableHours,
        impliedFbhr: b.directHours > 0 ? bucketCost / b.directHours : 0,
      };
    });

    const recoverableCost = derivedBuckets.reduce((a, b) => a + b.recoverableCost, 0);
    const recoverableHours = derivedBuckets.reduce((a, b) => a + b.recoverableHours, 0);
    const weightedRecoverabilityPct = totalDirectHours > 0
      ? (list.reduce((a, b) => a + b.directHours * b.recoverabilityPct, 0) / totalDirectHours)
      : (list.reduce((a, b) => a + b.recoverabilityPct, 0) / Math.max(1, list.length));
    const impliedFbhr = recoverableHours > 0
      ? fullyBurdenedCost / recoverableHours
      : null;

    byDept[dept] = {
      dept,
      buckets: derivedBuckets,
      fullyBurdenedCost,
      recoverableCost,
      nonRecoverableCost: fullyBurdenedCost - recoverableCost,
      directHours: totalDirectHours,
      recoverableHours,
      impliedFbhr,
      weightedRecoverabilityPct,
    };
    impliedFbhrByDept[dept] = impliedFbhr;
  }

  return { byDept, impliedFbhrByDept };
}

/** When the useFunctionalAllocationFbhr flag is on, replace each dept's
 *  engine FBHR with its implied FBHR from the functional-allocation
 *  derivation. Depts with no implied rate (no buckets, or zero
 *  recoverable hours) pass through unchanged so the FBHR engine remains
 *  authoritative for unmodeled depts.
 *
 *  The override rewrites only the headline `fbhr` field, not the
 *  per-component rates (directRate / operatingRate / capRate). The
 *  components retain their engine values so the Appendix B
 *  decomposition still reads correctly — they just no longer sum to
 *  `fbhr` when the override is active. Document this in the UI when
 *  the flag is on. */
export function applyFunctionalAllocationFbhr(
  fbhr: Record<DeptCode, FBHR>,
  fa: FunctionalAllocationDerived,
): Record<DeptCode, FBHR> {
  const out = {} as Record<DeptCode, FBHR>;
  for (const k of Object.keys(fbhr) as DeptCode[]) {
    const engine = fbhr[k];
    const implied = fa.impliedFbhrByDept[k];
    if (implied != null) {
      out[k] = { ...engine, fbhr: implied };
    } else {
      out[k] = engine;
    }
  }
  return out;
}
