import assert from "node:assert/strict";
import {
  capBasesToExtractionResult,
  capBasisUnitsToExtractionResult,
  capImportIntegrityIssues,
  capPoolsToExtractionResult,
} from "../ai/parseCap";

const fileName = "milpitas-cap.pdf";

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
    driverKey: "EXPEND",
    confidence: "high",
  },
  {
    name: "City Manager Service Areas",
    source: "Exhibit 5",
    driverKey: "OTHER",
    confidence: "high",
  },
], fileName);

assert.equal(bases.mapped.length, 3);
assert.equal(bases.unmapped.length, 0);
assert.deepEqual(
  bases.mapped.map((row) => row.entity.driverKey),
  ["EXPEND", "EXPEND", "OTHER"],
  "multiple bases may share a driverKey and custom OTHER bases remain importable",
);
console.log("  ✓ CAP bases: duplicate EXPEND classifications + OTHER custom basis import");

const importedBases = bases.mapped.map((row) => row.entity);
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

const issues = capImportIntegrityIssues(bases, basisUnits, pools, fileName);
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

console.log("\nAll CAP import assertions passed.");
