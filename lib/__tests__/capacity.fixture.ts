/* Capacity-layer fixture.
 *
 * Run with: npm run test:capacity
 *
 * Pins the contract of the PR-K1 default-allocation helper. Future PR-K2
 * work (allocatedHoursByDept, utilizationByDept) will extend this file. */

import assert from "node:assert/strict";
import {
  allocatedHoursByDept,
  allocatedRoleHours,
  defaultRoleAllocationsForService,
  deptCapacityWarnings,
  effectiveRoleAllocations,
  serviceCapacityWarnings,
  utilizationByDept,
} from "../capacity";
import type { DeptCode, ProductiveHoursRow, Service } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────
const ph = (
  id: string, dept: ProductiveHoursRow["dept"], fte: number,
): ProductiveHoursRow => ({
  id, title: id, dept, fte, hours: 1720, source: "seed",
});

const svc = (
  id: string, dept: Service["dept"],
  volume = 0, hours = 0,
): Service => ({
  id, name: id, dept, volume, hours, cost: 0, fee: 0, peer: 0,
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

// ── 7. allocatedRoleHours: volume × hours × pct/100 ─────────────────────
{
  const hrs = allocatedRoleHours({ volume: 100, hours: 5 }, { pct: 30 });
  assert.equal(hrs, 150, "PR-K2: 100 × 5 × 0.30 = 150");
  console.log("  ✓ allocatedRoleHours basic math");
}

// ── 8. allocatedHoursByDept: single-dept reconciliation ─────────────────
{
  const roster = [
    ph("pos-plan-a", "PLAN", 1.0),
    ph("pos-plan-b", "PLAN", 1.0),
  ];
  // 1 service, volume 100, hours 5/inst → 500 demand hrs split 60/40.
  const overrides = {
    "plan-x": [
      { productiveHoursId: "pos-plan-a", pct: 60 },
      { productiveHoursId: "pos-plan-b", pct: 40 },
    ],
  };
  const services = [svc("plan-x", "PLAN", 100, 5)];
  const byDept = allocatedHoursByDept(services, overrides, roster);
  assert.equal(byDept.PLAN, 500, "PR-K2: 60% + 40% routed to PLAN = 500 total");
  assert.equal(byDept.BLDG, 0, "PR-K2: untouched dept stays at 0");
  console.log("  ✓ single-dept aggregation");
}

// ── 9. CROSS-DEPT routing — the load-bearing test for the rule ──────────
//      "utilization MUST be calculated from role departments". A BLDG
//      service that's actually delivered by a PLAN role must contribute
//      to PLAN demand, NOT BLDG. If this assertion ever fails, someone
//      has reverted the role-dept routing to use service.dept.
{
  const roster = [
    ph("pos-bldg-insp", "BLDG", 1.0),
    ph("pos-plan-srpln", "PLAN", 1.0),
  ];
  // BLDG service: 200 instances × 2 hrs = 400 total demand hrs. Splits
  // 70/30 between a BLDG inspector (280 hrs) and a PLAN senior planner
  // (120 hrs). Capacity must see PLAN demand of 120, not 0.
  const overrides = {
    "bldg-shared": [
      { productiveHoursId: "pos-bldg-insp", pct: 70 },
      { productiveHoursId: "pos-plan-srpln", pct: 30 },
    ],
  };
  const services = [svc("bldg-shared", "BLDG", 200, 2)];
  const byDept = allocatedHoursByDept(services, overrides, roster);
  assert.equal(byDept.BLDG, 280,
    "PR-K2: BLDG-role portion of a BLDG service lands in BLDG");
  assert.equal(byDept.PLAN, 120,
    "PR-K2: PLAN-role portion of a BLDG service lands in PLAN (NOT BLDG) — " +
    "this is the conceptual rule the capacity layer exists to enforce");
  console.log("  ✓ cross-dept allocations routed by role.dept, not service.dept");
}

// ── 10. Dangling-allocation: removed position silently dropped ──────────
{
  const roster = [ph("pos-plan", "PLAN", 1.0)];
  const overrides = {
    "plan-x": [
      { productiveHoursId: "pos-plan", pct: 50 },
      // pos-ghost no longer in roster — silently dropped, not crashed.
      { productiveHoursId: "pos-ghost", pct: 50 },
    ],
  };
  const services = [svc("plan-x", "PLAN", 10, 10)];
  const byDept = allocatedHoursByDept(services, overrides, roster);
  // 10 × 10 × 0.5 = 50 routed to PLAN; the ghost half drops on the floor.
  // PR-K4's warning surface is the right place to flag this; capacity
  // math itself must not crash.
  assert.equal(byDept.PLAN, 50,
    "PR-K2: dangling allocations drop silently (warning surface handles UX)");
  console.log("  ✓ dangling productiveHoursId silently dropped");
}

// ── 11. utilizationByDept: pct = allocated / productive ─────────────────
{
  const allocated = { PLAN: 5880, BLDG: 4910, ENG: 0 } as Record<DeptCode, number>;
  const productive = { PLAN: 4902, BLDG: 6450, ENG: 0 } as Record<DeptCode, number>;
  const u = utilizationByDept(allocated, productive);
  // Spec example: PLAN ≈ 120%, BLDG ≈ 76%.
  assert.equal(Math.round(u.PLAN.pct), 120,
    "PR-K2: PLAN utilization matches the spec example (120%)");
  assert.equal(Math.round(u.BLDG.pct), 76,
    "PR-K2: BLDG utilization matches the spec example (76%)");
  assert.equal(u.ENG.pct, 0,
    "PR-K2: 0 productive hours → 0% utilization (not NaN, not Infinity)");
  console.log("  ✓ utilization math matches spec example + 0-divisor guard");
}

// ── 12. serviceCapacityWarnings: alloc total ≠ 100 ─────────────────────
{
  const roster = [
    ph("pos-a", "PLAN", 1.0),
    ph("pos-b", "PLAN", 1.0),
  ];
  const overrides = {
    "plan-x": [
      { productiveHoursId: "pos-a", pct: 60 },
      { productiveHoursId: "pos-b", pct: 35 }, // total = 95
    ],
  };
  const warns = serviceCapacityWarnings(
    [svc("plan-x", "PLAN", 10, 10)], overrides, roster,
  );
  assert.equal(warns.length, 1, "PR-K4: exactly one warning for off-total mix");
  assert.equal(warns[0].kind, "alloc-not-100");
  if (warns[0].kind === "alloc-not-100") {
    assert.equal(warns[0].actual, 95);
  }
  console.log("  ✓ alloc-not-100 detected");
}

// ── 13. serviceCapacityWarnings: dangling productiveHoursId ────────────
//        The position rolled out from under the allocation. We emit the
//        dangling warning AND the alloc-not-100 (since the ghost row's
//        pct still counts toward the user-entered total — they'd see
//        both flags simultaneously and know they need to pick a real
//        position OR drop the row).
{
  const roster = [ph("pos-a", "PLAN", 1.0)];
  const overrides = {
    "plan-x": [
      { productiveHoursId: "pos-a", pct: 50 },
      { productiveHoursId: "pos-ghost", pct: 50 },
    ],
  };
  const warns = serviceCapacityWarnings(
    [svc("plan-x", "PLAN", 10, 10)], overrides, roster,
  );
  // Two warnings expected: one alloc-not-100 (well, the user total IS
  // 100 here — 50+50; so actually no), plus the dangling.
  // Wait: total here IS 100. So only the dangling warning fires.
  assert.equal(warns.length, 1, "PR-K4: dangling productiveHoursId fires its own warning");
  assert.equal(warns[0].kind, "dangling-position");
  if (warns[0].kind === "dangling-position") {
    assert.equal(warns[0].productiveHoursId, "pos-ghost");
  }
  console.log("  ✓ dangling-position detected");
}

// ── 14. serviceCapacityWarnings: strict 100% with 0.5 tolerance ────────
//        Exactly 100 passes; 99 and 101 fire. The 0.5 tolerance only
//        absorbs sub-integer drift like 99.7 / 100.4 (which shouldn't
//        happen with whole-pct inputs from the UI but could from
//        future fractional editors).
{
  const roster = [
    ph("pos-a", "PLAN", 1.0),
    ph("pos-b", "PLAN", 1.0),
  ];
  const cases: Array<[number, number]> = [
    [100, 0], // exact → no warning
    [ 99, 1], // off-by-1 → warning
    [101, 1], // off-by-1 → warning
  ];
  for (const [total, expected] of cases) {
    const overrides = {
      "plan-x": [
        { productiveHoursId: "pos-a", pct: total - 50 },
        { productiveHoursId: "pos-b", pct: 50 },
      ],
    };
    const warns = serviceCapacityWarnings(
      [svc("plan-x", "PLAN", 10, 10)], overrides, roster,
    );
    assert.equal(warns.length, expected,
      `PR-K4: total=${total} → expected ${expected} warning(s), got ${warns.length}`);
  }
  console.log("  ✓ alloc-not-100 strict at integer-pct boundary");
}

// ── 15. deptCapacityWarnings: utilization > 125% → critical ────────────
{
  const u = {
    PLAN: { allocated: 7000, productive: 4000, pct: 175 },
    BLDG: { allocated: 3000, productive: 4000, pct: 75 },
    ENG:  { allocated: 5000, productive: 4000, pct: 125 }, // exactly 125 — not critical
    PARKS:{ allocated: 0,    productive: 0,    pct: 0 },
    PD:   { allocated: 0,    productive: 0,    pct: 0 },
    FIRE: { allocated: 0,    productive: 0,    pct: 0 },
  } as Record<DeptCode, { allocated: number; productive: number; pct: number }>;
  const warns = deptCapacityWarnings(u);
  assert.equal(warns.length, 1, "PR-K4: only depts strictly > 125% trigger critical");
  assert.equal(warns[0].dept, "PLAN");
  assert.equal(warns[0].kind, "utilization-critical");
  console.log("  ✓ utilization-critical (>125% strict)");
}

// ── 16. deptCapacityWarnings: missing productive hours ─────────────────
//        Only fires when there's real demand against zero supply —
//        depts with no allocation AND no supply are simply unmodeled.
{
  const u = {
    PLAN: { allocated: 500,  productive: 0, pct: 0 }, // ← warn
    BLDG: { allocated: 0,    productive: 0, pct: 0 }, // unmodeled — no warn
    ENG:  { allocated: 100,  productive: 1000, pct: 10 }, // fine
    PARKS:{ allocated: 0, productive: 0, pct: 0 },
    PD:   { allocated: 0, productive: 0, pct: 0 },
    FIRE: { allocated: 0, productive: 0, pct: 0 },
  } as Record<DeptCode, { allocated: number; productive: number; pct: number }>;
  const warns = deptCapacityWarnings(u);
  assert.equal(warns.length, 1, "PR-K4: missing-productive only when allocated > 0");
  assert.equal(warns[0].dept, "PLAN");
  assert.equal(warns[0].kind, "missing-productive-hours");
  console.log("  ✓ missing-productive-hours (demand vs zero supply)");
}

console.log("\nAll capacity assertions passed.");
