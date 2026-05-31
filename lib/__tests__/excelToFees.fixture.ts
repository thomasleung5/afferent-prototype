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
import { autoMapFees, excelToFeeExtraction, validateFeeMapping } from "../import/excelToFees";
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

// ── Full department names normalize to fee-dept codes ──────────────────
{
  const s: PreviewSheet = {
    name: "data",
    rowCount: 4,
    columnCount: 5,
    rows: [
      ["name", "dept", "unit", "fee", "confidence"],
      ["Administrative Use Permit", "Planning", "application", 4500, 0.99],
      ["Design Review", "Planning", "application", 8500, 0.99],
      ["Residential Building Permit", "Building", "permit", 350, 0.99],
    ],
  };
  const r = excelToFeeExtraction("fees_import.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 3, unitCol: 2,
  }, existing);

  assert.equal(r.warnings.length, 0);
  assert.equal(r.importedRowCount, 3);
  assert.deepEqual(
    r.extraction.mapped.map((row) => row.entity.dept),
    ["PLAN", "PLAN", "BLDG"],
  );
  console.log("  ✓ full department names normalize to fee-dept codes");
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

// ── Defensive: empty sheet (rowCount 0, no rows) ────────────────────────
//      validateFeeMapping should surface a clear "no rows" error rather
//      than letting downstream code crash on indexing.
{
  const s: PreviewSheet = { name: "Empty", rowCount: 0, columnCount: 0, rows: [] };
  const errors = validateFeeMapping(s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  });
  assert.ok(errors.some((e) => /empty/i.test(e)),
    "empty sheet → friendly error pointing at the sheet dropdown");

  // The extraction call must not throw — returns an empty, well-formed result.
  const r = excelToFeeExtraction("empty.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  }, existing);
  assert.equal(r.importedRowCount, 0);
  assert.equal(r.extraction.mapped.length, 0);
  assert.equal(r.extraction.unmapped.length, 0);
  console.log("  ✓ empty sheet: validateFeeMapping flags it, extraction returns empty without crashing");
}

// ── Defensive: header row beyond the sheet's rows ───────────────────────
{
  const s = sheet([
    ["Service", "Dept", "Fee"],
    ["Plan check", "PLAN", 100],
  ]);
  // Sheet only has 2 rows; user asked for header row 10.
  const errors = validateFeeMapping(s, {
    headerRowIndex: 9, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  });
  assert.ok(errors.some((e) => /Header row 10 is outside/.test(e)),
    "out-of-range header row → clear error pointing at the offending value");

  // Extraction still runs without throwing — yields nothing.
  const r = excelToFeeExtraction("oob.xlsx", s, {
    headerRowIndex: 9, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  }, existing);
  assert.equal(r.importedRowCount, 0);
  console.log("  ✓ header row beyond available rows: clear error, no crash");
}

// ── Defensive: selected column beyond row width ─────────────────────────
{
  const s = sheet([
    ["Service", "Dept", "Fee"],     // 3 columns
    ["Plan check", "PLAN", 100],
  ]);
  const errors = validateFeeMapping(s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 99, unitCol: null,
  });
  assert.ok(
    errors.some((e) => /outside the sheet's 3 columns/.test(e)),
    "out-of-range column index → clear error naming the bound",
  );

  // Even if the mapping says feeCol=99, extraction tolerates it: the
  // out-of-range cell reads as undefined → fee can't be parsed →
  // row routes to extraction.unmapped (schema-mismatch). No crash.
  const r = excelToFeeExtraction("widecol.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 99, unitCol: null,
  }, existing);
  assert.equal(r.extraction.mapped.length, 0);
  assert.equal(r.extraction.unmapped.length, 1);
  assert.equal(r.extraction.unmapped[0].reason, "schema-mismatch");
  console.log("  ✓ column index beyond row width: routes to unmapped, no crash");
}

// ── Defensive: malformed sheet shape (rows missing) ─────────────────────
//      The PreviewSheet type marks `rows` as required, but a malformed
//      preview payload could in principle deliver it as undefined. Pure
//      helpers must surface this as a mapping error rather than a
//      "sheet.rows[…] is undefined" crash.
{
  const broken = {
    name: "Broken", rowCount: 5, columnCount: 3,
    // Simulate a malformed payload — `rows` was the field that crashed
    // in the field-rename incident.
    rows: undefined,
  } as unknown as PreviewSheet;

  const errors = validateFeeMapping(broken, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  });
  assert.ok(errors.length > 0, "malformed rows: validateFeeMapping returns errors");

  // Extraction must not throw.
  const r = excelToFeeExtraction("broken.xlsx", broken, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  }, existing);
  assert.equal(r.importedRowCount, 0);
  assert.equal(r.skippedRowCount, 0);
  console.log("  ✓ malformed sheet (rows undefined): errors surfaced, no crash");
}

// ── Sanity: a valid sheet still maps after the defenses are in place ────
{
  const s = sheet([
    ["Service", "Dept", "Fee"],
    ["Plan check", "PLAN", 100],
    ["Inspection", "BLDG", 250],
  ]);
  const r = excelToFeeExtraction("ok.xlsx", s, {
    headerRowIndex: 0, nameCol: 0, deptCol: 1, feeCol: 2, unitCol: null,
  }, existing);
  assert.equal(r.importedRowCount, 2);
  assert.equal(r.extraction.unmapped.length, 0);
  console.log("  ✓ defenses don't regress the happy path");
}

// ─── autoMapFees ────────────────────────────────────────────────────────

// Exact canonical headers — name / dept / unit / fee — match in any order.
{
  const s = sheet([
    ["name", "dept", "unit", "fee"],
    ["Plan check", "PLAN", "Each", 100],
  ]);
  const auto = autoMapFees(s);
  assert.equal(auto.headerRowIndex, 0);
  assert.equal(auto.nameCol, 0);
  assert.equal(auto.deptCol, 1);
  assert.equal(auto.unitCol, 2);
  assert.equal(auto.feeCol, 3);
  assert.deepEqual(auto.detected, { name: true, dept: true, fee: true, unit: true });
  console.log("  ✓ autoMapFees: exact canonical headers");
}

// Synonyms — Service / Department / Basis / Adopted Fee — all resolve.
{
  const s = sheet([
    ["Service Name", "Department", "Basis", "Adopted Fee"],
    ["Inspection", "BLDG", "Each", 350],
  ]);
  const auto = autoMapFees(s);
  assert.equal(auto.nameCol, 0);
  assert.equal(auto.deptCol, 1);
  assert.equal(auto.unitCol, 2);
  assert.equal(auto.feeCol, 3);
  assert.deepEqual(auto.detected, { name: true, dept: true, fee: true, unit: true });
  console.log("  ✓ autoMapFees: synonyms (Service, Department, Basis, Adopted Fee)");
}

// Case + whitespace tolerance — including punctuation that normalizes
// to whitespace (`Fee / Service Name`, `FEE_ITEM`, `Service-Name`).
{
  const s = sheet([
    ["  NAME  ", "Dept", "  Pricing Unit  ", "FEE"],
    ["Plan check", "Planning", "Each", 100],
  ]);
  const auto = autoMapFees(s);
  assert.equal(auto.nameCol, 0);
  assert.equal(auto.deptCol, 1);
  assert.equal(auto.unitCol, 2);
  assert.equal(auto.feeCol, 3);
  console.log("  ✓ autoMapFees: case + whitespace tolerance");
}

// Punctuation normalizes to whitespace.
{
  const s = sheet([
    ["Fee/Service Name", "Department", "Fee Basis", "Current Fee"],
    ["Plan check", "Planning", "Each", 100],
  ]);
  const auto = autoMapFees(s);
  assert.equal(auto.nameCol, 0, '"Fee/Service Name" → name');
  assert.equal(auto.deptCol, 1);
  assert.equal(auto.unitCol, 2, '"Fee Basis" → unit');
  assert.equal(auto.feeCol, 3, '"Current Fee" → fee');
  console.log("  ✓ autoMapFees: punctuation normalized to whitespace");
}

// Missing required column — fee absent, only name + dept + unit present.
// detected.fee is false; feeCol stays at -1 so the UI can prompt.
{
  const s = sheet([
    ["Name", "Dept", "Unit", "Notes"],
    ["Plan check", "PLAN", "Each", "—"],
  ]);
  const auto = autoMapFees(s);
  assert.equal(auto.feeCol, -1);
  assert.equal(auto.detected.fee, false);
  assert.equal(auto.detected.name, true);
  assert.equal(auto.detected.dept, true);
  assert.equal(auto.detected.unit, true);
  console.log("  ✓ autoMapFees: missing required column reported via detected flag");
}

// Header row not first — common with cover/title rows at the top.
// Picks the row with the most recognized headers (here, row 3).
{
  const s = sheet([
    ["Adopted Fee Schedule"],                    // row 1 (idx 0) — title
    [],                                          // row 2 (idx 1) — blank
    ["name", "dept", "unit", "fee"],             // row 3 (idx 2) — headers
    ["Plan check", "PLAN", "Each", 100],         // row 4 (idx 3) — data
  ]);
  const auto = autoMapFees(s);
  assert.equal(auto.headerRowIndex, 2,
    "header row scan picks the row with the most recognized columns");
  assert.equal(auto.nameCol, 0);
  assert.equal(auto.feeCol, 3);
  console.log("  ✓ autoMapFees: header row not first (scans for max-match)");
}

// Robustness: empty sheet returns the zeroed mapping (no crash).
{
  const s: PreviewSheet = { name: "Empty", rowCount: 0, columnCount: 0, rows: [] };
  const auto = autoMapFees(s);
  assert.equal(auto.headerRowIndex, 0);
  assert.deepEqual(auto.detected, { name: false, dept: false, fee: false, unit: false });
  console.log("  ✓ autoMapFees: empty sheet → safe defaults");
}

console.log("\nAll excelToFees assertions passed.");
