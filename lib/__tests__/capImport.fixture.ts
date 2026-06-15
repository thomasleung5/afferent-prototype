import assert from "node:assert/strict";
import {
  capBasesToExtractionResult,
  capBasisUnitsToExtractionResult,
  capDirectAllocationsToExtractionResult,
  capImportIntegrityIssues,
  capPoolsToExtractionResult,
} from "../ai/parseCap";

const fileName = "milpitas-cap.pdf";

// ── Bases: unknown driverKey accepted; default to "OTHER" ─────────────────
//
// The model used to be required to classify every basis under one of ~22
// hardcoded keys; novel categories were rejected as "schema-mismatch".
// Post-refactor: any named basis imports. Unknown classifications default
// to "OTHER" — driverKey is legacy metadata only, the engine routes
// purely off the basis schedule.

const bases = capBasesToExtractionResult([
  {
    name: "Gross Operating Expenses",
    source: "Exhibit 5",
    driverKey: "EXPEND",
    confidence: "high",
  },
  {
    name: "Modified Operating Expenses",
    source: "Exhibit 5",
    driverKey: "EXPEND_X",
    confidence: "high",
  },
  {
    name: "City Manager Service Areas",
    source: "Exhibit 5",
    driverKey: "EXPEND",
    confidence: "high",
  },
  {
    name: "Custom-Made Affinity Index",
    source: "Internal ledger",
    driverKey: "ZIRP_BUDGETED",
    confidence: "high",
  },
], fileName);

assert.equal(bases.mapped.length, 4,
  "All four bases import, including the novel-category one");
assert.equal(bases.unmapped.length, 0,
  "Unknown basis categories no longer surface as schema-mismatch");
assert.deepEqual(
  bases.mapped.map((row) => row.entity.driverKey),
  ["EXPEND", "EXPEND", "OTHER", "OTHER"],
  "Recognized keys stick; unknown categories fall back to OTHER",
);
console.log("  ✓ CAP bases: custom basis with unrecognized category imports as OTHER");

const importedBases = bases.mapped.map((row) => row.entity);

// ── Basis units: regression cover for valid + invalid schedules ──────────

const basisUnits = capBasisUnitsToExtractionResult([
  {
    basis: "Gross Operating Expenses",
    source: "Exhibit 5",
    receivers: [
      {
        dept: "Planning",
        glCode: "100-512-0",
        deptCode: "PLAN",
        units: 2_030_145,
        confidence: "high",
      },
    ],
  },
  {
    basis: "City Manager Service Areas",
    source: "Exhibit 5",
    receivers: [
      {
        dept: "Police Administration",
        glCode: "100-700-0",
        deptCode: "PD",
        units: 65,
        confidence: "high",
      },
    ],
  },
  {
    basis: "Modified Operating Expenses",
    source: "Exhibit 5",
    receivers: [
      {
        dept: "Missing identity",
        glCode: "",
        units: 100,
        confidence: "low",
      },
    ],
  },
], fileName);

assert.equal(basisUnits.mapped.length, 2);
assert.equal(basisUnits.unmapped.length, 1);
assert.equal(basisUnits.unmapped[0].lineage.rawCells?.issueKind, "invalid-schedule");
console.log("  ✓ CAP schedules: composite codes import and empty-valid-receiver schedules flag");

// ── Pools: 4 pools, one of them referencing an unknown basis ─────────────

const pools = capPoolsToExtractionResult([
  {
    center: "City Manager",
    pool: "General Service",
    allocationPercent: 33,
    amount: 736_979,
    basis: "Gross Operating Expenses",
    confidence: "high",
  },
  {
    center: "City Attorney",
    pool: "General Service",
    allocationPercent: 100,
    amount: 940_381,
    basis: "Modified Operating Expenses",
    confidence: "high",
  },
  {
    center: "City Manager",
    pool: "Public Safety",
    allocationPercent: 34,
    amount: 289_479,
    basis: "City Manager Service Areas",
    confidence: "high",
  },
  {
    center: "Finance",
    pool: "Treasury",
    allocationPercent: 10,
    amount: 174_000,
    basis: "Cash and Investments",
    confidence: "high",
  },
], fileName, importedBases);

assert.ok(pools.mapped.slice(0, 3).every((row) => row.entity.basisId));
assert.equal(pools.mapped[3].entity.basisId, "");

// ── Direct allocations: empty section, so integrity check sees no pools as direct.

const emptyDirect = capDirectAllocationsToExtractionResult([], pools, fileName);

const issues = capImportIntegrityIssues(bases, basisUnits, pools, emptyDirect, fileName);
assert.deepEqual(
  issues.map((issue) => issue.lineage.rawCells?.issueKind).sort(),
  ["missing-basis", "missing-schedule"],
);
assert.ok(
  issues.some((issue) => issue.lineage.rawCells?.name === "Modified Operating Expenses"),
  "accepted basis without a valid schedule is flagged",
);
assert.ok(
  issues.some((issue) => issue.lineage.rawCells?.name === "Cash and Investments"),
  "pool reference without an imported basis is flagged",
);
console.log("  ✓ CAP integrity: unresolved pool bases and missing schedules surface for review");

// ── Direct allocations: pool with explicit per-receiver percents is skipped
//    by the integrity check (no schedule required — it'll be converted to
//    a synthetic basis at merge time). ─────────────────────────────────────

const lawEnforcementPool = pools.mapped[3].entity;
const directAllocations = capDirectAllocationsToExtractionResult([
  {
    pool: lawEnforcementPool.pool,
    center: lawEnforcementPool.center,
    receivers: [
      {
        dept: "County Sheriff",
        glCode: "100-700-0",
        deptCode: "OTHER",
        percent: 100,
        confidence: "high",
      },
    ],
  },
], pools, fileName);
assert.equal(directAllocations.mapped.length, 1);
assert.equal(directAllocations.mapped[0].entity.poolId, lawEnforcementPool.id);

const issuesWithDirect = capImportIntegrityIssues(
  bases, basisUnits, pools, directAllocations, fileName,
);
// The Treasury / Cash and Investments pool is no longer flagged because
// its DirectAllocationRow covers the routing. The Modified Operating
// Expenses no-schedule issue still fires for the City Attorney pool.
assert.deepEqual(
  issuesWithDirect.map((issue) => issue.lineage.rawCells?.issueKind).sort(),
  ["missing-schedule"],
  "Pool with a DirectAllocationRow skips schedule-required integrity check",
);
console.log("  ✓ CAP integrity: pools with direct-allocation receivers bypass schedule check");

console.log("\nAll CAP import assertions passed.");
