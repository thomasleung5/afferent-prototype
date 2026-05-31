/* Shared xlsx-export helpers fixture.
 *
 * Run with: npm run test:xlsx-helpers
 *
 * Pins the cell-builder contract that the three export files
 * (excel.ts, capExcel.ts, benchmarksExcel.ts) rely on. When the xlsx
 * backend was swapped (SheetJS → write-excel-file in 2026-05) the cell
 * shape changed from `{ v, t, z }` to `{ value, type, format }`; this
 * fixture freezes the new shape so a future backend swap is obvious. */

import assert from "node:assert/strict";
import { h, n } from "../export/xlsx";

// ── h() emits a bold-header cell ────────────────────────────────────────
{
  const cell = h("Department");
  assert.deepEqual(cell, { value: "Department", fontWeight: "bold" });
  console.log("  ✓ h() emits { value, fontWeight: 'bold' }");
}

// ── n() emits a typed, formatted number cell for finite values ──────────
{
  assert.deepEqual(n(123, "$#,##0"),
    { value: 123, type: Number, format: "$#,##0" });
  assert.deepEqual(n(0, "0%"),
    { value: 0,   type: Number, format: "0%" });
  // Negative numbers carry through unchanged — the format string (with
  // its own negative branch) drives the visual rendering.
  assert.deepEqual(n(-50, "$#,##0;[Red]-$#,##0"),
    { value: -50, type: Number, format: "$#,##0;[Red]-$#,##0" });
  console.log("  ✓ n() emits { value, type: Number, format } for finite values");
}

// ── n() collapses non-finite values to "" ───────────────────────────────
//      Matches the old SheetJS behavior — callers can pass through derived
//      values (a / b, etc.) without guarding for NaN / Infinity.
{
  assert.equal(n(NaN, "$#,##0"),       "");
  assert.equal(n(Infinity, "$#,##0"),  "");
  assert.equal(n(-Infinity, "$#,##0"), "");
  console.log("  ✓ n() collapses non-finite values to empty string");
}

console.log("\nAll xlsx helpers assertions passed.");
