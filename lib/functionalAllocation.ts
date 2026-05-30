/* Functional Allocation calc — derives per-bucket and per-dept
 * recoverable cost and FBHR from FunctionalAllocationBucket rows + the
 * dept's fully burdened cost (post-overhead-allocation).
 *
 * Methodology:
 *
 *   bucket.directHours       = deptProductiveHours × allocationSharePct
 *   bucket.fullyBurdenedCost = deptFullyBurdenedCost × allocationSharePct
 *   bucket.recoverableCost   = bucket.fullyBurdenedCost × feeRecoverablePct
 *   bucket.nonRecoverableCost = bucket.fullyBurdenedCost − bucket.recoverableCost
 *
 *   dept.recoverableCost     = Σ bucket.recoverableCost
 *   dept.rateBasisDirectHours = Σ bucket.directHours WHERE rateBasisHours
 *   dept.recoverableFbhr     = dept.recoverableCost ÷ dept.rateBasisDirectHours
 *
 * Two independent levers:
 *
 *   (1) Recoverable cost contribution — Fee Recoverable %. Scales the
 *       bucket's contribution to the FBHR numerator.
 *
 *   (2) Hourly rate basis contribution — Rate Basis Hours flag. When
 *       true, the bucket's direct hours are included in the FBHR
 *       denominator. When false, hours are excluded (adjustment for
 *       non-fee-supported activity such as long-range planning, CIP,
 *       governance). Cost contribution is unaffected by this flag.
 *
 * Fee Recoverable % reduces COSTS only. Hours are an operational basis
 * — they represent workload allocation, not a policy recovery target —
 * so they are NOT multiplied by recoverability.
 *
 * Allocation shares are taken raw (no normalization). When shares sum
 * to less than 100, the unallocated cost lands in the dept-level
 * "subsidized" total but not in any bucket.
 *
 * Recoverable FBHR always drives downstream Cost of Service math via
 * applyFunctionalAllocationFbhr() — departments where the recoverable
 * FBHR is null (no buckets, no rate-basis hours) fall through to the
 * engine FBHR.
 */

import type { DeptCode, FunctionalAllocationBucket } from "@/lib/types";
import type { FBHR } from "@/lib/calc";

export interface FunctionalAllocationBucketDerived {
  bucket: FunctionalAllocationBucket;
  /** Direct hours assigned to this bucket:
   *    deptProductiveHours × hoursSharePct / 100
   *  An operational basis — NOT reduced by recoverabilityPct. */
  directHours: number;
  /** This bucket's share of the dept's fully burdened cost:
   *    deptFullyBurdenedCost × hoursSharePct / 100 */
  fullyBurdenedCost: number;
  /** fullyBurdenedCost × recoverabilityPct / 100. */
  recoverableCost: number;
  /** fullyBurdenedCost − recoverableCost. */
  nonRecoverableCost: number;
}

export interface FunctionalAllocationDeptDerived {
  dept: DeptCode;
  /** All buckets that belong to this dept, with their derived fields. */
  buckets: FunctionalAllocationBucketDerived[];
  /** Dept's fully burdened cost (direct labor + operating + allocated
   *  overhead) — the engine-derived dollar total. NOTE: when bucket
   *  shares don't sum to 100, Σ bucket.fullyBurdenedCost may be less
   *  than this — the difference is unallocated cost. */
  fullyBurdenedCost: number;
  /** Σ bucket.recoverableCost across the dept. */
  recoverableCost: number;
  /** fullyBurdenedCost − recoverableCost. Includes both the
   *  non-recoverable share of allocated buckets AND any unallocated
   *  cost when Σ shares < 100. */
  nonRecoverableCost: number;
  /** Σ bucket.directHours across the dept. Equals deptProductiveHours
   *  exactly when Σ hoursSharePct = 100. */
  directHours: number;
  /** Σ bucket.directHours restricted to buckets with rateBasisHours = true.
   *  The denominator used by recoverableFbhr. */
  rateBasisDirectHours: number;
  /** Dept-level recoverable FBHR:
   *    Σ recoverableCost ÷ Σ directHours WHERE rateBasisHours = true
   *  Null when no buckets are flagged as rate-basis hours (or those
   *  buckets have zero direct hours) — the UI renders em dash. */
  recoverableFbhr: number | null;
  /** Σ hoursSharePct across the dept's buckets. Surfaced for the
   *  Σ-share validation indicator. */
  hoursSharePctTotal: number;
  /** Σ (hoursSharePct × recoverabilityPct) ÷ Σ hoursSharePct — the
   *  share-weighted average recoverability across the dept. */
  weightedRecoverabilityPct: number;
}

export interface FunctionalAllocationDerived {
  /** Per-dept derivation, keyed by dept code. Only the depts that have
   *  at least one bucket appear here. */
  byDept: Partial<Record<DeptCode, FunctionalAllocationDeptDerived>>;
  /** Quick lookup: dept → recoverable FBHR (null when not computable). */
  recoverableFbhrByDept: Partial<Record<DeptCode, number | null>>;
}

/** Compute the Functional Allocation derived state from raw buckets +
 *  the engine-derived FBHR (which carries the dept's fully burdened
 *  cost dollars + productive hours). The FBHR engine is unchanged;
 *  this just reads its per-dept totals. */
export function deriveFunctionalAllocation(
  buckets: FunctionalAllocationBucket[],
  fbhr: Record<DeptCode, FBHR>,
): FunctionalAllocationDerived {
  const byDept: Partial<Record<DeptCode, FunctionalAllocationDeptDerived>> = {};
  const recoverableFbhrByDept: Partial<Record<DeptCode, number | null>> = {};

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
    const deptProductiveHours = deptFbhr.productiveHours;

    const derivedBuckets: FunctionalAllocationBucketDerived[] = list.map((b) => {
      const share = b.hoursSharePct / 100;
      const bucketCost = fullyBurdenedCost * share;
      const directHours = deptProductiveHours * share;
      const recPct = b.recoverabilityPct / 100;
      const recoverableCost = bucketCost * recPct;
      return {
        bucket: b,
        directHours,
        fullyBurdenedCost: bucketCost,
        recoverableCost,
        nonRecoverableCost: bucketCost - recoverableCost,
      };
    });

    const recoverableCost = derivedBuckets.reduce((a, b) => a + b.recoverableCost, 0);
    const totalDirectHours = derivedBuckets.reduce((a, b) => a + b.directHours, 0);
    const rateBasisDirectHours = derivedBuckets.reduce(
      (a, b) => a + (b.bucket.rateBasisHours ? b.directHours : 0), 0,
    );
    const hoursSharePctTotal = list.reduce((a, b) => a + b.hoursSharePct, 0);
    const weightedRecoverabilityPct = hoursSharePctTotal > 0
      ? (list.reduce((a, b) => a + b.hoursSharePct * b.recoverabilityPct, 0) / hoursSharePctTotal)
      : 0;
    // Dept-level recoverable FBHR denominator is the sum of direct
    // hours for buckets flagged as rate-basis. Null when no buckets
    // are flagged (or when those flagged buckets carry zero direct
    // hours) so the UI can render em dash and downstream consumers
    // fall back to the engine FBHR.
    const recoverableFbhr = rateBasisDirectHours > 0
      ? recoverableCost / rateBasisDirectHours
      : null;

    byDept[dept] = {
      dept,
      buckets: derivedBuckets,
      fullyBurdenedCost,
      recoverableCost,
      nonRecoverableCost: fullyBurdenedCost - recoverableCost,
      directHours: totalDirectHours,
      rateBasisDirectHours,
      recoverableFbhr,
      hoursSharePctTotal,
      weightedRecoverabilityPct,
    };
    recoverableFbhrByDept[dept] = recoverableFbhr;
  }

  return { byDept, recoverableFbhrByDept };
}

/** Replace each dept's engine FBHR with its recoverable FBHR from the
 *  functional-allocation derivation. Always called by
 *  deriveBuildDerived so the recoverable FBHR drives downstream Cost
 *  of Service math. Depts with no recoverable rate (no buckets, no
 *  rate-basis hours) pass through unchanged, keeping the engine FBHR
 *  authoritative for unmodeled depts.
 *
 *  The override rewrites only the headline `fbhr` field, not the
 *  per-component rates (directRate / operatingRate / capRate) — those
 *  retain their engine values so the Appendix B decomposition still
 *  reads correctly. */
export function applyFunctionalAllocationFbhr(
  fbhr: Record<DeptCode, FBHR>,
  fa: FunctionalAllocationDerived,
): Record<DeptCode, FBHR> {
  const out = {} as Record<DeptCode, FBHR>;
  for (const k of Object.keys(fbhr) as DeptCode[]) {
    const engine = fbhr[k];
    const recoverable = fa.recoverableFbhrByDept[k];
    if (recoverable != null) {
      out[k] = { ...engine, fbhr: recoverable };
    } else {
      out[k] = engine;
    }
  }
  return out;
}
