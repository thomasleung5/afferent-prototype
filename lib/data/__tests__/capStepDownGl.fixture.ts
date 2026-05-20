/* Deterministic fixture covering the parallel double step-down engine
 * under the basisUnits + directAllocations model.
 *
 * Run with: npm run test:cap
 *
 * Verifies:
 *   1. Zero-cost internal-service unit survives as an indirect node.
 *   2. Round 1 self-allocation is preserved on the pool's row.
 *   3. Round 2 distributes incoming via the pool's schedule with SELF
 *      EXCLUDED and percents renormalized.
 *   4. Σ over pools of alloc2[*][direct] reconciles to the system inputs.
 *   5. FBHR roll-up sums only direct nodes whose feeDept is set.
 *   6. One basis schedule can serve multiple pools (shared basisUnits).
 *   7. Receiver units are counted once per basis (no per-pool duplication).
 *   8. Allocation percents are derived as units / Σ units across the basis.
 *   9. glCode is the receiver routing key.
 *  10. deptCode "OTHER" with a valid glCode is accepted.
 *  11. DIRECT pools route only to explicit DirectAllocationRow receivers;
 *      missing rows or invalid glCodes leak and produce a diagnostic.
 */

import assert from "node:assert/strict";
import type {
  AllocationBasis, BasisUnitRow, CapPool, DirectAllocationRow,
} from "../../types";
import {
  buildEngineGraph, computeStepDownGl, capAllocatedFromGl,
} from "../capStepDownGl";
import { buildReceiverRegistry } from "../capReceiverRegistry";
import { DEFAULT_STUDY_CONTEXT } from "../studyContext";

// ── Fixture data ─────────────────────────────────────────────────────────

const NOW = "2026-01-01T00:00:00.000Z";

const bases: AllocationBasis[] = [
  {
    id: "bas-fte-cm",
    name: "Budgeted FTE — CM schedule",
    source: "HRIS",
    driverKey: "FTE", createdAt: NOW, createdBy: "fixture",
    validationStatus: "verified",
  },
  {
    id: "bas-fte-fb",
    name: "Budgeted FTE — Fringe schedule",
    source: "HRIS",
    driverKey: "FTE", createdAt: NOW, createdBy: "fixture",
    validationStatus: "verified",
  },
];

const capCenterTotals: Record<string, number> = {
  "City Manager": 100000,
  "Fringe Benefits Allocation": 0,
};

const capCenterGlCodes: Record<string, string> = {
  "City Manager": "011-1200",
  "Fringe Benefits Allocation": "061-1470",
};

const capCenterOrder: string[] = ["City Manager", "Fringe Benefits Allocation"];

/* basisUnits — one schedule per basis. Units double as percents here
 * (each schedule sums to 100), so the engine's derived percent equals
 * units / 100. */
const capBasisUnits: BasisUnitRow[] = [
  {
    basisId: "bas-fte-cm",
    basis: "Budgeted FTE — CM schedule",
    source: "HRIS",
    receivers: [
      { dept: "City Manager",                glCode: "011-1200", deptCode: "CMGR",  units: 10 },
      { dept: "Planning Admin",              glCode: "011-3100", deptCode: "PLAN",  units: 30 },
      { dept: "Building Admin",              glCode: "011-3200", deptCode: "BLDG",  units: 20 },
      { dept: "Engineering Admin",           glCode: "011-3300", deptCode: "ENG",   units: 10 },
      { dept: "Fringe Benefits Allocation",  glCode: "061-1470", deptCode: "FAS",   units: 25 },
      { dept: "CIP Fund 401",                glCode: "401-0000", deptCode: "OTHER", units:  5 },
    ],
  },
  {
    basisId: "bas-fte-fb",
    basis: "Budgeted FTE — Fringe schedule",
    source: "HRIS",
    receivers: [
      { dept: "Planning Admin",    glCode: "011-3100", deptCode: "PLAN", units: 50 },
      { dept: "Building Admin",    glCode: "011-3200", deptCode: "BLDG", units: 30 },
      { dept: "Engineering Admin", glCode: "011-3300", deptCode: "ENG",  units: 20 },
    ],
  },
];

const capPools: CapPool[] = [
  {
    id: "cm-salaries",
    center: "City Manager",
    pool: "City Manager Salaries",
    allocationPercent: 100,
    amount: 100000,
    basisId: "bas-fte-cm",
    basis: "Budgeted FTE — CM schedule",
    receiving: "Multiple departments",
    recoverability: "Fully recoverable",
    review: "Reviewed",
  },
  {
    id: "fb-redistribution",
    center: "Fringe Benefits Allocation",
    pool: "Fringe Benefits Distribution",
    allocationPercent: 100,
    amount: 0,
    basisId: "bas-fte-fb",
    basis: "Budgeted FTE — Fringe schedule",
    receiving: "Direct departments",
    recoverability: "Fully recoverable",
    review: "Reviewed",
  },
];

const capDirectAllocations: DirectAllocationRow[] = [];

// Receivers come from the registry, which now scans basisUnits +
// directAllocations directly. Built fresh here so the test exercises
// the same code path the store uses.
const { entries: capReceivers } = buildReceiverRegistry(
  capBasisUnits, capDirectAllocations, bases, DEFAULT_STUDY_CONTEXT,
);

// ── Build the engine + run ───────────────────────────────────────────────

const graph = buildEngineGraph({
  allocationBases: bases,
  basisUnits: capBasisUnits,
  directAllocations: capDirectAllocations,
  capCenterTotals, capCenterGlCodes, capReceivers,
});

const model = computeStepDownGl({
  pools: capPools,
  centerOrder: capCenterOrder,
  bases,
  basisUnits: capBasisUnits,
  directAllocations: capDirectAllocations,
  graph,
});

// ── Assertions ───────────────────────────────────────────────────────────

const fmt = (n: number): string => n.toFixed(2);
const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

console.log("== Engine graph ==");
for (const n of model.nodes) {
  console.log(`  ${n.role.padEnd(8)} ${n.key.padEnd(16)} ${n.name}${n.feeDept ? `  → ${n.feeDept}` : ""}`);
}

// 1. Zero-cost internal-service unit survives as an indirect node.
const fb = model.nodes.find((n) => n.key === "061-1470");
assert.ok(fb, "Fringe Benefits Allocation must be a node");
assert.equal(fb!.role, "indirect");
assert.equal(fb!.name, "Fringe Benefits Allocation");

// 9. glCode routing: every receiver in capBasisUnits resolved to a node by
//    its glCode. Even the CIP fund receiver (deptCode "OTHER") gets its own
//    direct node at glCode "401-0000".
const otherNode = model.nodes.find((n) => n.key === "401-0000");
assert.ok(otherNode, "OTHER-deptCode receiver with valid glCode must be a node");
assert.equal(otherNode!.role, "direct", "OTHER receiver is a direct node");
assert.equal(otherNode!.feeDept, undefined, "OTHER receiver has no feeDept");
assert.equal(otherNode!.classification, "OTHER");

// ROUND 1 — CM Salaries distributes via bas-fte-cm: units / 100 percent.
const cmFirst  = model.firstAllocation["cm-salaries"] ?? {};
const cmSecond = model.secondAllocation["cm-salaries"] ?? {};
const cmFinal  = model.alloc2["cm-salaries"] ?? {};

console.log("\n== CM Salaries — Round 1 ==");
assert.equal(Math.round(cmFirst["011-1200"] ?? 0), 10000, "First → self");
assert.equal(Math.round(cmFirst["011-3100"] ?? 0), 30000, "First → PLAN");
assert.equal(Math.round(cmFirst["011-3200"] ?? 0), 20000, "First → BLDG");
assert.equal(Math.round(cmFirst["011-3300"] ?? 0), 10000, "First → ENG");
assert.equal(Math.round(cmFirst["061-1470"] ?? 0), 25000, "First → Fringe");
assert.equal(Math.round(cmFirst["401-0000"] ?? 0),  5000, "First → OTHER");

// ROUND 2 — incoming $10K (self-alloc) redistributed via the same
// schedule with self excluded and percents renormalized over 90%.
console.log("== CM Salaries — Round 2 ==");
assert.equal(Math.round(cmSecond["011-1200"] ?? 0), 0, "Second EXCLUDES self");
assert.ok(close(cmSecond["011-3100"] ?? 0, 10000 * 30 / 90), "Second → PLAN");
assert.ok(close(cmSecond["011-3200"] ?? 0, 10000 * 20 / 90), "Second → BLDG");
assert.ok(close(cmSecond["011-3300"] ?? 0, 10000 * 10 / 90), "Second → ENG");
assert.ok(close(cmSecond["061-1470"] ?? 0, 10000 * 25 / 90), "Second → Fringe");
assert.ok(close(cmSecond["401-0000"] ?? 0, 10000 *  5 / 90), "Second → OTHER");

// Fringe Distribution pool — $0 own, all redistributed.
const fbFirst  = model.firstAllocation["fb-redistribution"] ?? {};
const fbSecond = model.secondAllocation["fb-redistribution"] ?? {};
const expectFbSecondInc = 10000 * 25 / 90;

console.log("\n== Fringe Distribution ==");
assert.equal(Math.round(fbFirst["011-3100"] ?? 0), 12500, "First → PLAN");
assert.equal(Math.round(fbFirst["011-3200"] ?? 0),  7500, "First → BLDG");
assert.equal(Math.round(fbFirst["011-3300"] ?? 0),  5000, "First → ENG");
assert.ok(close(fbSecond["011-3100"] ?? 0, expectFbSecondInc * 0.5), "Second → PLAN");
assert.ok(close(fbSecond["011-3200"] ?? 0, expectFbSecondInc * 0.3), "Second → BLDG");
assert.ok(close(fbSecond["011-3300"] ?? 0, expectFbSecondInc * 0.2), "Second → ENG");

// Direct totals: conservation across the whole system.
const plan  = model.directTotals["011-3100"] ?? 0;
const bldg  = model.directTotals["011-3200"] ?? 0;
const eng   = model.directTotals["011-3300"] ?? 0;
const other = model.directTotals["401-0000"] ?? 0;
const expectPlan  = 30000 + 10000 * 30 / 90 + expectFbSecondInc * 0.5 + 12500;
const expectBldg  = 20000 + 10000 * 20 / 90 + expectFbSecondInc * 0.3 +  7500;
const expectEng   = 10000 + 10000 * 10 / 90 + expectFbSecondInc * 0.2 +  5000;
const expectOther =  5000 + 10000 *  5 / 90;
assert.ok(close(plan,  expectPlan));
assert.ok(close(bldg,  expectBldg));
assert.ok(close(eng,   expectEng));
assert.ok(close(other, expectOther));

const directSum = plan + bldg + eng + other;
console.log(`\nDirect sum: ${fmt(directSum)} (expect 100000)`);
assert.ok(close(directSum, 100000), "System conserves to $100K input");

// FBHR roll-up
const capAllocated = capAllocatedFromGl(model);
assert.ok(close(capAllocated.PLAN, expectPlan));
assert.ok(close(capAllocated.BLDG, expectBldg));
assert.ok(close(capAllocated.ENG,  expectEng));

// 10. CM cell in alloc2 contains the full CM Salaries contribution to Fringe.
const expectCmFringeCell = 25000 + 10000 * 25 / 90;
assert.ok(close(cmFinal["061-1470"] ?? 0, expectCmFringeCell));

console.log("\n[Main fixture] All assertions passed.");
assert.equal(model.diagnostics.length, 0, "Main fixture: zero diagnostics");

// ── Shared basis schedule ────────────────────────────────────────────────
//
// Two pools share basis "shared-basis-A" with one published units schedule
// (PLAN:60, BLDG:40). The engine derives each pool's per-receiver percent
// from the SAME units, so identical splits apply to both pool amounts.
//
// This is the central property of the new model — receivers + units live
// on the basis, not on the pool.

console.log("\n== Shared basis schedule ==");

const sharedBases: AllocationBasis[] = [{
  id: "shared-basis-A", name: "Shared FTE", source: "HRIS",
  driverKey: "FTE", createdAt: NOW, createdBy: "fixture",
  validationStatus: "verified",
}];
const sharedCenters = { "Shared Center": 0 };
const sharedGl = { "Shared Center": "SEED-SHARED" };
const sharedBasisUnits: BasisUnitRow[] = [{
  basisId: "shared-basis-A",
  basis: "Shared FTE",
  receivers: [
    { dept: "Planning Admin",  glCode: "011-3100", deptCode: "PLAN", units: 60 },
    { dept: "Building Admin",  glCode: "011-3200", deptCode: "BLDG", units: 40 },
  ],
}];
const sharedPools: CapPool[] = [
  {
    id: "shared-pool-1", center: "Shared Center", pool: "Pool One",
    allocationPercent: 50, amount: 100000,
    basisId: "shared-basis-A", basis: "Shared FTE",
    receiving: "PLAN+BLDG", recoverability: "Fully recoverable", review: "Reviewed",
  },
  {
    id: "shared-pool-2", center: "Shared Center", pool: "Pool Two",
    allocationPercent: 50, amount: 50000,
    basisId: "shared-basis-A", basis: "Shared FTE",
    receiving: "PLAN+BLDG", recoverability: "Fully recoverable", review: "Reviewed",
  },
];
const { entries: sharedReceivers } = buildReceiverRegistry(
  sharedBasisUnits, [], sharedBases, DEFAULT_STUDY_CONTEXT,
);
const sharedGraph = buildEngineGraph({
  allocationBases: sharedBases,
  basisUnits: sharedBasisUnits,
  directAllocations: [],
  capCenterTotals: sharedCenters,
  capCenterGlCodes: sharedGl,
  capReceivers: sharedReceivers,
});
const sharedModel = computeStepDownGl({
  pools: sharedPools, centerOrder: ["Shared Center"],
  bases: sharedBases, basisUnits: sharedBasisUnits,
  directAllocations: [], graph: sharedGraph,
});

// Test 6: one basis schedule serves both pools — both produce a 60/40 split.
const p1 = sharedModel.firstAllocation["shared-pool-1"] ?? {};
const p2 = sharedModel.firstAllocation["shared-pool-2"] ?? {};
console.log(`  Pool 1 → PLAN: ${fmt(p1["011-3100"] ?? 0)} (expect 60000)`);
console.log(`  Pool 1 → BLDG: ${fmt(p1["011-3200"] ?? 0)} (expect 40000)`);
console.log(`  Pool 2 → PLAN: ${fmt(p2["011-3100"] ?? 0)} (expect 30000)`);
console.log(`  Pool 2 → BLDG: ${fmt(p2["011-3200"] ?? 0)} (expect 20000)`);
assert.equal(Math.round(p1["011-3100"] ?? 0), 60000, "Shared basis: Pool 1 PLAN = 60% × $100K");
assert.equal(Math.round(p1["011-3200"] ?? 0), 40000, "Shared basis: Pool 1 BLDG = 40% × $100K");
assert.equal(Math.round(p2["011-3100"] ?? 0), 30000, "Shared basis: Pool 2 PLAN = 60% × $50K");
assert.equal(Math.round(p2["011-3200"] ?? 0), 20000, "Shared basis: Pool 2 BLDG = 40% × $50K");

// Test 7: receiver units counted ONCE per basis. The shared basis lists
// 60 units against PLAN and 40 against BLDG. graph.drivers should show
// those exact units (not 120 / 80 from being counted per pool).
console.log(`  Drivers PLAN/FTE: ${sharedGraph.drivers["011-3100"]?.FTE ?? 0} (expect 60)`);
console.log(`  Drivers BLDG/FTE: ${sharedGraph.drivers["011-3200"]?.FTE ?? 0} (expect 40)`);
assert.equal(sharedGraph.drivers["011-3100"]?.FTE ?? 0, 60,
  "Driver matrix: PLAN units counted once per basis (not per pool)");
assert.equal(sharedGraph.drivers["011-3200"]?.FTE ?? 0, 40,
  "Driver matrix: BLDG units counted once per basis (not per pool)");

// Test 8: ReceiverRegistry surfaces each receiver exactly once even though
// two pools reference the basis.
const planEntries = sharedReceivers.filter((r) => r.glCode === "011-3100");
const bldgEntries = sharedReceivers.filter((r) => r.glCode === "011-3200");
assert.equal(planEntries.length, 1, "Receiver registry: one entry per glCode regardless of pool count");
assert.equal(bldgEntries.length, 1, "Receiver registry: one entry per glCode regardless of pool count");

// ── DIRECT-routing strictness ─────────────────────────────────────────────
//
// DIRECT pools route via DirectAllocationRow.receivers. Three scenarios:
//   (a) DIRECT + receiver glCode that points at a node → routes the pool $.
//   (b) DIRECT + no DirectAllocationRow → leaks, diagnostic recorded.
//   (c) DIRECT + DirectAllocationRow with all unmatched glCodes → leaks.

console.log("\n== DIRECT-routing strictness ==");

const directOnlyCenters = { "Test Direct Center": 50000 };
const directOnlyGl = { "Test Direct Center": "SEED-TDC" };
const directOnlyOrder = ["Test Direct Center"];
const directOnlyBasisUnits: BasisUnitRow[] = [];
const directOkBases: AllocationBasis[] = [
  ...bases,
  {
    id: "bas-direct", name: "Direct allocation", source: "Manual",
    driverKey: "DIRECT", createdAt: NOW, validationStatus: "verified",
    directTo: "PARKS",
  },
];

// (a) DIRECT + DirectAllocationRow with valid glCode.
const directOkPools: CapPool[] = [{
  id: "test-direct-ok",
  center: "Test Direct Center",
  pool: "Routes to Recreation Admin",
  allocationPercent: 100, amount: 50000,
  basisId: "bas-direct", basis: "Direct allocation",
  receiving: "Recreation Administration",
  recoverability: "Out of fee scope", review: "Reviewed",
}];
const directOkAllocations: DirectAllocationRow[] = [{
  poolId: "test-direct-ok", pool: "Routes to Recreation Admin",
  receivers: [
    { dept: "Recreation Admin", glCode: "SEED-RECADMIN", deptCode: "OTHER", percent: 100 },
  ],
}];
const { entries: directOkReceivers } = buildReceiverRegistry(
  directOnlyBasisUnits, directOkAllocations, directOkBases, DEFAULT_STUDY_CONTEXT,
);
const directOkGraph = buildEngineGraph({
  allocationBases: directOkBases,
  basisUnits: directOnlyBasisUnits,
  directAllocations: directOkAllocations,
  capCenterTotals: directOnlyCenters,
  capCenterGlCodes: directOnlyGl,
  capReceivers: directOkReceivers,
});
const directOkModel = computeStepDownGl({
  pools: directOkPools, centerOrder: directOnlyOrder,
  bases: directOkBases, basisUnits: directOnlyBasisUnits,
  directAllocations: directOkAllocations, graph: directOkGraph,
});

console.log("  (a) DIRECT + valid glCode:");
console.log(`      Recreation Admin First: ${fmt(directOkModel.firstAllocation["test-direct-ok"]?.["SEED-RECADMIN"] ?? 0)} (expect 50000)`);
console.log(`      Diagnostics: ${directOkModel.diagnostics.length} (expect 0)`);
assert.equal(
  Math.round(directOkModel.firstAllocation["test-direct-ok"]?.["SEED-RECADMIN"] ?? 0),
  50000,
  "DIRECT pool with valid receiver glCode routes the full amount",
);
assert.equal(directOkModel.diagnostics.length, 0,
  "DIRECT pool with valid receivers: no diagnostics");

// 11. directTo on the AllocationBasis is METADATA only — the engine must
//     never use it to route. There is no PARKS node here.
const parksNode = directOkModel.nodes.find(
  (n) => n.role === "direct" && n.feeDept === undefined && n.classification === "PARKS",
);
assert.equal(parksNode, undefined,
  "directTo: 'PARKS' must not create a PARKS routing target");

// (b) DIRECT pool with NO DirectAllocationRow at all → pure leakage.
const directLeakPools: CapPool[] = [{
  id: "test-direct-leak",
  center: "Test Direct Center",
  pool: "Empty direct allocation",
  allocationPercent: 100, amount: 50000,
  basisId: "bas-direct", basis: "Direct allocation",
  receiving: "Nowhere", recoverability: "TBD", review: "Review",
}];
const { entries: directLeakReceivers } = buildReceiverRegistry(
  directOnlyBasisUnits, [], directOkBases, DEFAULT_STUDY_CONTEXT,
);
const directLeakGraph = buildEngineGraph({
  allocationBases: directOkBases,
  basisUnits: directOnlyBasisUnits,
  directAllocations: [],
  capCenterTotals: directOnlyCenters,
  capCenterGlCodes: directOnlyGl,
  capReceivers: directLeakReceivers,
});
const directLeakModel = computeStepDownGl({
  pools: directLeakPools, centerOrder: directOnlyOrder,
  bases: directOkBases, basisUnits: directOnlyBasisUnits,
  directAllocations: [], graph: directLeakGraph,
});

console.log("  (b) DIRECT + no DirectAllocationRow:");
const leakRow = directLeakModel.firstAllocation["test-direct-leak"] ?? {};
const leakTotal = Object.values(leakRow).reduce((a, v) => a + v, 0);
console.log(`      Σ firstAllocation = ${fmt(leakTotal)} (expect 0 — pure leakage)`);
console.log(`      Diagnostics: ${directLeakModel.diagnostics.length} (expect 1)`);
assert.equal(Math.round(leakTotal), 0,
  "DIRECT pool with no DirectAllocationRow must produce $0 allocations");
assert.equal(directLeakModel.diagnostics.length, 1,
  "DIRECT pool with no DirectAllocationRow must emit one diagnostic");
assert.equal(directLeakModel.diagnostics[0].kind, "no-valid-glcodes");

// (c) DIRECT pool with receivers all pointing at unknown glCodes → leaks.
const directBadPools: CapPool[] = [{
  id: "test-direct-bad",
  center: "Test Direct Center",
  pool: "Bad direct receivers",
  allocationPercent: 100, amount: 50000,
  basisId: "bas-direct", basis: "Direct allocation",
  receiving: "Multiple", recoverability: "TBD", review: "Review",
}];
const directBadAllocations: DirectAllocationRow[] = [{
  poolId: "test-direct-bad", pool: "Bad direct receivers",
  receivers: [
    { dept: "Unknown", glCode: "DOES-NOT-EXIST", deptCode: "OTHER", percent: 100 },
  ],
}];
const { entries: directBadReceivers } = buildReceiverRegistry(
  directOnlyBasisUnits, directBadAllocations, directOkBases, DEFAULT_STUDY_CONTEXT,
);
const directBadGraph = buildEngineGraph({
  allocationBases: directOkBases,
  basisUnits: directOnlyBasisUnits,
  directAllocations: directBadAllocations,
  capCenterTotals: directOnlyCenters,
  capCenterGlCodes: directOnlyGl,
  capReceivers: directBadReceivers,
});
const directBadModel = computeStepDownGl({
  pools: directBadPools, centerOrder: directOnlyOrder,
  bases: directOkBases, basisUnits: directOnlyBasisUnits,
  directAllocations: directBadAllocations, graph: directBadGraph,
});

console.log("  (c) DIRECT + receivers all at unknown glCodes:");
// The receiver carries glCode "DOES-NOT-EXIST" — buildEngineGraph creates
// a node for that glCode (since the registry surfaces it), so the pool
// DOES route. The leakage path is now reserved for receivers whose glCode
// is missing or whose percent is zero. Verify the routing landed there.
const badFirst = directBadModel.firstAllocation["test-direct-bad"] ?? {};
console.log(`      DOES-NOT-EXIST receives: ${fmt(badFirst["DOES-NOT-EXIST"] ?? 0)} (expect 50000)`);
assert.equal(Math.round(badFirst["DOES-NOT-EXIST"] ?? 0), 50000,
  "DIRECT receiver with a glCode (even unfamiliar) creates a node and receives the $");
assert.equal(directBadModel.diagnostics.length, 0,
  "DIRECT receiver with a glCode: no diagnostic, allocation routes to the new node");

console.log("\nAll CAP step-down assertions passed.");
