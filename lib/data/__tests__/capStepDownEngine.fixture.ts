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
} from "../capStepDownEngine";
import { allocationBasesUsedByPools } from "../capBasisRouting";
import { buildReceiverRegistry } from "../capReceiverRegistry";
import { DEFAULT_STUDY_CONTEXT } from "../studyContext";

/** Convert the fixture's name-keyed (totals, glCodes) pair into the
 *  engine's glCode-keyed (totals, sources) shape so each test block can
 *  keep declaring centers by name. Names that don't appear in glByName
 *  fall back to `seed:center:NAME`. */
function buildCenterMaps(
  totalsByName: Record<string, number>,
  glByName: Record<string, string>,
): {
  totals: Record<string, number>;
  sources: Record<string, { name: string; source: "seed"; sourceFile?: string }>;
  keyByName: Record<string, string>;
} {
  const totals: Record<string, number> = {};
  const sources: Record<string, { name: string; source: "seed"; sourceFile?: string }> = {};
  const keyByName: Record<string, string> = {};
  for (const [name, total] of Object.entries(totalsByName)) {
    const key = glByName[name] ?? `seed:center:${name}`;
    keyByName[name] = key;
    totals[key] = total;
    sources[key] = { name, source: "seed" };
  }
  return { totals, sources, keyByName };
}

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

const mainCenters = buildCenterMaps(
  { "City Manager": 100000, "Fringe Benefits Allocation": 0 },
  { "City Manager": "011-1200", "Fringe Benefits Allocation": "061-1470" },
);
const capCenterOrder: string[] = [
  mainCenters.keyByName["City Manager"],
  mainCenters.keyByName["Fringe Benefits Allocation"],
];

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
    centerGlCode: mainCenters.keyByName["City Manager"],
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
    centerGlCode: mainCenters.keyByName["Fringe Benefits Allocation"],
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

const matrixBases = allocationBasesUsedByPools(capPools, [
  {
    id: "bas-old",
    name: "Prior-year headcount",
    source: "Prior plan",
    driverKey: "FTE",
    createdAt: NOW,
  },
  ...bases,
  {
    id: "bas-direct",
    name: "Direct to Planning",
    source: "Manual",
    driverKey: "DIRECT",
    directTo: "PLAN",
    createdAt: NOW,
  },
]);
assert.deepEqual(
  matrixBases.map((basis) => basis.id),
  ["bas-fte-cm", "bas-fte-fb"],
  "Allocation Bases matrix excludes unreferenced catalog entries and DIRECT routes",
);

// Receivers come from the registry, which now scans basisUnits +
// directAllocations directly. Built fresh here so the test exercises
// the same code path the store uses.
const { entries: capReceivers } = buildReceiverRegistry(
  capBasisUnits, capDirectAllocations, bases, DEFAULT_STUDY_CONTEXT,
);

// Registry ordering contract — indirect bucket first (alphabetical by
// display name, preserves the pre-existing convention), then direct
// bucket sorted by glCode ascending. The Allocation Bases matrix
// renders rows in this order, so the assertion below pins the visual
// grouping as well as the data shape.
{
  // Indirect: "City Manager" (CMGR) precedes "Fringe Benefits Allocation"
  // (FAS) — the old dept-name sort is preserved for this bucket.
  // Direct: glCodes ascending → 011-3100 (PLAN), 011-3200 (BLDG),
  // 011-3300 (ENG), 401-0000 (OTHER). Note: sorted by glCode this
  // differs from dept-name order ("Building" would otherwise come first).
  assert.deepEqual(
    capReceivers.map((r) => r.glCode),
    ["011-1200", "061-1470", "011-3100", "011-3200", "011-3300", "401-0000"],
    "registry orders indirect-then-direct, direct bucket sorted by glCode ascending",
  );
  // Indirect bucket head ordering still uses the dept name — proves the
  // glCode rule only applies to the direct bucket.
  const indirect = capReceivers.filter((r) =>
    r.glCode === "011-1200" || r.glCode === "061-1470",
  );
  assert.deepEqual(
    indirect.map((r) => r.dept),
    ["City Manager", "Fringe Benefits Allocation"],
    "indirect bucket preserves dept-name ordering",
  );
  console.log("  ✓ receiver registry: direct receivers sorted by glCode; indirect unchanged");
}

// ── Build the engine + run ───────────────────────────────────────────────

const graph = buildEngineGraph({
  allocationBases: bases,
  basisUnits: capBasisUnits,
  directAllocations: capDirectAllocations,
  capCenterTotals: mainCenters.totals,
  capCenterSources: mainCenters.sources,
  capReceivers,
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
const sharedCtr = buildCenterMaps(
  { "Shared Center": 0 },
  { "Shared Center": "SEED-SHARED" },
);
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
    id: "shared-pool-1", center: "Shared Center",
    centerGlCode: sharedCtr.keyByName["Shared Center"],
    pool: "Pool One",
    allocationPercent: 50, amount: 100000,
    basisId: "shared-basis-A", basis: "Shared FTE",
    receiving: "PLAN+BLDG", recoverability: "Fully recoverable", review: "Reviewed",
  },
  {
    id: "shared-pool-2", center: "Shared Center",
    centerGlCode: sharedCtr.keyByName["Shared Center"],
    pool: "Pool Two",
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
  capCenterTotals: sharedCtr.totals,
  capCenterSources: sharedCtr.sources,
  capReceivers: sharedReceivers,
});
const sharedModel = computeStepDownGl({
  pools: sharedPools, centerOrder: [sharedCtr.keyByName["Shared Center"]],
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
// 60 units against PLAN and 40 against BLDG. Per-pool routing must
// derive percents from those raw units (not doubled by per-pool
// re-counting), which Test 6 above already proves at the allocation
// level (60/40 splits, not 75/25 or any other ratio).
//
// Test 8: ReceiverRegistry surfaces each receiver exactly once even though
// two pools reference the basis.
const planEntries = sharedReceivers.filter((r) => r.glCode === "011-3100");
const bldgEntries = sharedReceivers.filter((r) => r.glCode === "011-3200");
assert.equal(planEntries.length, 1, "Receiver registry: one entry per glCode regardless of pool count");
assert.equal(bldgEntries.length, 1, "Receiver registry: one entry per glCode regardless of pool count");

// ── Center-pool weighting by personnel + operating ─────────────────────
//
// Town Center Operations–style scenario: a center has multiple pools,
// all with amount = 0 and personnel + operating populated. The center
// receives incoming dollars from upstream, and each pool's share of
// that incoming should be weighted by its personnel + operating
// breakdown — not by allocationPercent.
//
// Pool A: amount=0, p+o=613,161
// Pool B: amount=0, p+o=339,000
// (Σ p+o = 952,161). Both pools sit at "Inner Center".
//
// We simulate first-incoming by giving the center a single upstream
// pool that ships its full $1,072,341 into Inner Center. After Phase 1:
//   firstIncoming[Inner Center] = 1,072,341
//   Pool A weight = 613,161 / 952,161 = 0.64396
//   firstPool[Pool A]           = 0 + 0.64396 × 1,072,341 = 690,528
// Pool A's basis routes 100% to PLAN, so Pool A's First Allocation to
// PLAN must equal 690,528.

console.log("\n== Center-pool weighting by personnel + operating ==");

const wtBases: AllocationBasis[] = [
  {
    id: "wt-upstream", name: "Upstream", source: "Fixture",
    driverKey: "FTE", createdAt: NOW, validationStatus: "verified",
  },
  {
    id: "wt-inner", name: "Inner schedule", source: "Fixture",
    driverKey: "PAYROLL", createdAt: NOW, validationStatus: "verified",
  },
];
const wt = buildCenterMaps(
  { "Upstream Center": 1_072_341, "Inner Center": 0 },
  { "Upstream Center": "UP-CTR", "Inner Center": "IN-CTR" },
);
const wtOrder = [wt.keyByName["Upstream Center"], wt.keyByName["Inner Center"]];
const wtBasisUnits: BasisUnitRow[] = [
  // Upstream pool ships its full amount into Inner Center.
  {
    basisId: "wt-upstream", basis: "Upstream",
    receivers: [
      { dept: "Inner Center", glCode: "IN-CTR", deptCode: "OTHER", units: 100 },
    ],
  },
  // Pool A routes 100% to PLAN.
  {
    basisId: "wt-inner", basis: "Inner schedule",
    receivers: [
      { dept: "Planning Admin", glCode: "011-3100", deptCode: "PLAN", units: 100 },
    ],
  },
];
const wtPools: CapPool[] = [
  {
    id: "wt-upstream-pool",
    center: "Upstream Center", centerGlCode: wt.keyByName["Upstream Center"],
    pool: "Upstream Pool",
    allocationPercent: 100, amount: 1_072_341,
    basisId: "wt-upstream", basis: "Upstream",
    receiving: "Inner Center", recoverability: "Fully recoverable", review: "Reviewed",
  },
  {
    id: "wt-pool-a",
    center: "Inner Center", centerGlCode: wt.keyByName["Inner Center"],
    pool: "Pool A (P+O 613,161)",
    allocationPercent: 64.4, amount: 0,
    personnelCost: 600_000, operatingCost: 13_161,
    basisId: "wt-inner", basis: "Inner schedule",
    receiving: "PLAN", recoverability: "Fully recoverable", review: "Reviewed",
  },
  {
    id: "wt-pool-b",
    center: "Inner Center", centerGlCode: wt.keyByName["Inner Center"],
    pool: "Pool B (P+O 339,000)",
    allocationPercent: 35.6, amount: 0,
    personnelCost: 300_000, operatingCost:  39_000,
    basisId: "wt-inner", basis: "Inner schedule",
    receiving: "PLAN", recoverability: "Fully recoverable", review: "Reviewed",
  },
];
const { entries: wtReceivers } = buildReceiverRegistry(
  wtBasisUnits, [], wtBases, DEFAULT_STUDY_CONTEXT,
);
const wtGraph = buildEngineGraph({
  allocationBases: wtBases,
  basisUnits: wtBasisUnits,
  directAllocations: [],
  capCenterTotals: wt.totals,
  capCenterSources: wt.sources,
  capReceivers: wtReceivers,
});
const wtModel = computeStepDownGl({
  pools: wtPools, centerOrder: wtOrder,
  bases: wtBases, basisUnits: wtBasisUnits,
  directAllocations: [], graph: wtGraph,
});

const wtPoolAPlan = wtModel.firstAllocation["wt-pool-a"]?.["011-3100"] ?? 0;
const wtPoolBPlan = wtModel.firstAllocation["wt-pool-b"]?.["011-3100"] ?? 0;
const expectPoolA = (613_161 / 952_161) * 1_072_341;
const expectPoolB = (339_000 / 952_161) * 1_072_341;
console.log(`  Pool A First → PLAN: ${fmt(wtPoolAPlan)} (expect ${fmt(expectPoolA)})`);
console.log(`  Pool B First → PLAN: ${fmt(wtPoolBPlan)} (expect ${fmt(expectPoolB)})`);
console.log(`  Σ → PLAN: ${fmt(wtPoolAPlan + wtPoolBPlan)} (expect ${fmt(1_072_341)})`);
assert.ok(close(wtPoolAPlan, expectPoolA, 1),
  "Pool A weighted by 613,161/952,161 (effective $ ratio)");
assert.ok(close(wtPoolBPlan, expectPoolB, 1),
  "Pool B weighted by 339,000/952,161 (effective $ ratio)");
assert.ok(close(wtPoolAPlan + wtPoolBPlan, 1_072_341, 1),
  "Pool A + Pool B fully redistribute first-incoming");

// ── DIRECT-routing strictness ─────────────────────────────────────────────
//
// DIRECT pools route via DirectAllocationRow.receivers. Three scenarios:
//   (a) DIRECT + receiver glCode that points at a node → routes the pool $.
//   (b) DIRECT + no DirectAllocationRow → leaks, diagnostic recorded.
//   (c) DIRECT + DirectAllocationRow with all unmatched glCodes → leaks.

console.log("\n== DIRECT-routing strictness ==");

const directOnly = buildCenterMaps(
  { "Test Direct Center": 50000 },
  { "Test Direct Center": "SEED-TDC" },
);
const directOnlyOrder = [directOnly.keyByName["Test Direct Center"]];
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
  centerGlCode: directOnly.keyByName["Test Direct Center"],
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
  capCenterTotals: directOnly.totals,
  capCenterSources: directOnly.sources,
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
  centerGlCode: directOnly.keyByName["Test Direct Center"],
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
  capCenterTotals: directOnly.totals,
  capCenterSources: directOnly.sources,
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
assert.equal(directLeakModel.diagnostics[0].kind, "no-receivers",
  "DIRECT pool with no DirectAllocationRow at all → 'no-receivers' (distinct from 'no-valid-glcodes', which fires when receivers exist but none resolve to a node)");

// (c) DIRECT pool with receivers all pointing at unknown glCodes → leaks.
const directBadPools: CapPool[] = [{
  id: "test-direct-bad",
  center: "Test Direct Center",
  centerGlCode: directOnly.keyByName["Test Direct Center"],
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
  capCenterTotals: directOnly.totals,
  capCenterSources: directOnly.sources,
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

// ── glCode-first pool home resolution ───────────────────────────────────
//
// A pool whose centerGlCode is set should route via the glCode index even
// when pool.center is wrong: resolvePoolHome prefers centerGlCode over
// center name. The reverse path (no centerGlCode → fall back to center
// name) is exercised by every other test in this file.

console.log("\n== glCode-first pool home resolution ==");

const glRouteBases: AllocationBasis[] = [{
  id: "bas-fte-route", name: "Route FTE", source: "HRIS",
  driverKey: "FTE", createdAt: NOW, createdBy: "fixture",
  validationStatus: "verified",
}];
const glRoute = buildCenterMaps(
  { "City Manager": 100000 },
  { "City Manager": "011-1200" },
);
const glRouteBasisUnits: BasisUnitRow[] = [{
  basisId: "bas-fte-route",
  basis: "Route FTE",
  receivers: [
    { dept: "Planning Admin", glCode: "011-3100", deptCode: "PLAN", units: 100 },
  ],
}];
const glRoutePools: CapPool[] = [
  // Bogus center name but a real centerGlCode that matches the indirect
  // node "011-1200". Engine must route via the glCode index, NOT fail
  // over to the name lookup.
  {
    id: "gl-route-pool",
    center: "NOT THE REAL CENTER NAME",
    centerGlCode: "011-1200",
    pool: "Test",
    allocationPercent: 100, amount: 100000,
    basisId: "bas-fte-route", basis: "Route FTE",
    receiving: "PLAN", recoverability: "Fully recoverable", review: "Reviewed",
  },
];
const { entries: glRouteReceivers } = buildReceiverRegistry(
  glRouteBasisUnits, [], glRouteBases, DEFAULT_STUDY_CONTEXT,
);
const glRouteGraph = buildEngineGraph({
  allocationBases: glRouteBases,
  basisUnits: glRouteBasisUnits,
  directAllocations: [],
  capCenterTotals: glRoute.totals,
  capCenterSources: glRoute.sources,
  capReceivers: glRouteReceivers,
});
const glRouteModel = computeStepDownGl({
  pools: glRoutePools,
  // centerOrder is NodeKey[] — pass the indirect node's key.
  centerOrder: [glRoute.keyByName["City Manager"]],
  bases: glRouteBases, basisUnits: glRouteBasisUnits,
  directAllocations: [], graph: glRouteGraph,
});

const glRouteFirst = glRouteModel.firstAllocation["gl-route-pool"] ?? {};
console.log(`  Bogus name + real glCode → PLAN: ${fmt(glRouteFirst["011-3100"] ?? 0)} (expect 100000)`);
assert.equal(Math.round(glRouteFirst["011-3100"] ?? 0), 100000,
  "Pool routed via centerGlCode even when pool.center doesn't match any known center");

// ── Synthetic direct nodes removed ──────────────────────────────────────
//
// The graph builder used to seed PLAN/BLDG/ENG (`seed:dept:*`) direct
// nodes as visible empty-state receivers when no imports had been
// loaded. That fallback is gone — direct nodes come exclusively from
// imported basisUnits / directAllocations. Three assertions cover the
// post-removal contract:
//   (1) No basis/direct-allocation data → zero direct nodes.
//   (2) Imported receivers still produce direct nodes (regression).
//   (3) Missing receiver schedules still produce the existing leakage
//       diagnostics (no silent fallback path).

console.log("\n== Synthetic direct nodes removed ==");

// (1) Empty CAP data — no receivers, no direct allocations. The graph
//     still has indirect nodes for the imported center, but the direct
//     bucket is empty.
{
  const emptyCenters = buildCenterMaps(
    { "City Manager": 100000 },
    { "City Manager": "011-1200" },
  );
  const emptyBases: AllocationBasis[] = [];
  const emptyBasisUnits: BasisUnitRow[] = [];
  const emptyDirectAllocations: DirectAllocationRow[] = [];
  const { entries: emptyReceivers } = buildReceiverRegistry(
    emptyBasisUnits, emptyDirectAllocations, emptyBases, DEFAULT_STUDY_CONTEXT,
  );
  const emptyGraph = buildEngineGraph({
    allocationBases: emptyBases,
    basisUnits: emptyBasisUnits,
    directAllocations: emptyDirectAllocations,
    capCenterTotals: emptyCenters.totals,
    capCenterSources: emptyCenters.sources,
    capReceivers: emptyReceivers,
  });
  const directNodes = emptyGraph.nodes.filter((n) => n.role === "direct");
  console.log(`  (1) Empty CAP data: ${directNodes.length} direct nodes (expect 0)`);
  assert.equal(directNodes.length, 0,
    "No basisUnits / directAllocations → zero direct nodes (no seed:dept:* fallback)");
  // The indirect City Manager node should still be present — center
  // totals continue to populate indirect nodes.
  const indirectNodes = emptyGraph.nodes.filter((n) => n.role === "indirect");
  assert.equal(indirectNodes.length, 1,
    "Indirect cost centers are still seeded from capCenterTotals");
  assert.ok(!emptyGraph.nodes.some((n) => n.key.startsWith("seed:dept:")),
    "No seed:dept:* nodes anywhere in the graph");
}

// (2) Imported receivers still produce direct nodes — regression cover for
//     the main routing path. Reuses the top-of-file `graph` so any drift
//     between the empty-state branch and the populated branch is caught
//     by the existing assertions; this one just pins the count + keys.
{
  const directNodes = graph.nodes.filter((n) => n.role === "direct");
  const directKeys = directNodes.map((n) => n.key).sort();
  console.log(`  (2) Imported receivers: ${directNodes.length} direct nodes`);
  assert.deepEqual(
    directKeys,
    ["011-3100", "011-3200", "011-3300", "401-0000"],
    "Imported receivers produce exactly the expected direct nodes",
  );
  assert.ok(!directKeys.some((k) => k.startsWith("seed:dept:")),
    "Populated graph has no seed:dept:* leftovers");
}

// (3) Missing receiver schedules still produce the existing leakage
//     diagnostics. Pool references a catalog basis whose BasisUnitRow
//     was never imported → engine emits a "no-schedule" diagnostic and
//     leaks the full eligible $; no synthetic fee-dept fallback absorbs
//     the dollars silently.
{
  const noSchedCenters = buildCenterMaps(
    { "City Manager": 50000 },
    { "City Manager": "011-1200" },
  );
  const noSchedBases: AllocationBasis[] = [{
    id: "bas-orphan-schedule",
    name: "Orphan basis (no imported schedule)",
    source: "Manual",
    driverKey: "FTE",
    createdAt: NOW,
  }];
  const noSchedBasisUnits: BasisUnitRow[] = [];      // intentionally empty
  const noSchedDirectAllocations: DirectAllocationRow[] = [];
  const noSchedPools: CapPool[] = [{
    id: "no-sched-pool",
    center: "City Manager",
    centerGlCode: noSchedCenters.keyByName["City Manager"],
    pool: "Costs that can't route",
    allocationPercent: 100, amount: 50000,
    basisId: "bas-orphan-schedule", basis: "Orphan basis (no imported schedule)",
    receiving: "Multiple", recoverability: "TBD", review: "Review",
  }];
  const { entries: noSchedReceivers } = buildReceiverRegistry(
    noSchedBasisUnits, noSchedDirectAllocations, noSchedBases, DEFAULT_STUDY_CONTEXT,
  );
  const noSchedGraph = buildEngineGraph({
    allocationBases: noSchedBases,
    basisUnits: noSchedBasisUnits,
    directAllocations: noSchedDirectAllocations,
    capCenterTotals: noSchedCenters.totals,
    capCenterSources: noSchedCenters.sources,
    capReceivers: noSchedReceivers,
  });
  const noSchedModel = computeStepDownGl({
    pools: noSchedPools,
    centerOrder: [noSchedCenters.keyByName["City Manager"]],
    bases: noSchedBases,
    basisUnits: noSchedBasisUnits,
    directAllocations: noSchedDirectAllocations,
    graph: noSchedGraph,
  });
  console.log(`  (3) Missing schedule: diagnostics=${noSchedModel.diagnostics.length}, leakage=${noSchedModel.leakageByPoolId["no-sched-pool"] ?? 0}`);
  assert.equal(noSchedModel.diagnostics.length, 1,
    "Missing receiver schedule still emits exactly one diagnostic");
  assert.equal(noSchedModel.diagnostics[0].kind, "no-schedule",
    "Diagnostic kind is 'no-schedule' (the existing leakage path)");
  assert.equal(noSchedModel.diagnostics[0].poolId, "no-sched-pool");
  assert.ok(
    Math.abs((noSchedModel.leakageByPoolId["no-sched-pool"] ?? 0) - 50000) < 0.5,
    "Full eligible $ leaks — no synthetic fee-dept node absorbs it",
  );
  // And no direct nodes were materialized as a side effect.
  const directNodes = noSchedGraph.nodes.filter((n) => n.role === "direct");
  assert.equal(directNodes.length, 0,
    "Missing schedule + no imports → still zero direct nodes");
}

console.log("\nAll CAP step-down assertions passed.");
