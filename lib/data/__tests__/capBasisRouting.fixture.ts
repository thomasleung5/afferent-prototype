/* Fixture for the CAP basis-routing helpers.
 *
 * Run with: npm run test:cap-basis-routing
 *
 * Pins the post-fallback contract: catalog-only basis resolution, no
 * text-match inference, no seed-driver fallback. Allocation Detail and
 * the step-down engine consume the same `basisForPool` result.
 *
 *   1. Valid basisId resolves to the catalog entry, exposing the
 *      current AllocationBasis.name + driverKey.
 *   2. Schedule lookup is by current basisId. Missing schedules return
 *      null instead of falling back to an unrelated row.
 *   3. Missing basisId surfaces as `missing-basisId` — engines and UI
 *      both produce a diagnostic / leakage rather than a default route.
 *   4. Orphaned basisId surfaces as `orphaned-basisId` with the bogus
 *      id echoed so diagnostics can name it.
 *   5. DIRECT vs non-DIRECT classification still comes from
 *      basis.driverKey on the resolved entry.
 *   6. Stale `pool.basis` display text never participates in routing —
 *      the catalog name wins when the two disagree.
 */

import assert from "node:assert/strict";
import type { AllocationBasis, BasisUnitRow, CapPool } from "../../types";
import {
  basisForPool, basisUnitRowForBasis, materializeDirectAsBasisUnits,
} from "../capBasisRouting";
import { buildEngineGraph, computeStepDownGl } from "../capStepDownEngine";
import { buildReceiverRegistry } from "../capReceiverRegistry";
import {
  CAP_POOLS, CAP_BASIS_UNITS, CAP_DIRECT_ALLOCATIONS,
  CAP_CENTER_TOTALS, CAP_CENTER_SOURCES_SEED,
} from "../cap";
import { SEED_ALLOCATION_BASES as SEED_BASES } from "../allocationBasesCatalog";
import { DEFAULT_STUDY_CONTEXT, type StudyContext } from "../studyContext";

const NOW = "2026-01-01T00:00:00.000Z";

const bases: AllocationBasis[] = [
  { id: "bas-fte",    name: "FY 24/25 Budgeted FTE",   source: "Adopted", driverKey: "FTE",    createdAt: NOW },
  { id: "bas-agenda", name: "FY 23/24 Agenda Items",   source: "Adopted", driverKey: "AGENDA", createdAt: NOW },
  { id: "bas-direct", name: "Direct to Planning",      source: "Manual",  driverKey: "DIRECT", directTo: "PLAN", createdAt: NOW },
];

const basisUnits: BasisUnitRow[] = [
  {
    basisId: "bas-fte",
    basis: "FY 24/25 Budgeted FTE",
    receivers: [
      { glCode: "011-3100", dept: "Planning Admin", deptCode: "PLAN", units: 30 },
      { glCode: "011-3200", dept: "Building Admin", deptCode: "BLDG", units: 20 },
    ],
  },
  {
    basisId: "bas-agenda",
    basis: "FY 23/24 Agenda Items",
    receivers: [
      { glCode: "011-1200", dept: "City Manager",   deptCode: "CMGR", units: 10 },
      { glCode: "011-3100", dept: "Planning Admin", deptCode: "PLAN", units: 40 },
    ],
  },
];

function makePool(overrides: Partial<CapPool>): CapPool {
  return {
    id: "pool-test",
    center: "City Manager",
    centerGlCode: "011-1200",
    pool: "Town-wide Support",
    allocationPercent: 100,
    amount: 100_000,
    basisId: "bas-fte",
    basis: "FY 24/25 Budgeted FTE",
    receiving: "Multiple departments",
    recoverability: "Recoverable",
    review: "Reviewed",
    ...overrides,
  };
}

// ─── 1. Valid basisId resolves to the catalog entry ────────────────────
{
  const r = basisForPool(
    makePool({ basisId: "bas-agenda", basis: "stale display text" }),
    bases,
  );
  assert.equal(r.status, "resolved");
  if (r.status !== "resolved") throw new Error("unreachable");
  assert.equal(r.basis.id, "bas-agenda");
  assert.equal(r.basis.name, "FY 23/24 Agenda Items",
    "catalog name wins over stale pool.basis text");
  assert.equal(r.basis.driverKey, "AGENDA");
  console.log("  ✓ valid basisId resolves with the catalog name + driverKey");
}

// ─── 2. Schedule selected by current basisId, not stale text ───────────
{
  const pool = makePool({
    basisId: "bas-agenda",
    basis: "FY 24/25 Budgeted FTE", // intentionally inconsistent
  });
  const bu = basisUnitRowForBasis(pool.basisId, basisUnits);
  assert.ok(bu);
  assert.equal(bu.basisId, "bas-agenda");
  assert.deepEqual(
    bu.receivers.map((rec) => rec.glCode),
    ["011-1200", "011-3100"],
    "agenda schedule receivers, not the FTE ones",
  );
  // DIRECT bases have no BasisUnitRow — missing schedule returns null.
  assert.equal(
    basisUnitRowForBasis("bas-direct", basisUnits), null,
    "missing schedule returns null (engine treats as no-schedule leakage)",
  );
  console.log("  ✓ schedule lookup keyed on current basisId, never stale name");
}

// ─── 3. Missing basisId surfaces as a diagnostic state ─────────────────
{
  const empty = basisForPool(makePool({ basisId: "" }), bases);
  assert.equal(empty.status, "missing-basisId");
  const blank = basisForPool(makePool({ basisId: "   " }), bases);
  assert.equal(blank.status, "missing-basisId",
    "whitespace-only basisId still classifies as missing");
  console.log("  ✓ missing basisId surfaces as missing-basisId");
}

// ─── 4. Orphaned basisId echoes the bogus id ───────────────────────────
{
  const r = basisForPool(
    makePool({ basisId: "bas-removed-by-cleanup" }), bases,
  );
  assert.equal(r.status, "orphaned-basisId");
  if (r.status !== "orphaned-basisId") throw new Error("unreachable");
  assert.equal(r.basisId, "bas-removed-by-cleanup");
  console.log("  ✓ orphaned basisId surfaces with bogus id echoed");
}

// ─── 5. DIRECT detection driven by resolved basis.driverKey ────────────
{
  const r = basisForPool(makePool({ basisId: "bas-direct" }), bases);
  assert.equal(r.status, "resolved");
  if (r.status !== "resolved") throw new Error("unreachable");
  assert.equal(r.basis.driverKey, "DIRECT",
    "DIRECT detection survives on the catalog entry — no inference required");
  assert.equal(r.basis.directTo, "PLAN");
  console.log("  ✓ DIRECT classification comes from the catalog driverKey");
}

// ─── 6. Stale pool.basis never substitutes for a missing basisId ───────
{
  // The old inferBasis() would have picked AGENDA from the "agenda"
  // keyword in pool.basis. Under the strict contract, this is missing.
  const r = basisForPool(
    makePool({ basisId: "", basis: "FY 23/24 Agenda Item Count" }),
    bases,
  );
  assert.equal(r.status, "missing-basisId",
    "text-match fallback is gone; the pool is unresolved regardless of pool.basis text");
  console.log("  ✓ stale pool.basis text cannot recover an unresolved pool");
}

// ─── 7. End-to-end: engine produces leakage + diagnostics, never silently
//        recovers an unresolved pool. Conservation holds: Σ allocated +
//        Σ leakage = Σ pool.amount. ──────────────────────────────────────
{
  // Build a small two-center model. One pool resolves cleanly to a
  // basis with a valid schedule; the other three exercise each
  // unresolved branch (missing basisId, orphaned basisId, no-schedule).
  // No fallback path exists — every unresolved pool must leak its full
  // eligible $ and surface a diagnostic of the matching kind.
  const ctx: StudyContext = { cityId: "test", fiscalYear: "FY 2025-26" };
  const centerKey = "ctr-cmgr";
  const centerTotals: Record<string, number> = { [centerKey]: 400_000 };
  const centerSources: Record<string, { name: string; source: "seed" }> = {
    [centerKey]: { name: "City Manager", source: "seed" },
  };

  const fixturePools: CapPool[] = [
    makePool({
      id: "pool-good", center: "City Manager", centerGlCode: centerKey,
      pool: "Routes cleanly", amount: 100_000, basisId: "bas-fte",
    }),
    makePool({
      id: "pool-missing", center: "City Manager", centerGlCode: centerKey,
      pool: "No basisId set", amount: 70_000, basisId: "",
    }),
    makePool({
      id: "pool-orphan", center: "City Manager", centerGlCode: centerKey,
      pool: "Catalog entry was deleted", amount: 50_000, basisId: "bas-removed",
    }),
    makePool({
      id: "pool-no-schedule", center: "City Manager", centerGlCode: centerKey,
      pool: "Catalog has the basis but no imported units",
      amount: 30_000, basisId: "bas-agenda-noschedule",
    }),
  ];
  // Catalog includes a basis with no matching BasisUnitRow so we can
  // exercise the "no-schedule" branch separately from "orphaned-basisId".
  const fixtureBases: AllocationBasis[] = [
    ...bases,
    {
      id: "bas-agenda-noschedule",
      name: "Agenda items — schedule pending",
      source: "Manual", driverKey: "AGENDA", createdAt: NOW,
    },
  ];

  const registry = buildReceiverRegistry(basisUnits, fixtureBases, ctx);
  const graph = buildEngineGraph({
    allocationBases: fixtureBases,
    basisUnits,
    capCenterTotals: centerTotals,
    capCenterSources: centerSources,
    capReceivers: registry.entries,
  });
  const model = computeStepDownGl({
    pools: fixturePools, centerOrder: [centerKey],
    bases: fixtureBases, basisUnits,
    graph,
  });

  // Diagnostic kinds match the unresolved pools, one-to-one.
  const diagsByPool = new Map(model.diagnostics.map((d) => [d.poolId, d]));
  assert.equal(diagsByPool.get("pool-missing")?.kind, "missing-basisId");
  assert.equal(diagsByPool.get("pool-orphan")?.kind, "orphaned-basisId");
  assert.equal(diagsByPool.get("pool-no-schedule")?.kind, "no-schedule");
  assert.equal(diagsByPool.has("pool-good"), false,
    "routable pool never appears in diagnostics");

  // Leakage carries the full eligible $ for each unresolved pool. The
  // good pool contributes nothing to leakage.
  assert.ok(!model.leakageByPoolId["pool-good"],
    "routable pool has no leakage entry");
  assert.ok(model.leakageByPoolId["pool-missing"] >= 70_000 - 0.5,
    "missing-basisId pool leaks at least its full eligible $");
  assert.ok(model.leakageByPoolId["pool-orphan"] >= 50_000 - 0.5,
    "orphaned-basisId pool leaks at least its full eligible $");
  assert.ok(model.leakageByPoolId["pool-no-schedule"] >= 30_000 - 0.5,
    "no-schedule pool leaks at least its full eligible $");

  // The routable pool actually distributed its dollars. Σ across receivers
  // equals its eligible $ (no double-counting, no silent leakage).
  const goodRow = model.alloc2["pool-good"] ?? {};
  const goodTotal = Object.values(goodRow).reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(goodTotal - 100_000) < 1,
    "routable pool's eligible $ fully distributed via its schedule");

  // Conservation: Σ allocated (alloc2) + Σ leakage = Σ pool.amount.
  // No phantom dollars created; no dollars vanish without a diagnostic.
  const sumAllocated = fixturePools.reduce(
    (a, p) => a + Object.values(model.alloc2[p.id] ?? {}).reduce((s, v) => s + v, 0), 0,
  );
  const sumLeakage = Object.values(model.leakageByPoolId).reduce((a, v) => a + v, 0);
  const sumEligible = fixturePools.reduce((a, p) => a + p.amount, 0);
  assert.ok(
    Math.abs(sumAllocated + sumLeakage - sumEligible) < 1,
    `conservation: alloc (${sumAllocated.toFixed(2)}) + leakage (${sumLeakage.toFixed(2)}) ≈ eligible (${sumEligible.toFixed(2)})`,
  );
  console.log("  ✓ engine: unresolved pools leak with matching diagnostic kinds; conservation holds");
}

// ─── 8. Seed/demo routing exercises ONLY catalog paths (no legacy
//        fallback). The LAH seed pools all carry valid basisIds and
//        matching schedules, so the engine routes them cleanly with
//        an empty diagnostics list. ──────────────────────────────────
{
  const seedMaterialized = materializeDirectAsBasisUnits({
    pools: CAP_POOLS, bases: SEED_BASES,
    basisUnits: CAP_BASIS_UNITS, directAllocations: CAP_DIRECT_ALLOCATIONS,
  });
  const seedRegistry = buildReceiverRegistry(
    seedMaterialized.basisUnits, seedMaterialized.bases, DEFAULT_STUDY_CONTEXT,
  );
  const seedGraph = buildEngineGraph({
    allocationBases: seedMaterialized.bases,
    basisUnits: seedMaterialized.basisUnits,
    capCenterTotals: CAP_CENTER_TOTALS,
    capCenterSources: Object.fromEntries(
      Object.entries(CAP_CENTER_SOURCES_SEED).map(([k, v]) => [
        k, { name: v.name, source: "seed" as const },
      ]),
    ),
    capReceivers: seedRegistry.entries,
  });
  const seedModel = computeStepDownGl({
    pools: seedMaterialized.pools,
    centerOrder: Object.keys(CAP_CENTER_TOTALS),
    bases: seedMaterialized.bases,
    basisUnits: seedMaterialized.basisUnits,
    graph: seedGraph,
  });

  assert.deepEqual(seedModel.diagnostics, [],
    "seed: every pool routes via its catalog basisId — no diagnostics");
  assert.deepEqual(seedModel.leakageByPoolId, {},
    "seed: no leakage — fallback removal didn't break demo math");

  // Sanity: at least one direct receiver picked up dollars. The point of
  // this assertion isn't a specific number (the engine fixture covers
  // those) — it's that catalog-only routing actually produces flow.
  const anyAllocated = CAP_POOLS.some((p) =>
    Object.values(seedModel.alloc2[p.id] ?? {}).some((v) => v > 0),
  );
  assert.ok(anyAllocated,
    "seed: catalog-only routing produces non-zero allocations");
  console.log("  ✓ seed routes cleanly with no legacy fallback (LAH bundle)");
}

// ─── 9. Single step-down vs double step-down on the same inputs. ──────
//
// Setup: one indirect center "City Manager" with a single pool whose
// schedule lists both an indirect receiver ("Insurance") and two direct
// receivers (PLAN, BLDG). In double mode, the indirect receiver picks
// up Phase 1 dollars and reallocates in Phase 2; in single mode, the
// indirect receiver is excluded — the driver renormalizes across the
// two direct receivers and the pool's full eligible $ lands on them.
{
  const ctx: StudyContext = { cityId: "test", fiscalYear: "FY 2025-26" };
  const cmKey = "ctr-cmgr";
  const insKey = "ctr-ins";
  const centerTotals: Record<string, number> = { [cmKey]: 100_000, [insKey]: 0 };
  const centerSources: Record<string, { name: string; source: "seed" }> = {
    [cmKey]: { name: "City Manager", source: "seed" },
    [insKey]: { name: "Insurance",   source: "seed" },
  };
  // Single FTE basis with receiver units: 10 (PLAN), 10 (BLDG), 80 (Insurance).
  // Double-mode percent split: 10/100 = 10% PLAN, 10/100 = 10% BLDG, 80% Insurance.
  // Single-mode percent split (Insurance excluded): 10/20 = 50% PLAN, 50% BLDG.
  const fteBasis: AllocationBasis[] = [
    { id: "bas-fte", name: "FY 24/25 FTE", source: "Adopted", driverKey: "FTE", createdAt: NOW },
  ];
  const fteUnits: BasisUnitRow[] = [{
    basisId: "bas-fte",
    basis: "FY 24/25 FTE",
    receivers: [
      { glCode: "011-3100", dept: "Planning",   deptCode: "PLAN",  units: 10 },
      { glCode: "011-3200", dept: "Building",   deptCode: "BLDG",  units: 10 },
      { glCode: insKey,    dept: "Insurance",  deptCode: "INS",   units: 80 },
    ],
  }];
  const pool: CapPool = makePool({
    id: "pool-cm", center: "City Manager", centerGlCode: cmKey,
    pool: "Town-wide Support", amount: 100_000, basisId: "bas-fte",
  });
  const reg = buildReceiverRegistry(fteUnits, fteBasis, ctx);
  const graph = buildEngineGraph({
    allocationBases: fteBasis, basisUnits: fteUnits,
    capCenterTotals: centerTotals, capCenterSources: centerSources,
    capReceivers: reg.entries,
  });

  const doubleModel = computeStepDownGl({
    pools: [pool], centerOrder: [cmKey, insKey],
    bases: fteBasis, basisUnits: fteUnits,
    graph, method: "double",
  });
  const singleModel = computeStepDownGl({
    pools: [pool], centerOrder: [cmKey, insKey],
    bases: fteBasis, basisUnits: fteUnits,
    graph, method: "single",
  });

  // (a) Double mode allocates 80% to the indirect Insurance node — those
  // dollars then redistribute in Phase 2 onto direct receivers.
  const doubleGross = doubleModel.grossAllocation["pool-cm"] ?? {};
  assert.ok(Math.abs((doubleGross[insKey] ?? 0) - 80_000) < 1,
    `double: Insurance gross = ${doubleGross[insKey]?.toFixed(2)} (expect 80000)`);
  assert.ok(Math.abs((doubleGross["011-3100"] ?? 0) - 10_000) < 1,
    "double: PLAN Phase 1 gross = 10000 (10% of 100000)");
  assert.ok(Math.abs((doubleGross["011-3200"] ?? 0) - 10_000) < 1,
    "double: BLDG Phase 1 gross = 10000 (10% of 100000)");

  // (b) Single mode excludes Insurance from the percent denominator —
  // PLAN and BLDG split the full $100K evenly.
  const singleGross = singleModel.grossAllocation["pool-cm"] ?? {};
  assert.ok(Math.abs((singleGross[insKey] ?? 0)) < 0.5,
    `single: Insurance receives $0 (got ${singleGross[insKey]?.toFixed(2)})`);
  assert.ok(Math.abs((singleGross["011-3100"] ?? 0) - 50_000) < 1,
    `single: PLAN gross = ${singleGross["011-3100"]?.toFixed(2)} (expect 50000 — 10/20 of 100000)`);
  assert.ok(Math.abs((singleGross["011-3200"] ?? 0) - 50_000) < 1,
    `single: BLDG gross = ${singleGross["011-3200"]?.toFixed(2)} (expect 50000)`);

  // (c) Single mode never produces a Phase 2 redistribution — every
  // secondAllocation cell is zero.
  for (const v of Object.values(singleModel.secondAllocation["pool-cm"] ?? {})) {
    assert.ok(Math.abs(v) < 0.5, "single: secondAllocation is zero everywhere");
  }

  // (d) Conservation holds in both modes.
  const sumAlloc = (m: typeof doubleModel) => Object.values(m.alloc2["pool-cm"] ?? {})
    .reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(sumAlloc(doubleModel) - 100_000) < 1,
    `double: Σ alloc2 = ${sumAlloc(doubleModel).toFixed(2)} (expect 100000)`);
  assert.ok(Math.abs(sumAlloc(singleModel) - 100_000) < 1,
    `single: Σ alloc2 = ${sumAlloc(singleModel).toFixed(2)} (expect 100000)`);

  // (e) Direct rollup differs by method. In single mode the indirect
  // receiver (Insurance) is excluded so PLAN+BLDG capture the full
  // $100K in one pass. In double mode the test fixture omits an
  // Insurance pool, so the 80K Phase 1 contribution to Insurance has
  // nowhere to redistribute (no own pool) and parks on alloc2[pool-cm]
  // [insKey] — PLAN+BLDG see only the 20K they got in Phase 1. The
  // contrast is the point of the test.
  const directSumDouble = (doubleModel.directTotals["011-3100"] ?? 0)
                         + (doubleModel.directTotals["011-3200"] ?? 0);
  const directSumSingle = (singleModel.directTotals["011-3100"] ?? 0)
                         + (singleModel.directTotals["011-3200"] ?? 0);
  assert.ok(Math.abs(directSumDouble - 20_000) < 1,
    `double: direct rollup = ${directSumDouble.toFixed(2)} (expect ~20000 — the 80K parked at Insurance has no downstream pool to redistribute it)`);
  assert.ok(Math.abs(directSumSingle - 100_000) < 1,
    `single: direct rollup = ${directSumSingle.toFixed(2)} (expect 100000 — Insurance excluded; full pool routes straight to direct receivers)`);

  // (f) No diagnostics or leakage for either method on routable data.
  assert.deepEqual(doubleModel.diagnostics, []);
  assert.deepEqual(singleModel.diagnostics, []);
  assert.deepEqual(doubleModel.leakageByPoolId, {});
  assert.deepEqual(singleModel.leakageByPoolId, {});

  console.log("  ✓ single step-down: indirect receivers excluded; driver renormalized across direct only");
  console.log("  ✓ double step-down: unchanged (regression)");
}

console.log("\nAll capBasisRouting assertions passed.");
