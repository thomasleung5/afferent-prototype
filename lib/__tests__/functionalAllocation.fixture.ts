/* Functional Allocation calc fixture.
 *
 * Run with: npm run test:functional-allocation
 *
 * Pins the implied-FBHR formula (full cost / recoverable hours), the
 * even-split fallback when no analyst has set directHours, and the
 * applyFunctionalAllocationFbhr override path. */

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
  directHours: 0,
  source: "seed",
  ...overrides,
});

// ── 1. Single 100% recoverable bucket → implied FBHR equals engine FBHR ──
{
  const buckets = [bucket({ id: "fa-1", directHours: 1000 })];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  assert.equal(d.fullyBurdenedCost, 200_000);
  assert.equal(d.recoverableHours, 1000);
  assert.equal(d.recoverableCost, 200_000);
  assert.equal(d.nonRecoverableCost, 0);
  assert.equal(d.impliedFbhr, 200, "100% recoverable matches engine FBHR exactly");
  assert.equal(d.buckets[0].impliedFbhr, 200);
  assert.equal(fa.impliedFbhrByDept.PLAN, 200);
  console.log("  ✓ 100% recoverable single bucket → impliedFbhr equals engine FBHR");
}

// ── 2. 50% recoverable bucket → implied FBHR doubles ─────────────────────
{
  const buckets = [bucket({ id: "fa-2", directHours: 1000, recoverabilityPct: 50 })];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  assert.equal(d.recoverableHours, 500);
  assert.equal(d.recoverableCost, 100_000);
  assert.equal(d.nonRecoverableCost, 100_000);
  assert.equal(d.impliedFbhr, 400, "50% recoverable doubles the implied FBHR");
  console.log("  ✓ 50% recoverable → impliedFbhr is 2× engine FBHR");
}

// ── 3. Mixed buckets → cost split by directHours; weighted recovery ─────
{
  const buckets = [
    bucket({ id: "fa-3a", directHours: 600, recoverabilityPct: 100 }),
    bucket({ id: "fa-3b", directHours: 400, recoverabilityPct: 0 }),
  ];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  // 60% of cost lands on the 100%-recoverable bucket → 120k recoverable.
  // 40% of cost lands on the 0% bucket → all non-recoverable.
  assert.equal(d.buckets[0].fullyBurdenedCost, 120_000);
  assert.equal(d.buckets[1].fullyBurdenedCost, 80_000);
  assert.equal(d.recoverableCost, 120_000);
  assert.equal(d.recoverableHours, 600);
  // Implied FBHR = full cost / recoverable hours = 200k / 600.
  assert.equal(d.impliedFbhr, 200_000 / 600);
  assert.equal(d.weightedRecoverabilityPct, 60, "weighted recoverability honors hour weights");
  console.log("  ✓ mixed buckets split cost by directHours, full cost recovered through recoverable hours");
}

// ── 4. All-zero directHours → even split fallback ────────────────────────
{
  const buckets = [
    bucket({ id: "fa-4a", directHours: 0, recoverabilityPct: 100 }),
    bucket({ id: "fa-4b", directHours: 0, recoverabilityPct: 50 }),
    bucket({ id: "fa-4c", directHours: 0, recoverabilityPct: 0 }),
  ];
  const fa = deriveFunctionalAllocation(buckets, { PLAN: fbhr() } as never);
  const d = fa.byDept.PLAN!;
  // Even split: each bucket carries 1/3 of $200k = ~$66,666.67
  assert.ok(Math.abs(d.buckets[0].fullyBurdenedCost - 200_000 / 3) < 1e-6);
  assert.ok(Math.abs(d.buckets[1].fullyBurdenedCost - 200_000 / 3) < 1e-6);
  // No directHours anywhere → recoverableHours is 0 → impliedFbhr is null.
  assert.equal(d.recoverableHours, 0);
  assert.equal(d.impliedFbhr, null, "zero recoverable hours yields null implied FBHR");
  assert.equal(d.weightedRecoverabilityPct, 50, "weighted recovery falls back to simple mean across buckets");
  console.log("  ✓ all-zero directHours → even cost split, null impliedFbhr");
}

// ── 5. applyFunctionalAllocationFbhr only overrides when implied is set ──
{
  const engine: Record<DeptCode, FBHR> = {
    PLAN: fbhr({ dept: "PLAN", fbhr: 200 }),
    BLDG: fbhr({ dept: "BLDG", fbhr: 250 }),
    ENG: fbhr({ dept: "ENG", fbhr: 300 }),
    PARKS: fbhr({ dept: "PARKS", fbhr: 0 }),
    PD: fbhr({ dept: "PD", fbhr: 0 }),
    FIRE: fbhr({ dept: "FIRE", fbhr: 0 }),
  };
  const buckets = [
    bucket({ id: "fa-5a", dept: "PLAN", directHours: 1000, recoverabilityPct: 50 }), // → 400
    // BLDG has a bucket but no recoverable hours → falls through to engine.
    bucket({ id: "fa-5b", dept: "BLDG", directHours: 0, recoverabilityPct: 100 }),
    // ENG has no buckets at all → falls through to engine.
  ];
  const fa = deriveFunctionalAllocation(buckets, engine);
  const out = applyFunctionalAllocationFbhr(engine, fa);
  assert.equal(out.PLAN.fbhr, 400, "PLAN overridden to implied FBHR");
  assert.equal(out.BLDG.fbhr, 250, "BLDG falls through when implied is null");
  assert.equal(out.ENG.fbhr, 300, "ENG falls through when no buckets present");
  // Component rates stay engine values — they're not rewritten.
  assert.equal(out.PLAN.directRate, 100, "directRate preserved");
  assert.equal(out.PLAN.operatingRate, 50, "operatingRate preserved");
  assert.equal(out.PLAN.capRate, 50, "capRate preserved");
  console.log("  ✓ apply override only rewrites headline fbhr; missing/null falls through");
}

console.log("\nAll Functional Allocation assertions passed.");
