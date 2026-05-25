/* Calc-layer fixture.
 *
 * Run with: npm run test:calc
 *
 * Pins the PR-L3 contract: isCountableFee + the aggregate gating in
 * policyImpact / feeComparisons. The load-bearing assertions are:
 *
 *   - Existing seed shape (rowKind + status both undefined) stays
 *     countable, so PR-L3 changes ZERO numbers for the LAH /
 *     Maplewood baselines.
 *   - Each non-countable rowKind / status family individually flips
 *     `countable` off — so if the gate ever drifts (someone forgets
 *     to add a new RowKind to the gate logic), the offending case
 *     fails fast.
 *   - policyImpact aggregates filter on `countable` — a T&M row's
 *     bogus fee × volume "revenue" does not pollute the closeable
 *     gap or the recovery percentage. */

import assert from "node:assert/strict";
import {
  feeComparisons, isCountableFee, policyImpact, serviceCosts,
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

// ── 1. Legacy / undefined fields stay countable ──────────────────────────
//      THE load-bearing back-compat assertion: every existing seed row
//      (rowKind + status both undefined) MUST stay countable so PR-L3
//      changes zero numbers for the LAH / Maplewood baselines.
{
  assert.equal(isCountableFee(svc()), true,
    "PR-L3: undefined rowKind + status → defaults to flat/existing → countable");
  assert.equal(isCountableFee(svc({ rowKind: "flat" })), true,
    "PR-L3: explicit flat is countable");
  assert.equal(isCountableFee(svc({ rowKind: "formula" })), true,
    "PR-L3: formula rows count for recovery math (still a published fee, just computed)");
  console.log("  ✓ legacy shape + flat + formula stay countable");
}

// ── 2. Non-flat rowKinds flip countable off ──────────────────────────────
//      If anyone adds a new RowKind to types.ts without updating the
//      gate logic, the offending case fails here.
{
  const nonCountableKinds: FeeRowKind[] = [
    "deposit",
    "time-and-materials",
    "pass-through",
    "statutory",
  ];
  for (const kind of nonCountableKinds) {
    assert.equal(isCountableFee(svc({ rowKind: kind })), false,
      `PR-L3: rowKind "${kind}" is NOT countable`);
  }
  console.log("  ✓ deposit / T&M / pass-through / statutory excluded");
}

// ── 3. Status flips: deleted / not-evaluated excluded; others count ─────
{
  const lifecycleCountable: FeeScheduleStatus[] = [
    "existing", "new", "renamed", "moved",
  ];
  for (const status of lifecycleCountable) {
    assert.equal(isCountableFee(svc({ status })), true,
      `PR-L3: status "${status}" is countable on a flat row`);
  }
  assert.equal(isCountableFee(svc({ status: "deleted" })), false,
    "PR-L3: deleted rows excluded from forward-looking recovery math");
  assert.equal(isCountableFee(svc({ status: "not-evaluated" })), false,
    "PR-L3: not-evaluated rows excluded — we haven't analyzed them yet");
  console.log("  ✓ status gating (existing/new/renamed/moved count; deleted/NE don't)");
}

// ── 4. policyImpact filters on countable ─────────────────────────────────
//      A flat-row baseline establishes the expected numbers; then we add
//      a T&M row with bogus fee×volume "revenue" and assert that totals
//      DON'T move. This is the load-bearing math-correctness assertion.
{
  const flatRow = svc({
    id: "svc-flat", dept: "PLAN", volume: 10, hours: 5, fee: 200,
  });
  const baselineCosts = serviceCosts([flatRow], fbhr);
  const baselineCmp = feeComparisons(baselineCosts, [flatRow], [], []);
  const baselineImpact = policyImpact(baselineCmp);
  // unitCost = 5h × $50/hr = $250; annual = 250 × 10 = 2500
  // currentRev = 200 × 10 = 2000; intendedRev = 2500 × 1.00 = 2500
  assert.equal(baselineImpact.totalCost,       2500);
  assert.equal(baselineImpact.currentRevenue,  2000);
  assert.equal(baselineImpact.intendedRevenue, 2500);

  const tmRow = svc({
    id: "svc-tm", dept: "PLAN", volume: 20, hours: 3,
    fee: 500, // deposit estimate — bogus to multiply for revenue
    rowKind: "time-and-materials",
  });
  const withTm = [flatRow, tmRow];
  const tmCosts = serviceCosts(withTm, fbhr);
  const tmCmp = feeComparisons(tmCosts, withTm, [], []);
  const tmImpact = policyImpact(tmCmp);
  assert.equal(tmImpact.totalCost,       2500,
    "PR-L3: T&M row's annualCost is NOT added to totalCost aggregate");
  assert.equal(tmImpact.currentRevenue,  2000,
    "PR-L3: T&M row's bogus fee×volume revenue NOT added to currentRevenue");
  assert.equal(tmImpact.intendedRevenue, 2500,
    "PR-L3: T&M row's intendedRevenue NOT added (no meaningful target)");
  assert.equal(tmImpact.recoverableGap,  500,
    "PR-L3: gap = intended − current = 500 — unchanged by the T&M row");
  console.log("  ✓ policyImpact aggregates filter on countable");
}

// ── 5. Per-row fields still populated for non-countable rows ────────────
//      We filter at the AGGREGATE layer, not at the per-row layer, so the
//      UI can still render a T&M row's cost / recommended / uplift even
//      though they don't contribute to totals.
{
  const tmRow = svc({
    id: "svc-tm", dept: "PLAN", volume: 20, hours: 3,
    fee: 500, rowKind: "time-and-materials",
  });
  const costs = serviceCosts([tmRow], fbhr);
  const [cmp] = feeComparisons(costs, [tmRow], [], []);
  assert.equal(cmp.countable, false, "PR-L3: countable flag set correctly");
  assert.equal(cmp.annualCost, 3000,
    "PR-L3: annualCost still computed per-row (5h × $50 × 20 doesn't apply; 3h × $50 × 20 = 3000)");
  assert.equal(cmp.recommended, 150,
    "PR-L3: recommended fee still computed per-row (3h × $50 = $150 at 100% target)");
  console.log("  ✓ per-row math still runs for non-countable rows");
}

console.log("\nAll calc assertions passed.");
