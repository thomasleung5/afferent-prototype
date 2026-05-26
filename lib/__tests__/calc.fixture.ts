/* Calc-layer fixture.
 *
 * Run with: npm run test:calc
 *
 * Pins the isRecoverableFeeRow contract + the aggregate gating in
 * policyImpact / feeComparisons. Load-bearing assertions:
 *
 *   - Existing seed shape (rowKind + status both undefined) stays
 *     recoverable, so the gate changes ZERO numbers for the legacy
 *     LAH / Maplewood baselines.
 *   - Lifecycle gates: deleted / not-evaluated / moved excluded
 *     regardless of rowKind.
 *   - Non-flat rowKinds (deposit / T&M / pass-through / statutory /
 *     formula) honor the numeric-fee escape hatch: fee > 0 → in;
 *     fee = 0 → out.
 *   - policyImpact aggregates filter on `recoverable` — a T&M row
 *     with fee=0 does NOT pollute the closeable gap. */

import assert from "node:assert/strict";
import {
  feeComparisons, isRecoverableFeeRow, policyImpact, serviceCosts,
} from "../calc";
import type { FBHR } from "../calc";
import type { DeptCode, FeeRowKind, FeeScheduleStatus, Service } from "../types";

const svc = (overrides: Partial<Service> = {}): Service => ({
  id: "svc-x",
  name: "Test service",
  dept: "PLAN",
  volume: 10,
  hours: 5,
  cost: 0,
  fee: 100,
  peer: 0,
  target: 100,
  source: "seed",
  ...overrides,
});

const fbhr: Record<DeptCode, FBHR> = {
  PLAN:  { dept: "PLAN",  directRate: 0, operatingRate: 0, capRate: 0, fbhr: 50, productiveHours: 1000, directDollars: 0, operatingDollars: 0, capDollars: 0 },
  BLDG:  { dept: "BLDG",  directRate: 0, operatingRate: 0, capRate: 0, fbhr: 50, productiveHours: 1000, directDollars: 0, operatingDollars: 0, capDollars: 0 },
  ENG:   { dept: "ENG",   directRate: 0, operatingRate: 0, capRate: 0, fbhr: 50, productiveHours: 1000, directDollars: 0, operatingDollars: 0, capDollars: 0 },
  PARKS: { dept: "PARKS", directRate: 0, operatingRate: 0, capRate: 0, fbhr: 0,  productiveHours: 0,    directDollars: 0, operatingDollars: 0, capDollars: 0 },
  PD:    { dept: "PD",    directRate: 0, operatingRate: 0, capRate: 0, fbhr: 0,  productiveHours: 0,    directDollars: 0, operatingDollars: 0, capDollars: 0 },
  FIRE:  { dept: "FIRE",  directRate: 0, operatingRate: 0, capRate: 0, fbhr: 0,  productiveHours: 0,    directDollars: 0, operatingDollars: 0, capDollars: 0 },
};

// ── 1. Legacy / undefined fields stay recoverable ────────────────────────
//      THE load-bearing back-compat assertion: every existing seed row
//      (rowKind + status both undefined) MUST stay recoverable so the
//      gate changes zero numbers for the LAH / Maplewood baselines.
{
  assert.equal(isRecoverableFeeRow(svc()), true,
    "legacy: undefined rowKind + status → defaults to flat/existing → recoverable");
  assert.equal(isRecoverableFeeRow(svc({ rowKind: "flat" })), true,
    "explicit flat is recoverable");
  console.log("  ✓ legacy + flat shapes stay recoverable");
}

// ── 2. Lifecycle gates exclude regardless of rowKind ─────────────────────
{
  const excluded: FeeScheduleStatus[] = ["deleted", "not-evaluated", "moved"];
  for (const status of excluded) {
    assert.equal(isRecoverableFeeRow(svc({ status })), false,
      `status "${status}" → not recoverable (even on a flat row with fee>0)`);
    assert.equal(isRecoverableFeeRow(svc({ status, rowKind: "formula", fee: 1000 })), false,
      `status "${status}" → not recoverable (even on a formula row with anchor fee)`);
  }
  console.log("  ✓ lifecycle gates (deleted / not-evaluated / moved) exclude all rowKinds");
}

// ── 3. Non-flat rowKinds: numeric-fee escape hatch ───────────────────────
//      Without a numeric fee, non-flat rows don't contribute to recovery
//      math. With fee > 0, the analyst has acknowledged a representative
//      value and the row IS included.
{
  const nonFlatKinds: FeeRowKind[] = [
    "formula", "deposit", "time-and-materials", "pass-through", "statutory",
  ];
  for (const kind of nonFlatKinds) {
    assert.equal(isRecoverableFeeRow(svc({ rowKind: kind, fee: 0 })), false,
      `rowKind "${kind}" with fee=0 → NOT recoverable (no representative value)`);
    assert.equal(isRecoverableFeeRow(svc({ rowKind: kind, fee: 500 })), true,
      `rowKind "${kind}" with fee=500 → recoverable (analyst-supplied anchor)`);
  }
  console.log("  ✓ non-flat numeric-fee escape hatch (fee>0 in, fee=0 out)");
}

// ── 4. Display text overrides do NOT affect the math gate ───────────────
//      currentFeeText / recommendedFeeText / fullCostRecoveryFeeText are
//      INTERNAL infrastructure for preserving imported wording — they
//      control rendering only, never recovery math.
{
  const svcWithOverride = svc({
    rowKind: "formula", fee: 1000,
    currentFeeText: "Tiered — typical $1,000",
    recommendedFeeText: "Tiered — full recovery",
  });
  assert.equal(isRecoverableFeeRow(svcWithOverride), true,
    "*Text overrides do not change recoverable status; fee>0 still wins");
  console.log("  ✓ display text overrides don't affect the math gate");
}

// ── 5. policyImpact aggregates filter on `recoverable` ──────────────────
//      Baseline (one flat row) vs baseline + non-recoverable T&M row
//      with fee=0. The aggregate must not move.
{
  const flatRow = svc({
    id: "svc-flat", dept: "PLAN", volume: 10, hours: 5, fee: 200,
  });
  const baselineCosts = serviceCosts([flatRow], fbhr);
  const baselineCmp = feeComparisons(baselineCosts, [flatRow], [], []);
  const baselineImpact = policyImpact(baselineCmp);
  assert.equal(baselineImpact.totalCost,       2500);
  assert.equal(baselineImpact.currentRevenue,  2000);
  assert.equal(baselineImpact.intendedRevenue, 2500);

  // T&M row with fee=0 — non-recoverable, must not move totals.
  const tmRow = svc({
    id: "svc-tm", dept: "PLAN", volume: 20, hours: 3,
    fee: 0, rowKind: "time-and-materials",
  });
  const withTm = [flatRow, tmRow];
  const tmImpact = policyImpact(feeComparisons(serviceCosts(withTm, fbhr), withTm, [], []));
  assert.equal(tmImpact.totalCost,       2500,
    "T&M row with fee=0: annualCost NOT added to totalCost aggregate");
  assert.equal(tmImpact.currentRevenue,  2000,
    "T&M row with fee=0: no revenue contribution");
  assert.equal(tmImpact.intendedRevenue, 2500,
    "T&M row with fee=0: no intended-revenue contribution");
  console.log("  ✓ policyImpact aggregates skip non-recoverable rows");
}

// ── 6. Per-row fields still populated for non-recoverable rows ──────────
//      Filter happens at the AGGREGATE layer, not per-row, so the UI
//      can still render a non-recoverable row's cost / recommended /
//      uplift even though they don't contribute to totals.
{
  const tmRow = svc({
    id: "svc-tm", dept: "PLAN", volume: 20, hours: 3,
    fee: 0, rowKind: "time-and-materials",
  });
  const costs = serviceCosts([tmRow], fbhr);
  const [cmp] = feeComparisons(costs, [tmRow], [], []);
  assert.equal(cmp.recoverable, false, "recoverable flag set correctly");
  assert.equal(cmp.annualCost, 3000,
    "annualCost still computed per-row (3h × $50 × 20 = 3000)");
  assert.equal(cmp.recommended, 150,
    "recommended fee still computed per-row (3h × $50 = $150 at 100% target)");
  console.log("  ✓ per-row math still runs for non-recoverable rows");
}

console.log("\nAll calc assertions passed.");
