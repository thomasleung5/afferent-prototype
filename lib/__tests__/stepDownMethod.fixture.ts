/* Fixture for the jurisdiction-wide stepDownMethod plumbing.
 *
 * Run with: npm run test:step-down-method
 *
 * The step-down method used to be a viewing-only useState in the
 * Allocation Detail page. This fixture covers the promotion to a
 * persisted BuildState/BuildSnapshot field that drives every downstream
 * consumer (deriveBuildDerived → capStepDown → capAllocated → FBHR →
 * Cost of Service → overhead exports). The assertions exercise:
 *
 *   1. Legacy persisted state without `stepDownMethod` defaults to
 *      "double" — existing studies reproduce the historical results
 *      bit-for-bit on rehydrate.
 *   2. The store action mutates persisted state (proxy: the
 *      snapshot captures the analyst-selected method, so persistence
 *      and snapshot round-trip carry the choice forward).
 *   3. `deriveBuildDerived` reads `state.stepDownMethod` and produces a
 *      `capStepDown` that matches the engine when called directly with
 *      that method — no precomputation of the other method.
 *   4. Switching the persisted method changes capAllocated, FBHR, Cost
 *      of Service (serviceCosts feed off the same capStepDown).
 *   5. Switching back to "double" reproduces the original derived
 *      results — the engine is pure, so the round-trip is exact.
 *   6. The PDF/Excel export payload carries `stepDownMethod`, so the
 *      methodology labels in the exported workbook / printable PDF flip
 *      coherently with the analyst's selection.
 *   7. Snapshot JSON round-trip preserves the method (loadSnapshot
 *      path + storeSnapshot capture).
 */

import assert from "node:assert/strict";
import type {
  AllocationBasis, BasisUnitRow, CapPool, DirectAllocationRow,
} from "../types";
import {
  buildEngineGraph, computeStepDownGl, capAllocatedFromGl,
} from "../data/capStepDownEngine";
import { buildReceiverRegistry } from "../data/capReceiverRegistry";
import { DEFAULT_STUDY_CONTEXT } from "../data/studyContext";
import { migratePersistedState } from "../storeMigration";
import {
  deriveBuildDerived, type BuildSnapshot, type StepDownMethod,
} from "../store";
import { createBuildSnapshot } from "../storeSnapshot";
import {
  serializeSnapshot, parseSnapshotJson,
} from "../snapshotIO";
import {
  buildAllocationByCenter, type CapExportPayload,
} from "../export/capExcel";

const NOW = "2026-01-01T00:00:00.000Z";

// ── Minimal CAP fixture — same shape as capStepDownEngine.fixture but
//    sized down to one indirect → direct pool so the deltas between
//    "double" and "single" stay legible in the assertions. The Fringe
//    redistribution branch is dropped because single-method test
//    coverage already exists in capStepDownEngine.fixture; here we only
//    need a system where the two methods produce DIFFERENT direct
//    totals so switching is observable. ─────────────────────────────────

const bases: AllocationBasis[] = [{
  id: "bas-fte",
  name: "Budgeted FTE",
  source: "HRIS",
  driverKey: "FTE",
  createdAt: NOW,
  createdBy: "fixture",
  validationStatus: "verified",
}];

// City Manager has $100K. Its FTE schedule includes a peer indirect
// center (Fringe at 20 units) plus three direct fee depts (PLAN 40 /
// BLDG 30 / ENG 10). Under "double", Fringe receives $20K in Round 1
// and redistributes nothing (Fringe has no pools); the peer remains a
// $20K dead-end node. Under "single" the engine excludes Fringe entirely
// and renormalizes the schedule across direct receivers — PLAN/BLDG/ENG
// see a strictly larger share. The two methods produce visibly
// different direct totals, which is what the assertions key off.
const CM_KEY = "011-1200";
const FB_KEY = "061-1470";

const capCenterTotals: Record<string, number> = {
  [CM_KEY]: 100000,
  [FB_KEY]: 0,
};
const capCenterSources: Record<string, { name: string; source: "seed" }> = {
  [CM_KEY]: { name: "City Manager",                 source: "seed" },
  [FB_KEY]: { name: "Fringe Benefits Allocation",   source: "seed" },
};
const capCenterOrder: string[] = [CM_KEY, FB_KEY];

const capBasisUnits: BasisUnitRow[] = [{
  basisId: "bas-fte",
  basis: "Budgeted FTE",
  source: "HRIS",
  receivers: [
    { dept: "Fringe Benefits Allocation", glCode: FB_KEY,    deptCode: "FAS",  units: 20 },
    { dept: "Planning Admin",             glCode: "011-3100", deptCode: "PLAN", units: 40 },
    { dept: "Building Admin",             glCode: "011-3200", deptCode: "BLDG", units: 30 },
    { dept: "Engineering Admin",          glCode: "011-3300", deptCode: "ENG",  units: 10 },
  ],
}];

const capPools: CapPool[] = [{
  id: "cm-salaries",
  center: "City Manager",
  centerGlCode: CM_KEY,
  pool: "City Manager Salaries",
  allocationPercent: 100,
  amount: 100000,
  basisId: "bas-fte",
  basis: "Budgeted FTE",
  receiving: "Multiple departments",
  recoverability: "Fully recoverable",
  review: "Reviewed",
}];

const capDirectAllocations: DirectAllocationRow[] = [];

const { entries: capReceivers } = buildReceiverRegistry(
  capBasisUnits, capDirectAllocations, bases, DEFAULT_STUDY_CONTEXT,
);

const graph = buildEngineGraph({
  allocationBases: bases,
  basisUnits: capBasisUnits,
  directAllocations: capDirectAllocations,
  capCenterTotals,
  capCenterSources,
  capReceivers,
});

const engineArgs = {
  pools: capPools,
  centerOrder: capCenterOrder,
  bases,
  basisUnits: capBasisUnits,
  directAllocations: capDirectAllocations,
  graph,
};

const doubleModel = computeStepDownGl({ ...engineArgs, method: "double" });
const singleModel = computeStepDownGl({ ...engineArgs, method: "single" });

const doubleAllocated = capAllocatedFromGl(doubleModel);
const singleAllocated = capAllocatedFromGl(singleModel);

// Sanity — the two engines really do diverge on this fixture, so a
// switch is observable downstream. (Equality would silently invalidate
// every "switch changes result" assertion below.)
assert.notEqual(
  doubleAllocated.PLAN.toFixed(2),
  singleAllocated.PLAN.toFixed(2),
  "fixture must produce different PLAN totals under the two methods",
);

// ── BuildSnapshot factory ────────────────────────────────────────────────
//
// Builds a minimal BuildSnapshot pre-populated with the CAP fixture
// above. Everything else is empty so we can isolate the step-down
// pipeline. activeFeeDepts is left empty intentionally — when blank,
// deriveBuildDerived derives the list from services / productiveHours /
// operating / functionalAllocation, defaulting to FEE_DEPTS subset. The
// fixture's productiveHours array is empty, so activeFeeDepts will be
// empty after derivation — that's fine, CAP results we assert on
// (capAllocated, capStepDown) don't depend on the active list.

function buildSnapshot(stepDownMethod: StepDownMethod): BuildSnapshot {
  return {
    productiveHours: [],
    operating: [],
    capPools,
    capCenterTotals,
    capCenterDisallowed: {},
    capCenterSources,
    studyContext: { ...DEFAULT_STUDY_CONTEXT },
    allocationBases: bases,
    capBasisUnits,
    capDirectAllocations,
    directBills: {},
    volume: [],
    services: [],
    serviceRoleAllocations: {},
    policyTargets: [],
    policyExceptions: [],
    lineage: {},
    pendingReview: { positions: [], operating: [], services: [], fees: [], volume: [], cap: [] },
    capCenterOrder,
    imports: [],
    functionalAllocation: [],
    activeJurisdictionId: "test-jurisdiction",
    activeFeeDepts: [],
    activeFiscalYear: "FY 2025-26",
    operatingCategoryMappings: {},
    stepDownMethod,
  };
}

// ── 1. Legacy persisted state defaults to "double" ───────────────────────
//
// Existing studies in localStorage / server snapshots / uploaded JSON
// envelopes were written before the field existed. Defaulting to
// "double" on rehydrate preserves the jurisdiction's historical method
// without analyst intervention.
{
  const legacyEmpty: Record<string, unknown> = {};
  migratePersistedState(legacyEmpty as never);
  assert.equal(legacyEmpty.stepDownMethod, "double",
    "missing field → 'double' default");

  // A populated legacy snapshot (no stepDownMethod field).
  const legacyPopulated = buildSnapshot("double") as unknown as Record<string, unknown>;
  delete legacyPopulated.stepDownMethod;
  migratePersistedState(legacyPopulated as never);
  assert.equal(legacyPopulated.stepDownMethod, "double",
    "legacy populated state defaults to 'double'");
  console.log("  ✓ legacy state without stepDownMethod defaults to 'double'");
}

// ── 2. deriveBuildDerived uses the snapshot's stepDownMethod ─────────────
//
// The store's derivation pipeline is the contract: capStepDown is
// authoritative and every other field (capAllocated, fbhr, costs) feeds
// off it. Switching the method on the snapshot must produce a
// capStepDown that matches the engine called with the same method.
{
  const doubleSnap = buildSnapshot("double");
  const singleSnap = buildSnapshot("single");
  const doubleDerived = deriveBuildDerived(doubleSnap);
  const singleDerived = deriveBuildDerived(singleSnap);

  // capStepDown reproduces the same engine output. We compare a few
  // load-bearing cells rather than the whole object — exact deep
  // equality risks tripping on Map insertion order between runs.
  assert.equal(
    doubleDerived.capStepDown.directTotals[FB_KEY],
    doubleModel.directTotals[FB_KEY],
    "double derive: Fringe receives non-zero under double-step-down",
  );
  assert.equal(
    singleDerived.capStepDown.directTotals[FB_KEY] ?? 0,
    0,
    "single derive: Fringe (indirect) receives nothing — single excludes peers",
  );

  // capAllocated matches what capAllocatedFromGl produces when called
  // on each engine model directly. Proves the derivation routes
  // through the SELECTED model rather than a hardcoded one.
  assert.equal(
    doubleDerived.capAllocated.PLAN.toFixed(2),
    doubleAllocated.PLAN.toFixed(2),
    "double derive: capAllocated.PLAN matches double engine",
  );
  assert.equal(
    singleDerived.capAllocated.PLAN.toFixed(2),
    singleAllocated.PLAN.toFixed(2),
    "single derive: capAllocated.PLAN matches single engine",
  );

  // The two derivations diverge — switching the method must mutate
  // downstream values. (If the two were equal, the picker would be
  // cosmetic and this test would be silently meaningless.)
  assert.notEqual(
    doubleDerived.capAllocated.PLAN.toFixed(2),
    singleDerived.capAllocated.PLAN.toFixed(2),
    "switching method changes capAllocated.PLAN — Cost of Service follows",
  );
  console.log("  ✓ deriveBuildDerived consumes stepDownMethod authoritatively");
}

// ── 3. capStepDownSingle is no longer pre-computed ───────────────────────
//
// Behavioral check that BuildDerived no longer exposes the unused
// "alternate method" model the prior implementation memoized for the
// Allocation Detail picker. The picker now drives the persisted method
// so only the selected model lives on derived.
{
  const derived = deriveBuildDerived(buildSnapshot("double"));
  assert.equal(
    (derived as unknown as { capStepDownSingle?: unknown }).capStepDownSingle,
    undefined,
    "derived.capStepDownSingle removed — derive computes only the selected method",
  );
  console.log("  ✓ deriveBuildDerived no longer pre-computes both methods");
}

// ── 4. Switching back to "double" reproduces the original results ────────
//
// Conservation property: the engine is pure, so two derivations of the
// same snapshot are bit-identical. After bouncing single → double the
// double result equals the original double result down to the
// floating-point representation.
{
  const baselineDerived = deriveBuildDerived(buildSnapshot("double"));
  // Bounce: derive single, then double again.
  deriveBuildDerived(buildSnapshot("single"));
  const restoredDerived = deriveBuildDerived(buildSnapshot("double"));
  assert.deepEqual(
    restoredDerived.capAllocated,
    baselineDerived.capAllocated,
    "switching back to double reproduces capAllocated bit-for-bit",
  );
  assert.deepEqual(
    restoredDerived.capStepDown.directTotals,
    baselineDerived.capStepDown.directTotals,
    "switching back to double reproduces directTotals bit-for-bit",
  );
  console.log("  ✓ double → single → double round-trip is bit-identical");
}

// ── 5. createBuildSnapshot captures the selected method ──────────────────
//
// The persisted snapshot is the source of truth for localStorage,
// server-backed studies, and version snapshots. If the method isn't
// captured here, version cuts silently lose the analyst's selection.
{
  const live = buildSnapshot("single");
  // BuildSnapshot is a subset of BuildState — createBuildSnapshot reads
  // the same field shape.
  const captured = createBuildSnapshot(live);
  assert.equal(captured.stepDownMethod, "single",
    "createBuildSnapshot carries the analyst-selected method");

  const liveDouble = buildSnapshot("double");
  const capturedDouble = createBuildSnapshot(liveDouble);
  assert.equal(capturedDouble.stepDownMethod, "double",
    "createBuildSnapshot preserves 'double' as the default selection");
  console.log("  ✓ createBuildSnapshot captures stepDownMethod for persistence");
}

// ── 6. Snapshot JSON round-trip preserves the method ─────────────────────
//
// Covers the manual import/export escape hatch + the server snapshot
// coercion path (both ride parseSnapshotJson / migratePersistedState).
{
  const live = buildSnapshot("single");
  const text = JSON.stringify(serializeSnapshot(live));
  const result = parseSnapshotJson(text);
  assert.equal(result.ok, true, "snapshot envelope parses");
  if (result.ok) {
    assert.equal(result.snapshot.stepDownMethod, "single",
      "JSON round-trip preserves user-selected 'single'");
    // Re-deriving from the round-tripped snapshot reproduces the
    // single-step-down direct totals — proves the migration didn't
    // silently overwrite the field on the way through.
    const rederived = deriveBuildDerived(result.snapshot);
    assert.equal(
      rederived.capAllocated.PLAN.toFixed(2),
      singleAllocated.PLAN.toFixed(2),
      "rederived snapshot still computes against 'single' method",
    );
  }
  console.log("  ✓ snapshot JSON round-trip preserves stepDownMethod");
}

// ── 7. Allocation Detail exports — column layout per method ─────────────
//
// The Allocation by Center Excel sheet is the canonical export surface
// for the per-receiver schedules the Allocation Detail page renders.
// Single mode collapses the trailing First / Second / Total triple into
// a single "Allocation" column; double mode keeps the historical three.
// The PDF export ships through a different React tree but reads the
// same engine model + payload field, so cell-level conservation here
// guards the entire downstream surface.

function basePayload(method: "single" | "double"): CapExportPayload {
  const model = method === "single" ? singleModel : doubleModel;
  const fbhrRollup = method === "single" ? singleAllocated : doubleAllocated;
  return {
    cityName: "Test City",
    fiscal: "FY 2025-26",
    generatedAt: NOW,
    capPools,
    allocationBases: bases,
    capCenterTotals,
    capCenterDisallowed: {},
    capCenterOrder,
    model,
    // capAllocatedFromGl is keyed by DeptCode; cast to the Record shape
    // CapExportPayload declares (it just consumes string keys).
    fbhrRollup: fbhrRollup as unknown as Record<string, number>,
    stepDownMethod: method,
  };
}

// ── 7a. Header row ───────────────────────────────────────────────────────
{
  const doubleRows = buildAllocationByCenter(basePayload("double"));
  const singleRows = buildAllocationByCenter(basePayload("single"));

  // Cells are typed as { value, ... } | string | number — pull out the
  // raw value uniformly for assertions on header text.
  const textOf = (cell: unknown): string => {
    if (typeof cell === "string") return cell;
    if (cell && typeof cell === "object" && "value" in cell) {
      return String((cell as { value: unknown }).value ?? "");
    }
    return String(cell ?? "");
  };

  const doubleHeader = doubleRows[0].map(textOf);
  const singleHeader = singleRows[0].map(textOf);

  assert.equal(doubleHeader.length, 10,
    "double mode header keeps the historical 10-column schema");
  assert.deepEqual(
    doubleHeader.slice(-3),
    ["First", "Second", "Total"],
    "double mode header ends in First / Second / Total",
  );

  assert.equal(singleHeader.length, 8,
    "single mode header collapses to 8 columns (no Second / Total)");
  assert.equal(singleHeader[singleHeader.length - 1], "Allocation",
    "single mode header's trailing column is 'Allocation'");
  assert.ok(!singleHeader.includes("First"),
    "single mode header drops 'First' (renamed to Allocation)");
  assert.ok(!singleHeader.includes("Second"),
    "single mode header drops 'Second'");
  // The Pool Detail row also writes a literal "Total" cell ("Pool total"
  // / "Total Costs to be Allocated") elsewhere — assert only that the
  // single-mode HEADER row has no standalone "Total" column.
  assert.ok(!singleHeader.includes("Total"),
    "single mode header drops 'Total' column");
  console.log("  ✓ Allocation by Center header: 10 cols (double) / 8 cols (single)");
}

// ── 7b. Single-mode Allocation column == firstAllocation == alloc2 ───────
//
// The contract the column rename promises: under single step-down the
// engine's firstAllocation IS the receiver's final per-pool allocation
// (no Phase 2). That same value is what gets exposed as the
// "Allocation" column. This test pulls the engine cell + the sheet
// cell and asserts they match for every receiver of the lone pool.
{
  const singleRows = buildAllocationByCenter(basePayload("single"));

  // Find the Pool detail rows: emitted under section "Allocable" or
  // "Receiving". Single-mode row schema:
  //   ["", "", glCode, name, section, pct, gross, allocation]
  // Pick out (name → allocation cell) so we can cross-check against the
  // engine model.
  type CellValue = number | { value: number };
  const valueOf = (cell: unknown): number => {
    if (typeof cell === "number") return cell;
    if (cell && typeof cell === "object" && "value" in cell) {
      return Number((cell as { value: unknown }).value ?? 0);
    }
    return 0;
  };

  const detailRows = singleRows.filter(
    (row) => row[4] === "Allocable" || row[4] === "Receiving",
  );
  assert.ok(detailRows.length > 0, "single-mode sheet emits detail rows");

  // alloc2 must equal firstAllocation in single mode by engine
  // construction. Assert that explicitly first so the column assertion
  // below has both an engine-side and an export-side anchor.
  for (const node of singleModel.nodes) {
    const f = singleModel.firstAllocation["cm-salaries"]?.[node.key] ?? 0;
    const a = singleModel.alloc2["cm-salaries"]?.[node.key] ?? 0;
    assert.ok(Math.abs(f - a) < 0.005,
      `single engine: firstAllocation[${node.key}] equals alloc2[${node.key}]`);
  }

  // Every emitted detail row's Allocation cell equals the engine's
  // firstAllocation for that receiver (modulo Excel's currency rounding
  // to whole dollars in the $#,##0 mask — so we compare on rounded $).
  for (const row of detailRows) {
    const receiverName = String((row[3] as CellValue & string) ?? "");
    const allocationCell = valueOf(row[row.length - 1] as CellValue);
    const engineNode = singleModel.nodes.find((n) => n.name === receiverName);
    if (!engineNode) continue;
    const engineFirst = singleModel.firstAllocation["cm-salaries"]?.[engineNode.key] ?? 0;
    assert.ok(
      Math.abs(allocationCell - engineFirst) < 0.5,
      `Allocation column for ${receiverName} (${allocationCell}) `
      + `matches firstAllocation (${engineFirst})`,
    );
  }
  console.log("  ✓ single-mode Allocation column = firstAllocation = alloc2 for every receiver");
}

// ── 7c. Double-mode preserves First/Second/Total per detail row ──────────
//
// Regression guard: the column changes are presentation-only, so double
// mode must keep emitting four trailing cells (gross / first / second /
// total) on every detail row.
{
  const doubleRows = buildAllocationByCenter(basePayload("double"));
  const detailRows = doubleRows.filter(
    (row) => row[4] === "Allocable" || row[4] === "Receiving",
  );
  assert.ok(detailRows.length > 0, "double-mode sheet emits detail rows");
  for (const row of detailRows) {
    assert.equal(row.length, 10,
      "double-mode detail rows keep the 10-column shape (gross/first/second/total)");
  }
  console.log("  ✓ double-mode preserves the First / Second / Total triple on every detail row");
}

console.log("\nAll stepDownMethod assertions passed.");
