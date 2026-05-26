/* Fee-display fixture.
 *
 * Run with: npm run test:fee-display
 *
 * Pins the contract: text overrides win when set, numeric formatting
 * otherwise. The empty-string case is the load-bearing one — blank
 * text is a deliberate suppression of the numeric display for rows
 * that intentionally have no published fee, so an empty string is
 * "set", not "absent". */

import assert from "node:assert/strict";
import {
  displayCostOfService, displayCurrentFee, displayFullCostFee,
  displayRecommendedFee,
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
    "no override → fmt.dollars(fee)");
  assert.equal(displayCurrentFee({ ...baseService, fee: 0 }), "$0",
    "zero fee still formats numerically");
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
  // Empty string MUST render blank, not fall through to "$X" — analysts
  // use "" to suppress numeric display for rows that intentionally
  // have no published fee (status: "not-evaluated", rowKind: "deleted").
  const svc = { ...baseService, currentFeeText: "" };
  assert.equal(displayCurrentFee(svc), "",
    "empty string is a deliberate suppression — treat as set");
  console.log("  ✓ empty-string override is deliberate (not fallback)");
}

// ── 4. displayRecommendedFee: comparison fallback + override ────────────
{
  // No override + comparison present → fmt the comparison's recommended.
  assert.equal(
    displayRecommendedFee(baseService, { recommended: 1875 }), "$1,875",
    "no override + comparison present → format comparison.recommended",
  );

  // Override wins regardless of comparison.
  const svc = { ...baseService, recommendedFeeText: "5% of valuation" };
  assert.equal(
    displayRecommendedFee(svc, { recommended: 1875 }), "5% of valuation",
    "recommendedFeeText wins, comparison ignored",
  );

  // No comparison + no override → em-dash (rather than misleading $0).
  assert.equal(
    displayRecommendedFee(baseService), "—",
    "no comparison → em-dash, not a misleading numeric",
  );
  console.log("  ✓ displayRecommendedFee comparison + override + missing-comparison");
}

// ── 5. displayRecommendedFee: non-recoverable rows show em-dash ─────────
//      A non-flat row with fee=0 isn't recoverable, so the computed
//      recommended (unitCost × target) would be misleading — the helper
//      returns "—" instead. Text override still wins if present.
{
  const tmRow: Service = {
    ...baseService,
    rowKind: "time-and-materials",
    fee: 0,
  };
  assert.equal(
    displayRecommendedFee(tmRow, { recommended: 500 }), "—",
    "non-recoverable T&M row: em-dash even when comparison.recommended is set",
  );
  const tmRowWithOverride: Service = {
    ...tmRow,
    recommendedFeeText: "Billed at actual cost",
  };
  assert.equal(
    displayRecommendedFee(tmRowWithOverride, { recommended: 500 }),
    "Billed at actual cost",
    "non-recoverable row: text override still wins",
  );
  console.log("  ✓ displayRecommendedFee gates on isRecoverableFeeRow");
}

// ── 6. displayCostOfService: comparison fallback + override ─────────────
{
  assert.equal(
    displayCostOfService(baseService, { unitCost: 750 }), "$750",
    "no override + comparison present → format comparison.unitCost",
  );
  const svc = { ...baseService, fullCostRecoveryFeeText: "Actual cost (T&M)" };
  assert.equal(
    displayCostOfService(svc, { unitCost: 750 }), "Actual cost (T&M)",
    "fullCostRecoveryFeeText wins",
  );
  assert.equal(
    displayCostOfService(baseService), "—",
    "no comparison → em-dash",
  );
  console.log("  ✓ displayCostOfService comparison + override + missing-comparison");
}

// ── 7. displayFullCostFee deprecated adapter still works ────────────────
{
  // Old callers passing (service, unitCost: number) should still produce
  // the right output via the back-compat adapter.
  assert.equal(displayFullCostFee(baseService, 750), "$750");
  const svc = { ...baseService, fullCostRecoveryFeeText: "Actual cost (T&M)" };
  assert.equal(displayFullCostFee(svc, 750), "Actual cost (T&M)");
  console.log("  ✓ displayFullCostFee deprecated adapter preserves old signature");
}

// ── 8. Override fields are independent of each other ────────────────────
{
  const svc: Service = {
    ...baseService,
    currentFeeText: "Free (waived)",
  };
  assert.equal(displayCurrentFee(svc), "Free (waived)");
  assert.equal(
    displayRecommendedFee(svc, { recommended: 100 }), "$100",
    "currentFeeText override does NOT leak into recommended display",
  );
  assert.equal(
    displayCostOfService(svc, { unitCost: 200 }), "$200",
    "currentFeeText override does NOT leak into cost-of-service display",
  );
  console.log("  ✓ text-override fields are mutually independent");
}

console.log("\nAll feeDisplay assertions passed.");
