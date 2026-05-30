/* Functional Allocation calc fixture.
 *
 * Run with: npm run test:functional-allocation
 *
 * Pins methodology:
 *   - bucket.directHours       = deptProductiveHours × hoursSharePct/100
 *   - bucket.fullyBurdenedCost = deptFullBurd × hoursSharePct/100
 *   - bucket.recoverableCost   = bucket.fullyBurdenedCost × recPct/100
 *   - dept.recoverableFbhr     = Σ recoverableCost / Σ directHours WHERE rateBasisHours
 *
 * Fee Recoverable % reduces COSTS ONLY. Hours are NOT multiplied by it.
 * Rate Basis Hours flag controls inclusion in the FBHR denominator
 * INDEPENDENTLY of cost contribution. */

import assert from "node:assert/strict";
import {
  deriveFunctionalAllocation, applyFunctionalAllocationFbhr,
} from "../functionalAllocation";
import type { FBHR } from "../calc";
import type { DeptCode, FunctionalAllocationBucket } from "../types";

const fbhr = (overrides: Partial<FBHR> = {}): FBHR => ({
  dept: "PLAN",
  directRate: 100,
  operatingRate: 50,
  capRate: 50,
  fbhr: 200,
  productiveHours: 1000,
  directDollars: 100_000,
  operatingDollars: 50_000,
  capDollars: 50_000,
  ...overrides,
});

const bucket = (overrides: Partial<FunctionalAllocationBucket> = {}): FunctionalAllocationBucket => ({
  id: "fa-x",
  dept: "PLAN",
  name: "Bucket",
  recoverabilityPct: 100,
  hoursSharePct: 0,
  rateBasisHours: true,
  source: "seed",
  ...overrides,
});

// ── 1. Single 100%/100% / rate basis → matches engine FBHR ──────────────
{
  const buckets = [bucket({ id: "fa-1", hoursSharePct: 100, recoverabilityPct: 100, rateBasisHours: true })];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  assert.equal(d.recoverableCost, 200_000);
  assert.equal(d.rateBasisDirectHours, 1000);
  assert.equal(d.recoverableFbhr, 200, "Σ rec / Σ rate-basis hours = engine FBHR here");
  console.log("  ✓ 100%/100% rate-basis bucket → recoverable FBHR matches engine");
}

// ── 2. Rate Basis Hours = false drops bucket hours from denominator ─────
// Two buckets, both 100% recoverable. One marked rate-basis, one not.
// Cost: both contribute → $200k recoverable.
// Denominator: only the rate-basis bucket → 500 hours.
// → recoverable FBHR = $200k / 500 = $400.
{
  const buckets = [
    bucket({ id: "fa-2a", hoursSharePct: 50, recoverabilityPct: 100, rateBasisHours: true }),
    bucket({ id: "fa-2b", hoursSharePct: 50, recoverabilityPct: 100, rateBasisHours: false }),
  ];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  assert.equal(d.recoverableCost, 200_000, "both buckets contribute to recoverable cost");
  assert.equal(d.directHours, 1000, "directHours total unchanged");
  assert.equal(d.rateBasisDirectHours, 500, "only rate-basis bucket counts toward denominator");
  assert.equal(d.recoverableFbhr, 400, "denominator restriction raises the rate");
  console.log("  ✓ rate-basis flag excludes bucket hours from denominator only");
}

// ── 3. Mixed dept: long-range / CIP excluded from rate basis ──
// 4 buckets representing a Planning division:
//   - Current Planning (50% share, 100% rec, rate basis)
//   - Public Counter (20%, 50% rec, rate basis)
//   - Long Range Planning (20%, 0% rec, NOT rate basis)
//   - Code Enforcement (10%, 35% rec, rate basis)
//
// Recoverable cost:
//   = (50% × 200k × 100%) + (20% × 200k × 50%) + 0 + (10% × 200k × 35%)
//   = 100k + 20k + 0 + 7k = $127k
// Rate-basis hours: 500 + 200 + 0 + 100 = 800
// Recoverable FBHR = 127k / 800 = $158.75
{
  const buckets = [
    bucket({ id: "fa-3a", hoursSharePct: 50, recoverabilityPct: 100, rateBasisHours: true }),
    bucket({ id: "fa-3b", hoursSharePct: 20, recoverabilityPct: 50,  rateBasisHours: true }),
    bucket({ id: "fa-3c", hoursSharePct: 20, recoverabilityPct: 0,   rateBasisHours: false }),
    bucket({ id: "fa-3d", hoursSharePct: 10, recoverabilityPct: 35,  rateBasisHours: true }),
  ];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  assert.equal(d.recoverableCost, 127_000);
  assert.equal(d.rateBasisDirectHours, 800);
  assert.equal(d.recoverableFbhr, 127_000 / 800);
  console.log("  ✓ Mixed dept: excludes non-fee activity from rate basis");
}

// ── 4. No rate-basis buckets → recoverable FBHR null ────────────────────
{
  const buckets = [
    bucket({ id: "fa-4a", hoursSharePct: 100, recoverabilityPct: 100, rateBasisHours: false }),
  ];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  assert.equal(d.recoverableCost, 200_000, "cost still allocated");
  assert.equal(d.rateBasisDirectHours, 0);
  assert.equal(d.recoverableFbhr, null, "no rate-basis hours → null FBHR");
  console.log("  ✓ no rate-basis buckets → null recoverable FBHR (no divide-by-zero)");
}

// ── 5. Allocation share 0% on rate-basis bucket → zero everywhere ───────
{
  const buckets = [
    bucket({ id: "fa-5a", hoursSharePct: 0, recoverabilityPct: 100, rateBasisHours: true }),
  ];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  assert.equal(d.buckets[0].directHours, 0);
  assert.equal(d.buckets[0].fullyBurdenedCost, 0);
  assert.equal(d.buckets[0].recoverableCost, 0);
  assert.equal(d.rateBasisDirectHours, 0);
  assert.equal(d.recoverableFbhr, null);
  console.log("  ✓ 0% allocation share → zero everywhere; null FBHR");
}

// ── 6. applyFunctionalAllocationFbhr override path still works ──────────
{
  const engine: Record<DeptCode, FBHR> = {
    PLAN: fbhr({ dept: "PLAN", fbhr: 200 }),
    BLDG: fbhr({ dept: "BLDG", fbhr: 250 }),
    ENG: fbhr({ dept: "ENG", fbhr: 300 }),
    PARKS: fbhr({ dept: "PARKS", fbhr: 0, productiveHours: 0 }),
    PD: fbhr({ dept: "PD", fbhr: 0, productiveHours: 0 }),
    FIRE: fbhr({ dept: "FIRE", fbhr: 0, productiveHours: 0 }),
  };
  const buckets = [
    bucket({ id: "fa-6a", dept: "PLAN", hoursSharePct: 100, recoverabilityPct: 50, rateBasisHours: true }),
    bucket({ id: "fa-6b", dept: "BLDG", hoursSharePct: 100, recoverabilityPct: 100, rateBasisHours: false }),
  ];
  const fa = deriveFunctionalAllocation(buckets, engine);
  const out = applyFunctionalAllocationFbhr(engine, fa);
  // PLAN: recoverableCost=100k, rate-basis hours=1000 → FBHR=100.
  assert.equal(out.PLAN.fbhr, 100, "PLAN overridden to recoverable FBHR");
  // BLDG: no rate-basis hours → recoverableFbhr=null → fall through to engine.
  assert.equal(out.BLDG.fbhr, 250, "BLDG falls through when no rate-basis hours");
  assert.equal(out.ENG.fbhr, 300, "ENG falls through when no buckets present");
  console.log("  ✓ override respects null recoverableFbhr; engine retained");
}

console.log("\nAll Functional Allocation assertions passed.");
