/* Calc-layer fixture.
 *
 * Run with: npm run test:calc
 *
 * Pins the isRecoverableFeeRow contract + the aggregate gating in
 * policyImpact / feeComparisons. Load-bearing assertions:
 *
 *   - Existing seed shape (no formula) stays recoverable, so the gate
 *     changes ZERO numbers for the legacy LAH / Maplewood baselines.
 *   - Non-flat formula kinds (deposit / T&M / pass-through / statutory /
 *     the four structured-formula sub-kinds) honor the numeric-fee
 *     escape hatch: fee > 0 → in; fee = 0 → out.
 *   - policyImpact aggregates filter on `recoverable` — a T&M row
 *     with fee=0 does NOT pollute the closeable gap. */

import assert from "node:assert/strict";
import {
  feeComparisons, isRecoverableFeeRow, policyImpact, serviceCosts,
} from "../calc";
import type { FBHR } from "../calc";
import { FEE_DEPTS } from "../data/departments";
import type { DeptCode, FeeFormula, FeeRowKind, Service } from "../types";

/** Minimal formula payload for each non-flat FeeRowKind — lets the
 *  isRecoverableFeeRow loop test every kind without per-iteration
 *  boilerplate. The "formula" rowKind collapses four FeeFormula
 *  sub-kinds; "expression" is the simplest choice. */
const FORMULA_FOR: Record<Exclude<FeeRowKind, "flat">, FeeFormula> = {
  "formula":             { kind: "expression", text: "test" },
  "deposit":             { kind: "deposit", amount: 0, balance: "actuals" },
  "time-and-materials":  { kind: "time-and-materials" },
  "pass-through":        { kind: "pass-through" },
  "statutory":           { kind: "statutory" },
};

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

const fbhr = Object.fromEntries(
  FEE_DEPTS.map((dept) => [dept, {
    dept,
    directRate: 0,
    operatingRate: 0,
    capRate: 0,
    fbhr: ["PLAN", "BLDG", "ENG"].includes(dept) ? 50 : 0,
    productiveHours: ["PLAN", "BLDG", "ENG"].includes(dept) ? 1000 : 0,
    directDollars: 0,
    operatingDollars: 0,
    capDollars: 0,
  }]),
) as Record<DeptCode, FBHR>;

// ── 1. Legacy / undefined fields stay recoverable ────────────────────────
//      THE load-bearing back-compat assertion: every existing seed row
//      (no formula + no status) MUST stay recoverable so the gate
//      changes zero numbers for the LAH / Maplewood baselines.
{
  assert.equal(isRecoverableFeeRow(svc()), true,
    "legacy: no formula → defaults to flat → recoverable");
  console.log("  ✓ legacy flat shape stays recoverable");
}

// ── 2. Non-flat formula kinds: numeric-fee escape hatch ─────────────────
//      Without a numeric fee, non-flat rows don't contribute to recovery
//      math. With fee > 0, the analyst has acknowledged a representative
//      value and the row IS included.
{
  const nonFlatKinds = Object.keys(FORMULA_FOR) as Array<keyof typeof FORMULA_FOR>;
  for (const kind of nonFlatKinds) {
    const formula = FORMULA_FOR[kind];
    assert.equal(isRecoverableFeeRow(svc({ formula, fee: 0 })), false,
      `kind "${kind}" with fee=0 → NOT recoverable (no representative value)`);
    assert.equal(isRecoverableFeeRow(svc({ formula, fee: 500 })), true,
      `kind "${kind}" with fee=500 → recoverable (analyst-supplied anchor)`);
  }
  console.log("  ✓ non-flat numeric-fee escape hatch (fee>0 in, fee=0 out)");
}

// ── 4. policyImpact aggregates filter on `recoverable` ──────────────────
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
    fee: 0, formula: { kind: "time-and-materials" },
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
    fee: 0, formula: { kind: "time-and-materials" },
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

// ── 7. PolicyException matching: serviceId wins; legacy name still works ─
//      Pins targetFor's contract through feeComparisons (the only public
//      surface that reaches it). Three branches:
//
//        a. id-backed exception overrides the dept target,
//        b. legacy name-backed exception (no serviceId) overrides the
//           dept target via case-insensitive name match,
//        c. an exception whose serviceId points at a row that doesn't
//           exist falls through to the dept target without crashing,
//           AND an id-backed exception for service A does NOT hijack
//           service B even when B's name matches the exception's `fee`. */
{
  // Two services, one shares its name with the other to prove that
  // id-backing wins over name collision.
  const planA = svc({ id: "svc-A", name: "ADU Permit", dept: "PLAN", volume: 10, hours: 5, fee: 100 });
  const planB = svc({ id: "svc-B", name: "ADU Permit", dept: "PLAN", volume: 10, hours: 5, fee: 100 });
  const planTarget = { id: "t-plan", dept: "PLAN" as const, target: 100, note: "" };

  // (a) id-backed → only the matching service id gets the override.
  {
    const costs = serviceCosts([planA, planB], fbhr);
    const exc = [{ id: "exc-id", serviceId: "svc-A", fee: "Something Else", target: 50, note: "" }];
    const [cmpA, cmpB] = feeComparisons(costs, [planA, planB], [planTarget], exc);
    assert.equal(cmpA.target, 50, "serviceId match overrides dept target on svc-A");
    assert.equal(cmpB.target, 100, "svc-B keeps dept target — id-backed exception did NOT hijack it via name");
  }

  // (b) legacy name-backed → applies via case-insensitive fee-name match.
  {
    const costs = serviceCosts([planA], fbhr);
    const exc = [{ id: "exc-legacy", fee: "adu permit", target: 25, note: "" }];
    const [cmpA] = feeComparisons(costs, [planA], [planTarget], exc);
    assert.equal(cmpA.target, 25, "legacy name match (case-insensitive) still overrides");
  }

  // (c) orphan serviceId → no crash, falls through to dept target.
  {
    const costs = serviceCosts([planA], fbhr);
    const exc = [{ id: "exc-orphan", serviceId: "svc-DOES-NOT-EXIST", fee: "ADU Permit", target: 25, note: "" }];
    const [cmpA] = feeComparisons(costs, [planA], [planTarget], exc);
    assert.equal(cmpA.target, 100, "orphan exception falls through; name match is suppressed because serviceId is set");
  }
  console.log("  ✓ exception matching: id wins, legacy name fallback, orphan falls through safely");
}

console.log("\nAll calc assertions passed.");
