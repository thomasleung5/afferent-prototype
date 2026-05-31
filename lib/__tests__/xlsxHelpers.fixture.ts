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
import { buildXlsxBlob, h, n } from "../export/xlsx";

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

// ── buildXlsxBlob() returns a real, non-empty XLSX Blob ─────────────────
//      Regression guard for the v1 bug: write-excel-file's browser entry
//      returns a `{ toBlob, toFile }` writer, NOT a Blob. The first port
//      awaited the writer object and handed it to URL.createObjectURL,
//      which silently produced no download. This assertion catches that
//      regression by verifying we get back a real Blob whose first four
//      bytes are the ZIP local-file-header magic (PK\x03\x04) — every
//      XLSX file starts with that signature.
//
//      Wrapped in an async main() because tsx's default CJS transform
//      doesn't allow top-level await.
async function assertRealXlsxBlob(): Promise<void> {
  const blob = await buildXlsxBlob([
    {
      name: "Sheet1",
      rows: [
        [h("Name"), h("Amount")],
        ["Alpha", n(123, "$#,##0")],
        ["Beta",  n(0.5, "0%")],
      ],
      columnWidths: [20, 12],
    },
  ]);

  assert.ok(blob instanceof Blob,
    "buildXlsxBlob must return a Blob, not the writer object");
  assert.ok(blob.size > 0, "produced Blob must be non-empty");

  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  assert.deepEqual(
    Array.from(head),
    [0x50, 0x4b, 0x03, 0x04],
    "first four bytes must be the ZIP magic (PK\\x03\\x04) — every xlsx is a zip",
  );
  console.log("  ✓ buildXlsxBlob() resolves to a non-empty xlsx Blob (PK magic verified)");
}

assertRealXlsxBlob()
  .then(() => console.log("\nAll xlsx helpers assertions passed."))
  .catch((err) => { console.error(err); process.exit(1); });
