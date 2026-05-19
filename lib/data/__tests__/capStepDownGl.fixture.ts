/* Deterministic fixture covering the sequential step-down engine with
 * NBS-style processing-pool attribution.
 *
 * Run with: npm run test:cap
 *
 * Models a tiny LAH-shaped CAP:
 *   - One nonzero center "City Manager" with one pool that allocates to
 *     PLAN, BLDG, ENG, OTHER (CIP Fund), and the zero-cost internal-service
 *     unit "Fringe Benefits Allocation".
 *   - Fringe Benefits Allocation is itself a center placed AFTER City
 *     Manager in centerOrder: zero own cost, one zero-amount pool whose
 *     receivers (PLAN, BLDG, ENG) define how any incoming $ is
 *     redistributed when Fringe closes.
 *
 * Verifies (under processing-pool attribution):
 *   1. The zero-cost internal-service unit survives as an indirect node.
 *   2. CM Salaries' First Allocation row matches its own schedule (incl.
 *      $35K to Fringe and $0 to PLAN/BLDG/ENG beyond its direct share).
 *      CM Salaries' Second Allocation is $0 (CM has no incoming).
 *   3. Fringe Distribution pool's Second Allocation captures CM's $35K
 *      redistributed via Fringe's 50/30/20 PLAN/BLDG/ENG schedule.
 *      Fringe Distribution's First Allocation is $0 (zero own eligible).
 *   4. Direct-side conservation: Σ over pools of alloc2[*][direct] equals
 *      the system's distributed total.
 *   5. FBHR roll-up sums only direct nodes whose feeDept is set.
 *   6. Closed centers cannot receive: City Manager (closed before Fringe)
 *      ends Fringe's close with no inflow.
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
  // CM Salaries — pushes 60% of its $100K to three direct depts + a chunk
  // to the Fringe Benefits Allocation internal-service unit + a sliver to
  // an OTHER (CIP Fund) receiver.
  {
    id: "cm-salaries",
    center: "City Manager",
    pool: "City Manager Salaries",
    allocationPercent: 100,
    amount: 100000,
    eligiblePercent: 100,
    basisId: "bas-fte",
    basis: "Budgeted FTE",
    receiving: "Multiple departments",
    recoverability: "Fully recoverable",
    review: "Reviewed",
    receivers: [
      // 30% to Planning
      { dept: "Planning Admin", glCode: "011-3100", deptCode: "PLAN", percent: 30, amount: 30000 },
      // 20% to Building
      { dept: "Building Admin", glCode: "011-3200", deptCode: "BLDG", percent: 20, amount: 20000 },
      // 10% to Engineering
      { dept: "Engineering Admin", glCode: "011-3300", deptCode: "ENG", percent: 10, amount: 10000 },
      // 35% to Fringe Benefits Allocation — that unit will redistribute
      { dept: "Fringe Benefits Allocation", glCode: "061-1470", deptCode: "FAS", percent: 35, amount: 35000 },
      // 5% to a CIP fund (OTHER classification — not a fee dept)
      { dept: "CIP Fund 401", glCode: "401-0000", deptCode: "OTHER", percent: 5, amount: 5000 },
    ],
  },
  // Fringe Benefits Allocation's own pool — zero own $ but a published
  // schedule. Pass 2 uses this to redistribute incoming $ on this node.
  // Splits 50/30/20 across PLAN/BLDG/ENG; no OTHER cycle-back.
  {
    id: "fb-redistribution",
    center: "Fringe Benefits Allocation",
    pool: "Fringe Benefits Distribution",
    allocationPercent: 100,
    amount: 0,
    eligiblePercent: 100,
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

// 2. CM Salaries' own row reflects its published schedule. Sequential
// step-down with processing-pool attribution: when CM closes, CM Salaries
// distributes its own $100K via its schedule. The result lives entirely
// in CM Salaries' First Allocation row.
const cmFirst  = model.firstAllocation["cm-salaries"] ?? {};
const cmSecond = model.secondAllocation["cm-salaries"] ?? {};
const cmFinal  = model.alloc2["cm-salaries"] ?? {};

console.log("\n== CM Salaries pool row ==");
console.log(`  First → Fringe (061-1470): ${fmt(cmFirst["061-1470"] ?? 0)} (expect 35000)`);
console.log(`  First → PLAN  (011-3100):  ${fmt(cmFirst["011-3100"] ?? 0)} (expect 30000)`);
console.log(`  First → BLDG  (011-3200):  ${fmt(cmFirst["011-3200"] ?? 0)} (expect 20000)`);
console.log(`  First → ENG   (011-3300):  ${fmt(cmFirst["011-3300"] ?? 0)} (expect 10000)`);
console.log(`  First → OTHER (401-0000):  ${fmt(cmFirst["401-0000"] ?? 0)} (expect  5000)`);
console.log(`  Second total: ${fmt(Object.values(cmSecond).reduce((a, v) => a + v, 0))} (expect 0)`);

assert.equal(Math.round(cmFirst["061-1470"] ?? 0), 35000, "CM Salaries First → Fringe");
assert.equal(Math.round(cmFirst["011-3100"] ?? 0), 30000, "CM Salaries First → PLAN");
assert.equal(Math.round(cmFirst["011-3200"] ?? 0), 20000, "CM Salaries First → BLDG");
assert.equal(Math.round(cmFirst["011-3300"] ?? 0), 10000, "CM Salaries First → ENG");
assert.equal(Math.round(cmFirst["401-0000"] ?? 0),  5000, "CM Salaries First → OTHER");
assert.equal(
  Math.round(Object.values(cmSecond).reduce((a, v) => a + v, 0)), 0,
  "CM Salaries has no Second Allocation (CM closes first; no incoming)",
);

// 3. Fringe Distribution pool's row carries the $35K redistribution to
// PLAN/BLDG/ENG as Second Allocation (its own eligible is $0).
const fbFirst  = model.firstAllocation["fb-redistribution"] ?? {};
const fbSecond = model.secondAllocation["fb-redistribution"] ?? {};

console.log("\n== Fringe Distribution pool row ==");
console.log(`  First total: ${fmt(Object.values(fbFirst).reduce((a, v) => a + v, 0))} (expect 0)`);
console.log(`  Second → PLAN: ${fmt(fbSecond["011-3100"] ?? 0)} (expect 17500)`);
console.log(`  Second → BLDG: ${fmt(fbSecond["011-3200"] ?? 0)} (expect 10500)`);
console.log(`  Second → ENG:  ${fmt(fbSecond["011-3300"] ?? 0)} (expect  7000)`);

assert.equal(
  Math.round(Object.values(fbFirst).reduce((a, v) => a + v, 0)), 0,
  "Fringe Distribution pool has no own eligible (First = 0)",
);
assert.equal(Math.round(fbSecond["011-3100"] ?? 0), 17500, "Fringe Distribution Second → PLAN");
assert.equal(Math.round(fbSecond["011-3200"] ?? 0), 10500, "Fringe Distribution Second → BLDG");
assert.equal(Math.round(fbSecond["011-3300"] ?? 0),  7000, "Fringe Distribution Second → ENG");

// 4. Direct-side totals across pools.
const plan = model.directTotals["011-3100"] ?? 0;
const bldg = model.directTotals["011-3200"] ?? 0;
const eng  = model.directTotals["011-3300"] ?? 0;
const other = model.directTotals["401-0000"] ?? 0;

console.log("\n== Direct totals (sum across pools) ==");
console.log(`  PLAN: ${fmt(plan)} (expect 30000 + 17500 = 47500)`);
console.log(`  BLDG: ${fmt(bldg)} (expect 20000 + 10500 = 30500)`);
console.log(`  ENG:  ${fmt(eng)}  (expect 10000 + 7000  = 17000)`);
console.log(`  OTHER: ${fmt(other)} (expect 5000)`);

assert.equal(Math.round(plan),  47500, "PLAN system total");
assert.equal(Math.round(bldg),  30500, "BLDG system total");
assert.equal(Math.round(eng),   17000, "ENG system total");
assert.equal(Math.round(other),  5000, "OTHER system total");

// CM Salaries' indirect routing to Fringe shows up in CM Salaries' row,
// and Fringe Distribution's redistribution shows in Fringe's row. Pool
// rows do NOT double-count because each $ is attributed once to the pool
// whose schedule distributed it.
console.log(`\n  CM Salaries → Fringe (cell): ${fmt(cmFinal["061-1470"] ?? 0)} (expect 35000)`);
assert.equal(
  Math.round(cmFinal["061-1470"] ?? 0), 35000,
  "CM Salaries row should show its $35K routed to the Fringe indirect node",
);

// 6. Closed centers cannot receive — Fringe's schedule doesn't include CM,
// and even if it did, the receiver filter would exclude CM as already-closed.
assert.equal(
  Math.round(cmFinal["011-1200"] ?? 0), 0,
  "CM Salaries does not route to its own home center (City Manager)",
);
assert.equal(
  Math.round((model.alloc2["fb-redistribution"] ?? {})["011-1200"] ?? 0), 0,
  "Fringe Distribution does not route to already-closed center (City Manager)",
);

// 4. FBHR roll-up sums only direct nodes with feeDept set.
// PLAN/BLDG/ENG receivers carry feeDept; OTHER does not.
const capAllocated = capAllocatedFromGl(model);
console.log("\n== FBHR roll-up ==");
console.log(`  PLAN: ${fmt(capAllocated.PLAN)} (expect 47500)`);
console.log(`  BLDG: ${fmt(capAllocated.BLDG)} (expect 30500)`);
console.log(`  ENG:  ${fmt(capAllocated.ENG)}  (expect 17000)`);

assert.equal(Math.round(capAllocated.PLAN), 47500, "PLAN FBHR must match direct total");
assert.equal(Math.round(capAllocated.BLDG), 30500, "BLDG FBHR must match direct total");
assert.equal(Math.round(capAllocated.ENG),  17000, "ENG FBHR must match direct total");

// OTHER ($5K to CIP Fund 401) must NOT roll into any fee dept.
const feeDeptTotal = capAllocated.PLAN + capAllocated.BLDG + capAllocated.ENG;
console.log(`  Fee-dept total: ${fmt(feeDeptTotal)} (expect 95000, leaving 5000 on OTHER)`);
assert.equal(Math.round(feeDeptTotal), 95000, "Fee depts must NOT include OTHER receiver $");

console.log("\nAll CAP step-down assertions passed.");
