/* Deterministic fixture covering the sequential step-down engine.
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
 * Verifies:
 *   1. The zero-cost internal-service unit survives as an indirect node.
 *   2. When Fringe closes, its accumulated incoming $ (from City Manager's
 *      earlier close) routes via Fringe's own pool schedule — NOT via the
 *      source pool's basis.
 *   3. Conservation: Σ pool eligible ≈ Σ direct totals.
 *   4. FBHR roll-up sums only direct nodes whose feeDept is set.
 *   5. Closed centers cannot receive: City Manager (closed before Fringe)
 *      ends Fringe's close with $0 sitting on it.
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

// 2. When Fringe Benefits closes, it redistributes via its own schedule.
// City Manager closes first → sends 35% × $100K = $35,000 to Fringe.
// Fringe closes second → 50/30/20 to PLAN/BLDG/ENG of its sitting $35K:
//   PLAN gets +$17,500 (50%)
//   BLDG gets +$10,500 (30%)
//   ENG  gets +$7,000  (20%)
const plan = model.directTotals["011-3100"] ?? 0;
const bldg = model.directTotals["011-3200"] ?? 0;
const eng  = model.directTotals["011-3300"] ?? 0;
const other = model.directTotals["401-0000"] ?? 0;

console.log("\n== Direct totals ==");
console.log(`  PLAN (011-3100): ${fmt(plan)} (expect 30000 + 17500 = 47500)`);
console.log(`  BLDG (011-3200): ${fmt(bldg)} (expect 20000 + 10500 = 30500)`);
console.log(`  ENG  (011-3300): ${fmt(eng)}  (expect 10000 + 7000  = 17000)`);
console.log(`  OTHER (401-0000): ${fmt(other)} (expect 5000)`);

assert.equal(Math.round(plan),  47500, "PLAN total = CM direct + Fringe re-route");
assert.equal(Math.round(bldg),  30500, "BLDG total = CM direct + Fringe re-route");
assert.equal(Math.round(eng),   17000, "ENG total  = CM direct + Fringe re-route");
assert.equal(Math.round(other),  5000, "OTHER total = CM direct only (Fringe doesn't route here)");

// 3. Conservation. The CM Salaries pool's eligible amount ($100K) must equal
// the sum of its final placements across all nodes.
const cmFinal = model.alloc2["cm-salaries"];
let cmTotal = 0;
for (const v of Object.values(cmFinal ?? {})) cmTotal += v;
console.log(`\n== Conservation ==`);
console.log(`  CM Salaries pool final-row sum: ${fmt(cmTotal)} (expect 100000)`);
assert.ok(Math.abs(cmTotal - 100000) < 0.01, "Pool conservation must hold");

// Residual on indirect nodes — both City Manager (closed first) and Fringe
// (closed second) should have zero $ sitting on them after sequential
// closure completes.
const indirectResidual = (cmFinal?.["061-1470"] ?? 0)
  + (cmFinal?.["011-1200"] ?? 0);
console.log(`  CM Salaries indirect residual: ${fmt(indirectResidual)} (expect ~0)`);
assert.ok(Math.abs(indirectResidual) < 0.01, "Indirect residual must be ~0 after closure");

// 5. Closed centers cannot receive. City Manager closed before Fringe;
// Fringe's own schedule never names CM as a receiver. Therefore after
// Fringe closes, City Manager's sitting amount must remain 0.
assert.equal(
  Math.round(cmFinal?.["011-1200"] ?? 0), 0,
  "Closed center (City Manager) must not receive $ from later step closures",
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
