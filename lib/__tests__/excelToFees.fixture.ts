/* excelToFees fixture.
 *
 * Run with: npm run test:excel-to-fees
 *
 * Pins the contract that the Fee Schedule Excel mapping flow relies on:
 * a mapped sheet → ExtractionResult<Service> in the same shape the
 * existing mergeFeeSchedule path consumes, with deterministic
 * (non-AI) lineage carrying the real sheet name and source row number. */

import assert from "node:assert/strict";
import type { Service } from "../types";
import { excelToFeeExtraction, validateFeeMapping } from "../import/excelToFees";
import type { PreviewSheet } from "../import/excelPreview";

function sheet(rows: (string | number | null)[][]): PreviewSheet {
  const columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return {
    name: "Fee Schedule",
    rowCount: rows.length,
    columnCount,
    rows,
  };
}

const existing: Service[] = [];

// ── validateFeeMapping surfaces missing-column errors ───────────────────
{
  const s = sheet([["Name", "Dept", "Fee"], ["Plan", "PLAN", 100]]);
  const errors = validateFeeMapping(s, {
    headerRowIndex: 0,
    nameCol: -1,
    deptCol: 1,
    feeCol: 2,
    unitCol: null,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /name/);
  console.log("  ✓ validateFeeMapping surfaces missing required column");
}

// ── validateFeeMapping flags empty data after header ────────────────────
{
  const s = sheet([["Name", "Dept", "Fee"]]); // header only
  const errors = validateFeeMapping(s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  });
  assert.ok(errors.some((e) => /no data rows/i.test(e)));
  console.log("  ✓ validateFeeMapping flags empty sheets");
}

// ── Happy path: rows → ExtractionResult with Excel lineage ──────────────
{
  const s: PreviewSheet = {
    name: "Sheet1",
    rowCount: 4,
    columnCount: 4,
    rows: [
      ["Service", "Dept", "Fee", "Unit"],
      ["Plan check", "PLAN", 1200, "Each"],
      ["Inspection", "BLDG", "$350", "Inspection"],
      ["Permit", "PLAN", "  2,500.00 ", null],
    ],
  };
  const r = excelToFeeExtraction("fees.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: 3,
  }, existing);

  assert.equal(r.warnings.length, 0);
  assert.equal(r.importedRowCount, 3);
  assert.equal(r.skippedRowCount, 0);
  assert.equal(r.extraction.mapped.length, 3);
  assert.equal(r.extraction.duplicates.length, 0);

  const first = r.extraction.mapped[0];
  assert.equal(first.entity.name, "Plan check");
  assert.equal(first.entity.dept, "PLAN");
  assert.equal(first.entity.fee, 1200);
  assert.equal(first.entity.unitLabel, "Each");
  assert.equal(first.entity.source, "imported");
  assert.equal(first.entity.sourceFile, "fees.xlsx");

  // Lineage: real sheet + real (1-based) source row, not "AI parsed" / index.
  assert.equal(first.lineage.file, "fees.xlsx");
  assert.equal(first.lineage.sheet, "Sheet1");
  assert.equal(first.lineage.row, 2,
    "first data row in a 1-row-header sheet is row 2 in Excel");
  assert.equal(first.lineage.confidence, "high",
    "deterministic path: no low-confidence escape hatch");

  // Currency-formatted strings round-trip to numbers.
  assert.equal(r.extraction.mapped[1].entity.fee, 350);
  assert.equal(r.extraction.mapped[2].entity.fee, 2500);
  console.log("  ✓ rows → ExtractionResult with sheet/row lineage");
}

// ── Validation errors emit warnings + skip the row ──────────────────────
{
  const s: PreviewSheet = {
    name: "Sheet1",
    rowCount: 5,
    columnCount: 3,
    rows: [
      ["Service", "Dept", "Fee"],
      ["", "PLAN", 100],            // missing name → warn
      ["Permit", "UNKNOWN", 200],   // bad dept → warn
      ["Inspection", "BLDG", "n/a"],// bad fee → warn
      ["Plan check", "PLAN", 500],  // good — stays
    ],
  };
  const r = excelToFeeExtraction("messy.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  }, existing);

  assert.equal(r.warnings.length, 3, "three rows flagged");
  assert.deepEqual(
    r.warnings.map((w) => w.row),
    [2, 3, 4],
    "warnings carry the source row number (1-based, header-aware)",
  );
  assert.match(r.warnings[0].reason, /name/i);
  assert.match(r.warnings[1].reason, /department/i);
  assert.match(r.warnings[2].reason, /fee amount/i);
  assert.equal(r.importedRowCount, 1, "only the clean row is imported");
  assert.equal(r.skippedRowCount, 3);
  console.log("  ✓ row-level errors emit warnings + skip the row");
}

// ── Invalid rows ALSO land in extraction.unmapped (persistent review) ───
//      Critical: warnings are session-local; extraction.unmapped is what
//      mergeFeeSchedule pushes into pendingReview.fees so the rows are
//      still discoverable later (e.g., in the Fee Study Excel export's
//      Review Flags sheet). Reason codes use the shared UnmappedRow
//      vocabulary so downstream review surfaces don't need a separate
//      Excel-only code path.
{
  const s: PreviewSheet = {
    name: "Schedule",
    rowCount: 5,
    columnCount: 3,
    rows: [
      ["Service", "Dept", "Fee"],
      ["", "PLAN", 100],            // missing name
      ["Permit", "UNKNOWN", 200],   // ambiguous dept
      ["Inspection", "BLDG", "n/a"],// schema mismatch (fee)
      ["Plan check", "PLAN", 500],  // good
    ],
  };
  const r = excelToFeeExtraction("review.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  }, existing);

  assert.equal(r.extraction.unmapped.length, 3);
  assert.equal(r.extraction.stats.unmapped, 3,
    "stats.unmapped reflects the actual reject count");
  assert.deepEqual(
    r.extraction.unmapped.map((u) => u.reason),
    ["missing-required-field", "ambiguous-dept", "schema-mismatch"],
    "reason codes come from the shared UnmappedRow vocabulary",
  );
  for (const u of r.extraction.unmapped) {
    assert.equal(u.lineage.file, "review.xlsx");
    assert.equal(u.lineage.sheet, "Schedule");
    assert.equal(u.lineage.confidence, "review",
      "rejected rows carry confidence: 'review' so the queue can sort them");
    assert.ok(typeof u.lineage.row === "number" && u.lineage.row >= 2,
      "lineage row is the real 1-based Excel source row");
    assert.ok(u.lineage.rawCells, "rawCells preserved for the review panel drilldown");
    assert.ok(Array.isArray(u.raw) && u.raw.length === 4,
      "raw array carries the per-column source values (name/dept/fee/unit)");
  }
  // Ambiguous-dept row carries the raw "UNKNOWN" string so a reviewer
  // can fix it without re-opening the workbook.
  assert.equal(r.extraction.unmapped[1].lineage.rawCells?.dept, "UNKNOWN");
  console.log("  ✓ invalid rows land in extraction.unmapped with reason codes + lineage");
}

// ── Blank trailing rows are silently dropped (NOT warnings) ─────────────
{
  const s = sheet([
    ["Service", "Dept", "Fee"],
    ["Plan check", "PLAN", 100],
    [null, null, null],
    ["", "", ""],
  ]);
  const r = excelToFeeExtraction("trailing.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  }, existing);
  assert.equal(r.warnings.length, 0, "all-blank rows aren't warnings");
  assert.equal(r.importedRowCount, 1);
  assert.equal(r.skippedRowCount, 2);
  console.log("  ✓ all-blank trailing rows are silently dropped");
}

// ── Existing service by name → duplicate (no new id minted) ─────────────
{
  const existingWithMatch: Service[] = [{
    id: "svc-existing", name: "Plan check", dept: "PLAN",
    volume: 0, hours: 0, cost: 0, fee: 100, peer: 0, target: 100,
    source: "manual",
  }];
  const s = sheet([
    ["Service", "Dept", "Fee"],
    ["Plan check", "PLAN", 250], // matches existing by name → duplicate
  ]);
  const r = excelToFeeExtraction("update.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  }, existingWithMatch);

  assert.equal(r.extraction.duplicates.length, 1);
  assert.equal(r.extraction.mapped.length, 0);
  assert.equal(r.extraction.duplicates[0].entity.id, "svc-existing",
    "existing id is preserved — mergeImportedServices treats this as an update");
  assert.equal(r.extraction.duplicates[0].entity.fee, 250);
  console.log("  ✓ name match routes the row to duplicates with the existing id");
}

console.log("\nAll excelToFees assertions passed.");
