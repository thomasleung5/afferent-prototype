/* Fee-display fixture.
 *
 * Run with: npm run test:fee-display
 *
 * Pins the PR-L2 contract: text overrides win when set, numeric
 * formatting otherwise. The empty-string case is the load-bearing
 * one — analysts use blank text to suppress the numeric display for
 * rows that intentionally have no published fee, so an empty string
 * is "set", not "absent". */

import assert from "node:assert/strict";
import {
  displayCurrentFee, displayFullCostFee, displayRecommendedFee,
} from "../feeDisplay";
import type { Service } from "../types";

const baseService: Service = {
  id: "svc-test",
  name: "Test service",
  dept: "PLAN",
  volume: 10,
  hours: 5,
  cost: 0,
  fee: 250,
  peer: 0,
  target: 100,
  source: "seed",
};

// ── 1. displayCurrentFee: numeric fallback ───────────────────────────────
{
  assert.equal(displayCurrentFee(baseService), "$250",
    "PR-L2: no override → fmt.dollars(fee)");
  assert.equal(displayCurrentFee({ ...baseService, fee: 0 }), "$0",
    "PR-L2: zero fee still formats numerically");
  console.log("  ✓ displayCurrentFee numeric fallback");
}

// ── 2. displayCurrentFee: text override wins ────────────────────────────
{
  const svc = { ...baseService, currentFeeText: "T&M w/ $500 deposit" };
  assert.equal(displayCurrentFee(svc), "T&M w/ $500 deposit");
  console.log("  ✓ displayCurrentFee text override wins");
}

// ── 3. displayCurrentFee: empty-string override is deliberate (load-bearing)
{
  // Analyst entered "" to suppress the numeric display — typically
  // because the row's pricing is structural (status: "not-evaluated",
  // rowKind: "deleted") and the legacy `fee` numeric is a stale
  // remnant. Empty string MUST render blank, not fall through to "$X".
  const svc = { ...baseService, currentFeeText: "" };
  assert.equal(displayCurrentFee(svc), "",
    "PR-L2: empty string is a deliberate suppression — treat as set");
  console.log("  ✓ empty-string override is deliberate (not fallback)");
}

// ── 4. displayRecommendedFee: numeric fallback + override ───────────────
{
  const computed = 1875;
  assert.equal(displayRecommendedFee(baseService, computed), "$1,875",
    "PR-L2: no override → format the passed-in computed amount");
  const svc = { ...baseService, recommendedFeeText: "5% of valuation" };
  assert.equal(displayRecommendedFee(svc, computed), "5% of valuation",
    "PR-L2: recommendedFeeText wins, computed number is ignored");
  console.log("  ✓ displayRecommendedFee override + fallback");
}

// ── 5. displayFullCostFee: numeric fallback + override ──────────────────
{
  const unitCost = 750;
  assert.equal(displayFullCostFee(baseService, unitCost), "$750",
    "PR-L2: no override → format the passed-in unit cost");
  const svc = { ...baseService, fullCostRecoveryFeeText: "Actual cost (T&M)" };
  assert.equal(displayFullCostFee(svc, unitCost), "Actual cost (T&M)",
    "PR-L2: fullCostRecoveryFeeText wins");
  console.log("  ✓ displayFullCostFee override + fallback");
}

// ── 6. Override fields are independent of each other ────────────────────
{
  const svc: Service = {
    ...baseService,
    currentFeeText: "Free (waived)",
    // recommendedFeeText + fullCostRecoveryFeeText intentionally unset
  };
  assert.equal(displayCurrentFee(svc), "Free (waived)");
  assert.equal(displayRecommendedFee(svc, 100), "$100",
    "PR-L2: currentFeeText override does NOT leak into recommended display");
  assert.equal(displayFullCostFee(svc, 200), "$200",
    "PR-L2: currentFeeText override does NOT leak into full-cost display");
  console.log("  ✓ text-override fields are mutually independent");
}

console.log("\nAll feeDisplay assertions passed.");
