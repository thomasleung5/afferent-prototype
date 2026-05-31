/* Fee-display fixture.
 *
 * Run with: npm run test:fee-display
 *
 * Pins the contract: structured `formula` drives display narrative
 * when present; otherwise numeric formatting from the comparison.
 * Non-recoverable rows render em-dash on the recommended side so the
 * cell doesn't show a misleading unitCost × target value. */

import assert from "node:assert/strict";
import {
  displayCostOfService, displayCurrentFee, displayRecommendedFee,
  summarizeFee,
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

// ── 1. displayCurrentFee: numeric fallback when no formula ──────────────
{
  assert.equal(displayCurrentFee(baseService), "$250",
    "no formula → fmt.dollars(fee)");
  assert.equal(displayCurrentFee({ ...baseService, fee: 0 }), "$0",
    "zero fee still formats numerically");
  console.log("  ✓ displayCurrentFee numeric fallback");
}

// ── 2. displayCurrentFee: structured formula renders summary ────────────
{
  const svc: Service = {
    ...baseService,
    formula: { kind: "time-and-materials", hourlyRate: 185 },
  };
  assert.equal(displayCurrentFee(svc), "$185/hr",
    "formula present → summarizeFee output replaces numeric");
  console.log("  ✓ displayCurrentFee renders structured formula");
}

// ── 3. displayRecommendedFee: comparison fallback ───────────────────────
{
  assert.equal(
    displayRecommendedFee(baseService, { recommended: 1875 }), "$1,875",
    "comparison present → format comparison.recommended",
  );

  assert.equal(
    displayRecommendedFee(baseService), "—",
    "no comparison → em-dash, not a misleading numeric",
  );
  console.log("  ✓ displayRecommendedFee comparison + missing-comparison");
}

// ── 4. displayRecommendedFee: non-recoverable rows show em-dash ─────────
//      A non-flat row with fee=0 isn't recoverable, so the computed
//      recommended (unitCost × target) would be misleading — the helper
//      returns "—" instead.
{
  const tmRow: Service = {
    ...baseService,
    formula: { kind: "time-and-materials" },
    fee: 0,
  };
  assert.equal(
    displayRecommendedFee(tmRow, { recommended: 500 }), "—",
    "non-recoverable T&M row: em-dash even when comparison.recommended is set",
  );
  console.log("  ✓ displayRecommendedFee gates on isRecoverableFeeRow");
}

// ── 5. displayCostOfService: comparison fallback ────────────────────────
{
  assert.equal(
    displayCostOfService(baseService, { unitCost: 750 }), "$750",
    "comparison present → format comparison.unitCost",
  );
  assert.equal(
    displayCostOfService(baseService), "—",
    "no comparison → em-dash",
  );
  console.log("  ✓ displayCostOfService comparison + missing-comparison");
}

// ── 6. summarizeFee: no formula → undefined ────────────────────────────
{
  assert.equal(summarizeFee(baseService), undefined,
    "service with no formula returns undefined (caller falls back)");
  console.log("  ✓ summarizeFee returns undefined without formula");
}

// ── 9. summarizeFee: tiered-valuation with typicalBasis ────────────────
//      Matches the SFR seed row in lib/data/services.ts. The 6-tier
//      schedule evaluated at $1.5M lands inside tier 5 (1M–3M):
//      8650 + (500_000 / 1000) × 9.70 = 8650 + 4850 = 13500.
{
  const svc: Service = {
    ...baseService,
    formula: {
      kind: "tiered-valuation",
      basis: "construction valuation",
      typicalBasis: 1_500_000,
      tiers: [
        { upTo:   25_000, baseFee:     0, perUnit: 12,    unitSize: 1000 },
        { upTo:  100_000, baseFee:   300, perUnit: 10,    unitSize: 1000 },
        { upTo:  500_000, baseFee:  1050, perUnit:  9,    unitSize: 1000 },
        { upTo: 1_000_000, baseFee: 4650, perUnit:  8,    unitSize: 1000 },
        { upTo: 3_000_000, baseFee: 8650, perUnit:  9.70, unitSize: 1000 },
        {                  baseFee: 28050, perUnit: 8,    unitSize: 1000 },
      ],
    },
  };
  assert.equal(
    summarizeFee(svc),
    "Tiered (typ. $13,500 @ $1.50M construction valuation)",
    "tiered-valuation @ typicalBasis renders the dollar example",
  );
  console.log("  ✓ summarizeFee tiered-valuation with typicalBasis");
}

// ── 10. summarizeFee: tiered-valuation without typicalBasis → range ────
{
  const svc: Service = {
    ...baseService,
    formula: {
      kind: "tiered-valuation",
      basis: "construction valuation",
      tiers: [
        { upTo: 25_000, baseFee:   0, perUnit: 12, unitSize: 1000 },
        { upTo: 100_000, baseFee: 300, perUnit: 10, unitSize: 1000 },
        {                baseFee: 1050, perUnit:  9, unitSize: 1000 },
      ],
    },
  };
  // Bottom: tier 1 at basis 0 → 0. Top: last bounded tier (100k) →
  // 300 + (75_000/1000)×10 = 1050.
  assert.equal(
    summarizeFee(svc),
    "Tiered ($0–$1,050 per construction valuation)",
    "no typicalBasis → range across the bounded schedule",
  );
  console.log("  ✓ summarizeFee tiered-valuation range fallback");
}

// ── 11. summarizeFee: percentage with min/max ──────────────────────────
{
  const minOnly: Service = {
    ...baseService,
    formula: { kind: "percentage", basis: "valuation", rate: 5, minFee: 500 },
  };
  assert.equal(summarizeFee(minOnly), "5% of valuation, min $500");

  const both: Service = {
    ...baseService,
    formula: {
      kind: "percentage", basis: "contract amount", rate: 2.5,
      minFee: 100, maxFee: 10_000,
    },
  };
  assert.equal(summarizeFee(both), "2.5% of contract amount, min $100, max $10,000");
  console.log("  ✓ summarizeFee percentage with optional bounds");
}

// ── 12. summarizeFee: per-unit + expression escape hatch ───────────────
{
  const perUnit: Service = {
    ...baseService,
    formula: { kind: "per-unit", unit: "linear foot", rate: 12 },
  };
  assert.equal(summarizeFee(perUnit), "$12 per linear foot");

  const perUnitMin: Service = {
    ...baseService,
    formula: { kind: "per-unit", unit: "sq ft", rate: 0.75, minFee: 50 },
  };
  assert.equal(summarizeFee(perUnitMin), "$1 per sq ft (min $50)");

  const expr: Service = {
    ...baseService,
    formula: { kind: "expression", text: "$250 + $0.10/sqft over 5000 sqft" },
  };
  assert.equal(summarizeFee(expr), "$250 + $0.10/sqft over 5000 sqft");
  console.log("  ✓ summarizeFee per-unit + expression");
}

// ── 13. summarizeFee: empty-tier schedule defends against bad data ─────
{
  const svc: Service = {
    ...baseService,
    formula: {
      kind: "tiered-valuation", basis: "valuation", tiers: [],
    },
  };
  assert.equal(summarizeFee(svc), undefined,
    "empty tiers → undefined (caller falls back rather than rendering '$0')");
  console.log("  ✓ summarizeFee empty-tier defense");
}

// ── 14. summarizeFee: deposit with actuals vs. published rate ──────────
{
  const actuals: Service = {
    ...baseService,
    formula: { kind: "deposit", amount: 500, balance: "actuals" },
  };
  assert.equal(summarizeFee(actuals), "$500 deposit, balance at actuals");

  const billed: Service = {
    ...baseService,
    formula: {
      kind: "deposit", amount: 2500,
      balance: { rate: 185, unit: "hr" },
    },
  };
  assert.equal(summarizeFee(billed), "$2,500 deposit, balance at $185/hr");
  console.log("  ✓ summarizeFee deposit (actuals + published rate)");
}

// ── 15. summarizeFee: time-and-materials ───────────────────────────────
{
  const bare: Service = {
    ...baseService,
    formula: { kind: "time-and-materials" },
  };
  assert.equal(summarizeFee(bare), "Billed at actual cost");

  const minOnly: Service = {
    ...baseService,
    formula: { kind: "time-and-materials", minimum: 200 },
  };
  assert.equal(summarizeFee(minOnly), "Billed at actual cost (min $200)");

  const rateOnly: Service = {
    ...baseService,
    formula: { kind: "time-and-materials", hourlyRate: 185 },
  };
  assert.equal(summarizeFee(rateOnly), "$185/hr");

  const both: Service = {
    ...baseService,
    formula: { kind: "time-and-materials", hourlyRate: 185, minimum: 200 },
  };
  assert.equal(summarizeFee(both), "$185/hr (min $200)");
  console.log("  ✓ summarizeFee T&M (bare + min + rate + both)");
}

// ── 16. summarizeFee: pass-through ─────────────────────────────────────
{
  const bare: Service = {
    ...baseService,
    formula: { kind: "pass-through" },
  };
  assert.equal(summarizeFee(bare), "Pass-through at actual cost");

  const markup: Service = {
    ...baseService,
    formula: { kind: "pass-through", markup: 10 },
  };
  assert.equal(summarizeFee(markup), "Pass-through + 10% admin");
  console.log("  ✓ summarizeFee pass-through (bare + markup)");
}

// ── 17. summarizeFee: statutory ────────────────────────────────────────
{
  const bare: Service = {
    ...baseService,
    formula: { kind: "statutory" },
  };
  assert.equal(summarizeFee(bare), "Set by statute");

  const capped: Service = {
    ...baseService,
    formula: { kind: "statutory", cap: 30 },
  };
  assert.equal(summarizeFee(capped), "Statutory cap: $30");
  console.log("  ✓ summarizeFee statutory (bare + cap)");
}

console.log("\nAll feeDisplay assertions passed.");
