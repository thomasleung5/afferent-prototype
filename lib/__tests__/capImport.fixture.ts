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
  ["missing-basis"],
);
assert.ok(
  issues.some((issue) => issue.lineage.rawCells?.name === "Cash and Investments"),
  "pool reference without an imported basis is flagged",
);
console.log("  ✓ CAP integrity: unresolved pool bases surface without duplicating invalid schedules");

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
// its DirectAllocationRow covers the routing. Modified Operating Expenses
// was already flagged as an invalid schedule, so it is not repeated as
// missing here.
assert.deepEqual(
  issuesWithDirect.map((issue) => issue.lineage.rawCells?.issueKind).sort(),
  [],
  "Pool with a DirectAllocationRow skips schedule-required integrity check",
);
console.log("  ✓ CAP integrity: pools with direct-allocation receivers bypass schedule check");

// ── printedTotal mismatch: parallel-column row shift on Milpitas Exhibit 5 ──
//
// The AI parser occasionally lifts Recreation Administration's FTE value
// (6.00) onto the prior Housing & Neighborhood Svcs row when the PDF text
// layer emits receiver labels and numeric columns as separate text blocks.
// Housing's true Budgeted FTE under that basis is blank, so it should be
// omitted; the resulting receiver sum is 372.92. When the model shifts the
// 6.00 onto Housing, the schedule mistakenly includes Housing and sums to
// 378.92. The printed Grand Total is 372.92 — validation must mark the
// schedule for review while still letting it import (warn-not-fail), so
// the engine has data to work with and the importer UI can flag the gap.

{
  const rowShifted = capBasisUnitsToExtractionResult([
    {
      basis: "Budgeted FTE",
      source: "Exhibit 5",
      printedTotal: 372.92,
      receivers: [
        // Housing's true FTE under Budgeted FTE is blank — including it
        // here at 6.00 is the row-shift bug we want to flag for review.
        { dept: "Housing & Neighborhood Svcs", glCode: "100-410-0", deptCode: "OTHER", units: 6.00, confidence: "high" },
        { dept: "Recreation Administration",   glCode: "100-420-0", deptCode: "PARKS", units: 6.00, confidence: "high" },
        { dept: "Police Administration",       glCode: "100-700-0", deptCode: "PD",    units: 366.92, confidence: "high" },
      ],
    },
  ], fileName);
  assert.equal(rowShifted.mapped.length, 0,
    "row-shifted schedule does not go to mapped (high-confidence)");
  assert.equal(rowShifted.unmapped.length, 0,
    "row-shifted schedule no longer discarded as unmapped");
  assert.equal(rowShifted.lowConfidence.length, 1,
    "row-shifted schedule imports for review (warn-not-fail)");
  const flagged = rowShifted.lowConfidence[0];
  assert.equal(flagged.lineage.rawCells?.issueKind, "schedule-total-mismatch");
  assert.equal(flagged.lineage.rawCells?.basis, "Budgeted FTE");
  assert.equal(flagged.lineage.rawCells?.printedTotal, 372.92);
  const extracted = Number(flagged.lineage.rawCells?.extractedTotal ?? 0);
  assert.ok(Math.abs(extracted - 378.92) < 1e-6,
    "extractedTotal field captures the inflated sum");
  const diff = Number(flagged.lineage.rawCells?.difference ?? 0);
  assert.ok(Math.abs(diff - 6) < 1e-6,
    "difference field captures the row-shift gap");
  assert.equal(flagged.entity.receivers.length, 3,
    "all three receivers survive — the gap is metadata, not a discard signal");
  console.log("  ✓ CAP schedules: row-shift imports for review (warn-not-fail)");
}

{
  const mismatch = capBasisUnitsToExtractionResult([
    {
      basis: "Gross Operating Expenses",
      source: "Exhibit 5",
      printedTotal: 10,
      receivers: [
        { dept: "Planning", glCode: "100-512-0", deptCode: "PLAN", units: 6, confidence: "high" },
      ],
    },
  ], fileName);
  const mismatchIssues = capImportIntegrityIssues(
    bases,
    mismatch,
    pools,
    emptyDirect,
    fileName,
  );
  assert.ok(
    !mismatchIssues.some((issue) =>
      issue.lineage.rawCells?.issueKind === "missing-schedule"
      && issue.lineage.rawCells?.name === "Gross Operating Expenses"),
    "schedule-total-mismatch should not be duplicated as missing-schedule",
  );
  console.log("  ✓ CAP integrity: mismatched schedule is not duplicated as missing");
}

{
  const matching = capBasisUnitsToExtractionResult([
    {
      basis: "Budgeted FTE",
      source: "Exhibit 5",
      printedTotal: 372.92,
      receivers: [
        { dept: "Recreation Administration", glCode: "100-420-0", deptCode: "PARKS", units: 6.00, confidence: "high" },
        { dept: "Police Administration",     glCode: "100-700-0", deptCode: "PD",    units: 366.92, confidence: "high" },
      ],
    },
  ], fileName);
  assert.equal(matching.mapped.length, 1,
    "schedule whose extracted sum matches printedTotal imports normally");
  assert.equal(matching.unmapped.length, 0);
  assert.equal(matching.mapped[0].lineage.rawCells?.printedTotal, 372.92);
  const matchedExtracted = Number(matching.mapped[0].lineage.rawCells?.extractedTotal ?? 0);
  assert.ok(Math.abs(matchedExtracted - 372.92) < 1e-6,
    "extractedTotal stays in lineage on the imported row for traceability");
  console.log("  ✓ CAP schedules: matching extracted sum and printedTotal imports normally");
}

{
  const tolerance = capBasisUnitsToExtractionResult([
    {
      basis: "Budgeted FTE",
      source: "Exhibit 5",
      printedTotal: 372.92,
      receivers: [
        { dept: "Recreation Administration", glCode: "100-420-0", deptCode: "PARKS", units: 6.00, confidence: "high" },
        { dept: "Police Administration",     glCode: "100-700-0", deptCode: "PD",    units: 366.42, confidence: "high" },
      ],
    },
  ], fileName);
  assert.equal(tolerance.mapped.length, 1,
    "tiny rounding gap inside 0.5% tolerance imports normally");
  assert.equal(tolerance.unmapped.length, 0);
  console.log("  ✓ CAP schedules: sub-tolerance rounding differences do not flag");
}

// Schedules without a printedTotal (the document didn't publish one) must
// continue to import normally — the validation is a guard, not a gate.

{
  const noTotal = capBasisUnitsToExtractionResult([
    {
      basis: "Budgeted FTE",
      source: "Exhibit 5",
      receivers: [
        { dept: "Recreation Administration", glCode: "100-420-0", deptCode: "PARKS", units: 6.00, confidence: "high" },
        { dept: "Police Administration",     glCode: "100-700-0", deptCode: "PD",    units: 366.92, confidence: "high" },
      ],
    },
  ], fileName);
  assert.equal(noTotal.mapped.length, 1);
  assert.equal(noTotal.unmapped.length, 0);
  assert.equal(noTotal.mapped[0].lineage.rawCells?.printedTotal, undefined);
  console.log("  ✓ CAP schedules: schedule without printedTotal imports unchanged");
}

console.log("\nAll CAP import assertions passed.");
