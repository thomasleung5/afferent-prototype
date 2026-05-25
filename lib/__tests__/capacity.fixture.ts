/* Capacity-layer fixture.
 *
 * Run with: npm run test:capacity
 *
 * Pins the contract of the PR-K1 default-allocation helper. Future PR-K2
 * work (allocatedHoursByDept, utilizationByDept) will extend this file. */

import assert from "node:assert/strict";
import {
  defaultRoleAllocationsForService,
  effectiveRoleAllocations,
} from "../capacity";
import type { ProductiveHoursRow, Service } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────
const ph = (
  id: string, dept: ProductiveHoursRow["dept"], fte: number,
): ProductiveHoursRow => ({
  id, title: id, dept, fte, hours: 1720, source: "seed",
});

const svc = (id: string, dept: Service["dept"]): Service => ({
  id, name: id, dept, volume: 0, hours: 0, cost: 0, fee: 0, peer: 0,
  target: 100, source: "seed",
});

// ── 1. Top-2 selection + FTE-weighted split ───────────────────────────────
{
  const roster = [
    ph("pos-pdir",  "PLAN", 0.35),
    ph("pos-srpln", "PLAN", 1.00),
    ph("pos-aspln", "PLAN", 1.00),
    ph("pos-pltch", "PLAN", 0.50),
  ];
  const allocs = defaultRoleAllocationsForService(svc("plan-x", "PLAN"), roster);

  assert.equal(allocs.length, 2,
    "PR-K1: default picks top 2 same-dept positions");
  // Tied at FTE 1.0 — alphabetical tiebreak: pos-aspln < pos-srpln
  assert.equal(allocs[0].productiveHoursId, "pos-aspln",
    "PR-K1: tied FTE → alphabetical id order");
  assert.equal(allocs[1].productiveHoursId, "pos-srpln");
  // Equal FTE → 50/50; residual absorbed in first.
  assert.equal(allocs[0].pct, 50);
  assert.equal(allocs[1].pct, 50);
  assert.equal(allocs[0].pct + allocs[1].pct, 100, "Σ pct === 100");
  console.log("  ✓ top-2 selection + equal-FTE split");
}

// ── 2. Unequal FTE → proportional split + residual ───────────────────────
{
  const roster = [
    ph("pos-sreng", "ENG", 1.00),
    ph("pos-pwins", "ENG", 0.60),
    ph("pos-ceng",  "ENG", 0.30),
  ];
  const allocs = defaultRoleAllocationsForService(svc("eng-x", "ENG"), roster);
  // 1.0/1.6 → 0.625 exactly → Math.round(62.5) = 63.
  // 0.6/1.6 → 0.37499999… (IEEE 754) → Math.round(37.499…) = 37.
  // Σ = 100 already, residual = 0, no adjustment.
  assert.equal(allocs[0].productiveHoursId, "pos-sreng");
  assert.equal(allocs[1].productiveHoursId, "pos-pwins");
  assert.equal(allocs[0].pct, 63);
  assert.equal(allocs[1].pct, 37);
  assert.equal(allocs[0].pct + allocs[1].pct, 100,
    "PR-K1: pcts sum to 100 (residual baked into the rounding here)");
  console.log("  ✓ proportional split with rounding residual");
}

// ── 3. Cross-dept positions excluded from default ────────────────────────
{
  const roster = [
    ph("pos-plan",  "PLAN", 1.00),
    ph("pos-bldg",  "BLDG", 1.00),
  ];
  const allocs = defaultRoleAllocationsForService(svc("plan-y", "PLAN"), roster);
  assert.equal(allocs.length, 1,
    "PR-K1: defaults consider only same-dept positions");
  assert.equal(allocs[0].productiveHoursId, "pos-plan");
  assert.equal(allocs[0].pct, 100);
  console.log("  ✓ cross-dept positions excluded from default");
}

// ── 4. No same-dept positions → empty allocations ────────────────────────
{
  const roster = [ph("pos-only-bldg", "BLDG", 1.0)];
  const allocs = defaultRoleAllocationsForService(svc("plan-z", "PLAN"), roster);
  assert.deepEqual(allocs, [],
    "PR-K1: no candidate positions → empty allocations (UI shows empty state)");
  console.log("  ✓ empty default when no same-dept positions");
}

// ── 5. effectiveRoleAllocations: override wins over default ──────────────
{
  const roster = [
    ph("pos-a", "PLAN", 1.0),
    ph("pos-b", "PLAN", 1.0),
  ];
  const overrides = {
    "plan-x": [
      // Deliberately cross-dept: a PLAN service drawing on a BLDG role.
      { productiveHoursId: "pos-bldg-shared", pct: 100 },
    ],
  };
  const allocs = effectiveRoleAllocations(svc("plan-x", "PLAN"), roster, overrides);
  assert.equal(allocs.length, 1,
    "PR-K1: persisted override takes precedence over default");
  assert.equal(allocs[0].productiveHoursId, "pos-bldg-shared",
    "PR-K1: override preserves cross-dept allocations");
  console.log("  ✓ override-pattern resolution");
}

// ── 6. Empty override array falls back to default ────────────────────────
{
  const roster = [ph("pos-a", "PLAN", 1.0)];
  const overrides = { "plan-x": [] };
  const allocs = effectiveRoleAllocations(svc("plan-x", "PLAN"), roster, overrides);
  assert.equal(allocs[0].productiveHoursId, "pos-a",
    "PR-K1: empty override array treated as 'no override' — re-derives default");
  console.log("  ✓ empty override re-derives default");
}

console.log("\nAll capacity assertions passed.");
