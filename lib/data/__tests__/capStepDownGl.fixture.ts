/* Deterministic fixture covering the parallel double step-down engine
 * (NBS published full-cost CAP methodology).
 *
 * Run with: npm run test:cap
 *
 * Models a tiny LAH-shaped CAP:
 *   - "City Manager" with one pool that allocates to itself (10% self),
 *     PLAN, BLDG, ENG, OTHER (CIP Fund), and the zero-cost internal-service
 *     unit "Fringe Benefits Allocation". The 10% self-allocation in Round 1
 *     creates City Manager incoming, which Round 2 redistributes excluding
 *     self.
 *   - "Fringe Benefits Allocation" — zero own cost, one zero-amount pool
 *     whose receivers (PLAN, BLDG, ENG) define how any incoming $ is
 *     redistributed in Round 2.
 *
 * Verifies:
 *   1. Zero-cost internal-service unit survives as an indirect node.
 *   2. Round 1 self-allocation is preserved on the pool's row.
 *   3. Round 2 distributes incoming via the pool's schedule with SELF
 *      EXCLUDED and percents renormalized.
 *   4. Σ over pools of alloc2[*][direct] reconciles to the system inputs
 *      minus any residual on allocable units.
 *   5. FBHR roll-up sums only direct nodes whose feeDept is set.
 */

import assert from "node:assert/strict";
import type { AllocationBasis, CapPool } from "../../types";
import {
  buildEngineGraph, computeStepDownGl, capAllocatedFromGl,
} from "../capStepDownGl";

// ── Fixture data ─────────────────────────────────────────────────────────

const NOW = "2026-01-01T00:00:00.000Z";

const bases: AllocationBasis[] = [
  {
    id: "bas-fte", name: "Budgeted FTE", source: "HRIS",
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

const capPools: CapPool[] = [
  // CM Salaries — $100K with a schedule that includes a 10% self-allocation
  // (Round 1 creates incoming on City Manager), 25% to Fringe (an indirect
  // node that further redistributes in Round 2), 30%/20%/10% to direct fee
  // depts, and 5% to an OTHER CIP fund.
  {
    id: "cm-salaries",
    center: "City Manager",
    pool: "City Manager Salaries",
    allocationPercent: 100,
    amount: 100000,
    basisId: "bas-fte",
    basis: "Budgeted FTE",
    receiving: "Multiple departments",
    recoverability: "Fully recoverable",
    review: "Reviewed",
    receivers: [
      // 10% to itself (City Manager) — Round 1 creates incoming.
      { dept: "City Manager",      glCode: "011-1200", deptCode: "CMGR", percent: 10, amount: 10000 },
      // 30% to Planning
      { dept: "Planning Admin",    glCode: "011-3100", deptCode: "PLAN", percent: 30, amount: 30000 },
      // 20% to Building
      { dept: "Building Admin",    glCode: "011-3200", deptCode: "BLDG", percent: 20, amount: 20000 },
      // 10% to Engineering
      { dept: "Engineering Admin", glCode: "011-3300", deptCode: "ENG",  percent: 10, amount: 10000 },
      // 25% to Fringe Benefits Allocation — that unit will redistribute.
      { dept: "Fringe Benefits Allocation", glCode: "061-1470", deptCode: "FAS", percent: 25, amount: 25000 },
      // 5% to a CIP fund (OTHER classification — not a fee dept).
      { dept: "CIP Fund 401", glCode: "401-0000", deptCode: "OTHER", percent: 5, amount: 5000 },
    ],
  },
  // Fringe Benefits Allocation's own pool — zero own $ but a published
  // schedule. Round 2 uses this to redistribute incoming $ on this node.
  // Splits 50/30/20 across PLAN/BLDG/ENG; no OTHER cycle-back.
  {
    id: "fb-redistribution",
    center: "Fringe Benefits Allocation",
    pool: "Fringe Benefits Distribution",
    allocationPercent: 100,
    amount: 0,
    basisId: "bas-fte",
    basis: "Budgeted FTE",
    receiving: "Direct departments",
    recoverability: "Fully recoverable",
    review: "Reviewed",
    receivers: [
      { dept: "Planning Admin",    glCode: "011-3100", deptCode: "PLAN", percent: 50, amount: 0 },
      { dept: "Building Admin",    glCode: "011-3200", deptCode: "BLDG", percent: 30, amount: 0 },
      { dept: "Engineering Admin", glCode: "011-3300", deptCode: "ENG",  percent: 20, amount: 0 },
    ],
  },
];

const capReceivers = [
  { key: "rcv:011-3100", glCode: "011-3100", dept: "Planning Admin",         deptCode: "PLAN"  as const, values: {}, sources: [] },
  { key: "rcv:011-3200", glCode: "011-3200", dept: "Building Admin",         deptCode: "BLDG"  as const, values: {}, sources: [] },
  { key: "rcv:011-3300", glCode: "011-3300", dept: "Engineering Admin",      deptCode: "ENG"   as const, values: {}, sources: [] },
  { key: "rcv:401-0000", glCode: "401-0000", dept: "CIP Fund 401",           deptCode: "OTHER" as const, values: {}, sources: [] },
  // Fringe Benefits Allocation is published as a receiver too — its glCode
  // matches the center, so it resolves to the indirect center node.
  { key: "rcv:061-1470", glCode: "061-1470", dept: "Fringe Benefits Allocation", deptCode: "FAS" as const, values: {}, sources: [] },
];

// ── Build the engine + run ───────────────────────────────────────────────

const graph = buildEngineGraph({
  capPools, allocationBases: bases, capCenterTotals, capCenterGlCodes, capReceivers,
});

const model = computeStepDownGl({
  pools: capPools,
  centerOrder: capCenterOrder,
  bases,
  graph,
});

// ── Assertions ───────────────────────────────────────────────────────────

const fmt = (n: number): string => n.toFixed(2);

console.log("== Engine graph ==");
for (const n of model.nodes) {
  console.log(`  ${n.role.padEnd(8)} ${n.key.padEnd(16)} ${n.name}${n.feeDept ? `  → ${n.feeDept}` : ""}`);
}

// 1. Zero-cost internal-service unit survives as an indirect node.
const fb = model.nodes.find((n) => n.key === "061-1470");
assert.ok(fb, "Fringe Benefits Allocation must be a node");
assert.equal(fb!.role, "indirect", "Fringe Benefits Allocation must be indirect");
assert.equal(fb!.name, "Fringe Benefits Allocation");

// ROUND 1 — CM Salaries distributes its own $100K via its schedule.
// All listed receivers are eligible (including self at 10%).
const cmFirst  = model.firstAllocation["cm-salaries"] ?? {};
const cmSecond = model.secondAllocation["cm-salaries"] ?? {};
const cmFinal  = model.alloc2["cm-salaries"] ?? {};

console.log("\n== CM Salaries — Round 1 (First Allocation) ==");
console.log(`  Self (011-1200): ${fmt(cmFirst["011-1200"] ?? 0)} (expect 10000)`);
console.log(`  PLAN (011-3100): ${fmt(cmFirst["011-3100"] ?? 0)} (expect 30000)`);
console.log(`  BLDG (011-3200): ${fmt(cmFirst["011-3200"] ?? 0)} (expect 20000)`);
console.log(`  ENG  (011-3300): ${fmt(cmFirst["011-3300"] ?? 0)} (expect 10000)`);
console.log(`  Fringe (061-1470): ${fmt(cmFirst["061-1470"] ?? 0)} (expect 25000)`);
console.log(`  OTHER (401-0000): ${fmt(cmFirst["401-0000"] ?? 0)} (expect 5000)`);

assert.equal(Math.round(cmFirst["011-1200"] ?? 0), 10000, "CM Salaries First → self");
assert.equal(Math.round(cmFirst["011-3100"] ?? 0), 30000, "CM Salaries First → PLAN");
assert.equal(Math.round(cmFirst["011-3200"] ?? 0), 20000, "CM Salaries First → BLDG");
assert.equal(Math.round(cmFirst["011-3300"] ?? 0), 10000, "CM Salaries First → ENG");
assert.equal(Math.round(cmFirst["061-1470"] ?? 0), 25000, "CM Salaries First → Fringe");
assert.equal(Math.round(cmFirst["401-0000"] ?? 0),  5000, "CM Salaries First → OTHER");

// ROUND 2 — CM's incoming is $10K (from CM Salaries' Round 1 self-alloc).
// Redistributed via CM Salaries' schedule WITH SELF EXCLUDED (10% drops out
// and the remaining 90% renormalizes).
console.log("\n== CM Salaries — Round 2 (Second Allocation) ==");
console.log(`  Self (excluded): ${fmt(cmSecond["011-1200"] ?? 0)} (expect 0)`);
console.log(`  PLAN: ${fmt(cmSecond["011-3100"] ?? 0)} (expect 10000 × 30/90 = 3333.33)`);
console.log(`  BLDG: ${fmt(cmSecond["011-3200"] ?? 0)} (expect 10000 × 20/90 = 2222.22)`);
console.log(`  ENG:  ${fmt(cmSecond["011-3300"] ?? 0)} (expect 10000 × 10/90 = 1111.11)`);
console.log(`  Fringe: ${fmt(cmSecond["061-1470"] ?? 0)} (expect 10000 × 25/90 = 2777.78)`);
console.log(`  OTHER: ${fmt(cmSecond["401-0000"] ?? 0)} (expect 10000 × 5/90  = 555.56)`);

assert.equal(
  Math.round(cmSecond["011-1200"] ?? 0), 0,
  "CM Salaries Second EXCLUDES self (Round 2 drops home center)",
);
const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
assert.ok(close(cmSecond["011-3100"] ?? 0, 10000 * 30 / 90), "CM Salaries Second → PLAN");
assert.ok(close(cmSecond["011-3200"] ?? 0, 10000 * 20 / 90), "CM Salaries Second → BLDG");
assert.ok(close(cmSecond["011-3300"] ?? 0, 10000 * 10 / 90), "CM Salaries Second → ENG");
assert.ok(close(cmSecond["061-1470"] ?? 0, 10000 * 25 / 90), "CM Salaries Second → Fringe");
assert.ok(close(cmSecond["401-0000"] ?? 0, 10000 *  5 / 90), "CM Salaries Second → OTHER");

// Fringe Distribution pool — $0 own eligible, downstream of CM in step
// order. Under sequential step-down:
//   First Incoming[Fringe]  = $25K (CM Salaries' Phase 1 to Fringe).
//   First Pool[Fringe]      = $0 + 1.0 × $25K = $25K → distributed via
//                              Fringe's 50/30/20 schedule with NO exclusions.
//     → First col: PLAN $12,500, BLDG $7,500, ENG $5,000.
//   Total Received[Fringe]  = $25K (Phase 1) + $2,778 (CM Phase 2 upstream
//                              cross-flow) = $27,778.
//   Second Incoming[Fringe] = $27,778 - $25K = $2,778.
//   Second Pool[Fringe]     = 1.0 × $2,778 → distributed with self
//                              {Fringe} + upstream {CM} excluded. Fringe's
//                              schedule has neither in its receivers, so no
//                              renormalization needed.
//     → Second col: PLAN $1,389, BLDG $833, ENG $556.
const fbFirst  = model.firstAllocation["fb-redistribution"] ?? {};
const fbSecond = model.secondAllocation["fb-redistribution"] ?? {};
const expectFbSecondInc = 10000 * 25 / 90;        // CM Phase 2 cross-flow

console.log("\n== Fringe Distribution — sequential step-down ==");
console.log(`  First total: ${fmt(Object.values(fbFirst).reduce((a, v) => a + v, 0))} (expect 25000)`);
console.log(`  First → PLAN: ${fmt(fbFirst["011-3100"] ?? 0)} (expect 12500)`);
console.log(`  First → BLDG: ${fmt(fbFirst["011-3200"] ?? 0)} (expect 7500)`);
console.log(`  First → ENG:  ${fmt(fbFirst["011-3300"] ?? 0)} (expect 5000)`);
console.log(`  Second → PLAN: ${fmt(fbSecond["011-3100"] ?? 0)} (expect ${fmt(expectFbSecondInc * 0.5)})`);
console.log(`  Second → BLDG: ${fmt(fbSecond["011-3200"] ?? 0)} (expect ${fmt(expectFbSecondInc * 0.3)})`);
console.log(`  Second → ENG:  ${fmt(fbSecond["011-3300"] ?? 0)} (expect ${fmt(expectFbSecondInc * 0.2)})`);

assert.equal(
  Math.round(Object.values(fbFirst).reduce((a, v) => a + v, 0)), 25000,
  "Fringe First Pool = own ($0) + share of upstream First Incoming ($25K) = $25K",
);
assert.equal(Math.round(fbFirst["011-3100"] ?? 0), 12500, "Fringe First → PLAN");
assert.equal(Math.round(fbFirst["011-3200"] ?? 0),  7500, "Fringe First → BLDG");
assert.equal(Math.round(fbFirst["011-3300"] ?? 0),  5000, "Fringe First → ENG");
assert.ok(close(fbSecond["011-3100"] ?? 0, expectFbSecondInc * 0.5), "Fringe Second → PLAN");
assert.ok(close(fbSecond["011-3200"] ?? 0, expectFbSecondInc * 0.3), "Fringe Second → BLDG");
assert.ok(close(fbSecond["011-3300"] ?? 0, expectFbSecondInc * 0.2), "Fringe Second → ENG");

// incomingRound1[Fringe] = First Incoming = upstream Phase 1 to Fringe.
// incomingRound2[Fringe] = Phase 2 cross-flows landed on Fringe = CM
//   Salaries' Phase 2 share to Fringe = $10K × 25/90 = $2,778.
const fringeR1 = model.incomingRound1["061-1470"] ?? 0;
const fringeR2 = model.incomingRound2["061-1470"] ?? 0;
console.log(`\n  Fringe First Incoming: ${fmt(fringeR1)} (expect 25000)`);
console.log(`  Fringe Phase 2 cross-flow: ${fmt(fringeR2)} (expect ${fmt(expectFbSecondInc)})`);
assert.equal(Math.round(fringeR1), 25000, "Fringe First Incoming (upstream CM Phase 1)");
assert.ok(close(fringeR2, expectFbSecondInc), "Fringe Phase 2 incoming (CM cross-flow)");

// directTotals — sequential step-down with both pools redistributing
// through their entire Total Received → fully conserves to $100K.
const plan  = model.directTotals["011-3100"] ?? 0;
const bldg  = model.directTotals["011-3200"] ?? 0;
const eng   = model.directTotals["011-3300"] ?? 0;
const other = model.directTotals["401-0000"] ?? 0;

// CM Salaries P1 to PLAN: 30% × $100K = $30K
// CM Salaries P2 to PLAN: $10K × 30/90 = $3,333.33
// Fringe P1 to PLAN: 50% × $25K = $12,500
// Fringe P2 to PLAN: 50% × $2,777.78 = $1,388.89
// Total: $47,222.22
const expectPlan  = 30000 + 10000 * 30 / 90 + expectFbSecondInc * 0.5 + 12500;
const expectBldg  = 20000 + 10000 * 20 / 90 + expectFbSecondInc * 0.3 +  7500;
const expectEng   = 10000 + 10000 * 10 / 90 + expectFbSecondInc * 0.2 +  5000;
const expectOther =  5000 + 10000 *  5 / 90;

console.log("\n== Direct totals (sum across pools) ==");
console.log(`  PLAN: ${fmt(plan)} (expect ${fmt(expectPlan)})`);
console.log(`  BLDG: ${fmt(bldg)} (expect ${fmt(expectBldg)})`);
console.log(`  ENG:  ${fmt(eng)}  (expect ${fmt(expectEng)})`);
console.log(`  OTHER: ${fmt(other)} (expect ${fmt(expectOther)})`);

assert.ok(close(plan,  expectPlan),  "PLAN system total");
assert.ok(close(bldg,  expectBldg),  "BLDG system total");
assert.ok(close(eng,   expectEng),   "ENG  system total");
assert.ok(close(other, expectOther), "OTHER system total");

// CM Salaries' row shows its allocation to Fringe in the (CM, Fringe) cell
// — both First ($25K, from own Phase 1) and Second ($10K × 25/90 = $2,778,
// from CM's Phase 2 redistribution of its $10K self-allocation) live in
// CM Salaries' row.
const expectCmFringeCell = 25000 + 10000 * 25 / 90;
console.log(`\n  CM Salaries → Fringe cell: ${fmt(cmFinal["061-1470"] ?? 0)} (expect ${fmt(expectCmFringeCell)})`);
assert.ok(close(cmFinal["061-1470"] ?? 0, expectCmFringeCell), "(CM Salaries, Fringe) cell");

// System conservation: sequential step-down fully redistributes the $100K
// input — Fringe processes its entire Total Received ($27,778 = upstream
// Phase 1 + upstream Phase 2 cross-flow) through First + Second columns,
// landing everything on directs. Residual on indirects = $10K (CM self),
// which IS in alloc2[CM Salaries][CM] but that's not "lost" — it's just
// the self-allocation portion of CM Salaries' Phase 1.
const directSum = plan + bldg + eng + other;
console.log("\n== Conservation ==");
console.log(`  Direct sum: ${fmt(directSum)} (expect 100000)`);
assert.ok(close(directSum, 100000),
  "Direct totals must reconcile to $100K input (sequential step-down conserves fully)");

// FBHR roll-up sums only direct nodes with feeDept set.
// PLAN/BLDG/ENG receivers carry feeDept; OTHER does not.
const capAllocated = capAllocatedFromGl(model);
console.log("\n== FBHR roll-up ==");
console.log(`  PLAN: ${fmt(capAllocated.PLAN)} (expect ${fmt(expectPlan)})`);
console.log(`  BLDG: ${fmt(capAllocated.BLDG)} (expect ${fmt(expectBldg)})`);
console.log(`  ENG:  ${fmt(capAllocated.ENG)}  (expect ${fmt(expectEng)})`);

assert.ok(close(capAllocated.PLAN, expectPlan), "PLAN FBHR matches direct total");
assert.ok(close(capAllocated.BLDG, expectBldg), "BLDG FBHR matches direct total");
assert.ok(close(capAllocated.ENG,  expectEng),  "ENG  FBHR matches direct total");

// OTHER (CIP Fund 401) must NOT roll into any fee dept.
const feeDeptTotal = capAllocated.PLAN + capAllocated.BLDG + capAllocated.ENG;
console.log(`  Fee-dept total: ${fmt(feeDeptTotal)} (expect ${fmt(expectPlan + expectBldg + expectEng)})`);
assert.ok(close(feeDeptTotal, expectPlan + expectBldg + expectEng),
  "Fee depts must NOT include OTHER receiver $");

// ── DIRECT-routing strictness (post-resolveDirectNode refactor) ─────────
//
// The strict-glCode engine routes DIRECT pools only through their imported
// receivers list. No deptCode fallback. Three scenarios:
//   (a) DIRECT + valid receiver glCode → distributes via the schedule.
//   (b) DIRECT + no receivers          → eligible $ leaks, diagnostics
//                                        records the pool.
//   (c) DIRECT + receivers all missing glCodes / zero-percent → same
//                                        as (b): leakage + diagnostic.
//
// We run a second engine pass on a tiny synthetic CAP to verify each.

console.log("\n== DIRECT-routing strictness ==");

const directOnlyCenters: Record<string, number> = { "Test Direct Center": 50000 };
const directOnlyGl: Record<string, string> = { "Test Direct Center": "SEED-TDC" };
const directOnlyOrder: string[] = ["Test Direct Center"];
const directOnlyReceivers = [
  { key: "rcv:SEED-RECADMIN", glCode: "SEED-RECADMIN", dept: "Recreation Admin",
    deptCode: "OTHER" as const, values: {}, sources: [] },
];

// Scenario (a) — DIRECT pool with a valid receiver glCode.
const directOkPools: CapPool[] = [{
  id: "test-direct-ok",
  center: "Test Direct Center",
  pool: "Routes to Recreation Admin",
  allocationPercent: 100, amount: 50000,
  basisId: "bas-direct", basis: "Direct allocation",
  receiving: "Recreation Administration",
  recoverability: "Out of fee scope", review: "Reviewed",
  receivers: [
    { dept: "Recreation Admin", glCode: "SEED-RECADMIN",
      deptCode: "OTHER", percent: 100, amount: 50000 },
  ],
}];
const directOkBases: AllocationBasis[] = [
  ...bases,
  { id: "bas-direct", name: "Direct allocation", source: "Manual",
    driverKey: "DIRECT", createdAt: NOW, validationStatus: "verified",
    // directTo is METADATA only — engine must not route by it.
    directTo: "PARKS" },
];
const directOkGraph = buildEngineGraph({
  capPools: directOkPools, allocationBases: directOkBases,
  capCenterTotals: directOnlyCenters, capCenterGlCodes: directOnlyGl,
  capReceivers: directOnlyReceivers,
});
const directOkModel = computeStepDownGl({
  pools: directOkPools, centerOrder: directOnlyOrder,
  bases: directOkBases, graph: directOkGraph,
});

console.log("  (a) DIRECT + receiver glCode:");
console.log(`      Recreation Admin First: ${fmt(directOkModel.firstAllocation["test-direct-ok"]?.["SEED-RECADMIN"] ?? 0)} (expect 50000)`);
console.log(`      Diagnostics: ${directOkModel.diagnostics.length} (expect 0)`);
assert.equal(
  Math.round(directOkModel.firstAllocation["test-direct-ok"]?.["SEED-RECADMIN"] ?? 0),
  50000,
  "DIRECT pool with valid receiver glCode routes the full eligible $",
);
assert.equal(directOkModel.diagnostics.length, 0,
  "DIRECT pool with valid receivers must not emit diagnostics");

// PARKS must NOT receive anything despite directTo === "PARKS" — directTo
// is now metadata, not routing.
const parksNodeKey = directOkModel.nodes.find(
  (n) => n.role === "direct" && n.feeDept === undefined && n.classification === "PARKS",
)?.key;
assert.equal(parksNodeKey, undefined,
  "No PARKS node should be created — only seed:dept:PLAN/BLDG/ENG synth nodes exist");

// Scenario (b) — DIRECT pool with no receivers.
const directLeakPools: CapPool[] = [{
  id: "test-direct-leak",
  center: "Test Direct Center",
  pool: "Empty receivers",
  allocationPercent: 100, amount: 50000,
  basisId: "bas-direct", basis: "Direct allocation",
  receiving: "Nowhere", recoverability: "TBD", review: "Review",
  // NO receivers array on purpose.
}];
const directLeakGraph = buildEngineGraph({
  capPools: directLeakPools, allocationBases: directOkBases,
  capCenterTotals: directOnlyCenters, capCenterGlCodes: directOnlyGl,
  capReceivers: directOnlyReceivers,
});
const directLeakModel = computeStepDownGl({
  pools: directLeakPools, centerOrder: directOnlyOrder,
  bases: directOkBases, graph: directLeakGraph,
});

console.log("  (b) DIRECT + no receivers:");
const leakRow = directLeakModel.firstAllocation["test-direct-leak"] ?? {};
const leakTotal = Object.values(leakRow).reduce((a, v) => a + v, 0);
console.log(`      Σ firstAllocation = ${fmt(leakTotal)} (expect 0 — pure leakage)`);
console.log(`      Diagnostics: ${directLeakModel.diagnostics.length} (expect 1)`);
assert.equal(Math.round(leakTotal), 0,
  "DIRECT pool with no receivers must produce $0 allocations (no deptCode fallback)");
assert.equal(directLeakModel.diagnostics.length, 1,
  "DIRECT pool with no receivers must emit exactly one diagnostic");
assert.equal(directLeakModel.diagnostics[0].kind, "no-valid-glcodes");
assert.equal(directLeakModel.diagnostics[0].poolId, "test-direct-leak");

// Scenario (c) — DIRECT pool with receivers that all have missing glCodes
// or zero percent.
const directBadPools: CapPool[] = [{
  id: "test-direct-bad",
  center: "Test Direct Center",
  pool: "Bad receivers",
  allocationPercent: 100, amount: 50000,
  basisId: "bas-direct", basis: "Direct allocation",
  receiving: "Multiple", recoverability: "TBD", review: "Review",
  receivers: [
    // Missing glCode — engine can't route to it.
    { dept: "Mystery dept", glCode: undefined, deptCode: "OTHER",
      percent: 60, amount: 30000 },
    // glCode that doesn't match any node — engine can't route to it.
    { dept: "Unknown",      glCode: "DOES-NOT-EXIST", deptCode: "OTHER",
      percent: 40, amount: 20000 },
  ],
}];
const directBadGraph = buildEngineGraph({
  capPools: directBadPools, allocationBases: directOkBases,
  capCenterTotals: directOnlyCenters, capCenterGlCodes: directOnlyGl,
  capReceivers: directOnlyReceivers,
});
const directBadModel = computeStepDownGl({
  pools: directBadPools, centerOrder: directOnlyOrder,
  bases: directOkBases, graph: directBadGraph,
});

console.log("  (c) DIRECT + receivers all missing/unmatched glCodes:");
const badRow = directBadModel.firstAllocation["test-direct-bad"] ?? {};
const badTotal = Object.values(badRow).reduce((a, v) => a + v, 0);
console.log(`      Σ firstAllocation = ${fmt(badTotal)} (expect 0 — leakage)`);
console.log(`      Diagnostics: ${directBadModel.diagnostics.length} (expect 1)`);
assert.equal(Math.round(badTotal), 0,
  "DIRECT pool with no resolvable receiver glCodes must leak");
assert.equal(directBadModel.diagnostics.length, 1,
  "DIRECT pool with unresolvable receivers must emit one diagnostic");

// FBHR roll-up still functions on the original LAH-shaped fixture.
// PLAN/BLDG/ENG totals were asserted above (lines 296-298); diagnostics
// for that model should be empty since CM Salaries is non-DIRECT and
// Fringe Distribution has valid receivers.
console.log(`\n  Main fixture diagnostics: ${model.diagnostics.length} (expect 0)`);
assert.equal(model.diagnostics.length, 0,
  "Main fixture must produce zero diagnostics (all pools route cleanly)");

console.log("\nAll CAP step-down assertions passed.");
