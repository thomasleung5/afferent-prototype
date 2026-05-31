/* Excel preview-endpoint fixture.
 *
 * Run with: npm run test:excel-preview
 *
 * Exercises the deterministic /api/import/excel/preview path end-to-end
 * from in-memory Requests. The route handler (handleExcelPreview) and
 * the pure preview/cap logic (previewExcel) are tested separately so
 * cap rejection paths can be driven without baking giant workbooks.
 *
 * Real .xlsx bytes for the happy + format-rejection paths are produced
 * with write-excel-file/node — already a prod dependency for the export
 * side of the app. */

import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import { handleExcelPreview } from "../excelImport";
import { previewExcel } from "../excelPreview";

interface ReadBody { ok: boolean; message?: string; sheets?: unknown[]; fileName?: string }

async function readJsonBody(res: Response): Promise<ReadBody> {
  return res.json() as Promise<ReadBody>;
}

function makeRequest(form: FormData): Request {
  return new Request("http://localhost/api/import/excel/preview", {
    method: "POST",
    body: form,
  });
}

/** Build a real .xlsx workbook ArrayBuffer with the given sheets. */
async function makeXlsx(
  sheets: { name: string; rows: (string | number | null)[][] }[],
): Promise<ArrayBuffer> {
  const writer = writeXlsxFile(
    sheets.map((s) => ({
      sheet: s.name,
      data: s.rows.map((r) => r.map((c) => (c == null ? null : { value: c }))),
    })),
    // The node writer expects a file path or buffer-mode call; calling
    // without options returns the writer object whose .toBuffer() yields
    // the bytes.
  ) as unknown as { toBuffer: () => Promise<Buffer> };
  const buf = await writer.toBuffer();
  // Buffer.buffer types as ArrayBuffer | SharedArrayBuffer; copy into a
  // fresh Uint8Array so TS sees a plain ArrayBuffer.
  return new Uint8Array(buf).buffer;
}

async function main(): Promise<void> {
  // ── 1. Happy path: real .xlsx → preview payload ────────────────────────
  {
    const buf = await makeXlsx([
      { name: "Fees", rows: [
        ["Service", "Dept", "Fee"],
        ["Plan check", "PLAN", 1200],
        ["Inspection",  "BLDG", 350],
      ] },
      { name: "Notes", rows: [
        ["Note"],
        ["Effective Jul 1"],
      ] },
    ]);
    const form = new FormData();
    form.append("file", new File(
      [new Uint8Array(buf)],
      "workbook.xlsx",
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    ));
    const res = await handleExcelPreview(makeRequest(form));
    assert.equal(res.status, 200);
    const body = await readJsonBody(res);
    assert.equal(body.ok, true);
    assert.equal(body.fileName, "workbook.xlsx");
    assert.ok(Array.isArray(body.sheets));
    assert.equal(body.sheets!.length, 2);
    const s0 = body.sheets![0] as { name: string; rowCount: number; columnCount: number; rows: unknown[][] };
    assert.equal(s0.name, "Fees");
    assert.equal(s0.rowCount, 3);
    assert.equal(s0.columnCount, 3);
    assert.deepEqual(s0.rows[0], ["Service", "Dept", "Fee"]);
    assert.deepEqual(s0.rows[1], ["Plan check", "PLAN", 1200]);
    console.log("  ✓ valid .xlsx upload returns preview");
  }

  // ── 2. Missing file → 400 ──────────────────────────────────────────────
  {
    const res = await handleExcelPreview(makeRequest(new FormData()));
    assert.equal(res.status, 400);
    const body = await readJsonBody(res);
    assert.equal(body.ok, false);
    assert.match(body.message ?? "", /No file/);
    console.log("  ✓ missing file → 400");
  }

  // ── 3. Wrong type (PDF bytes uploaded as xlsx route) → 415 ─────────────
  {
    const form = new FormData();
    form.append("file", new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
      "doc.pdf",
      { type: "application/pdf" },
    ));
    const res = await handleExcelPreview(makeRequest(form));
    assert.equal(res.status, 415);
    const body = await readJsonBody(res);
    assert.equal(body.ok, false);
    assert.match(body.message ?? "", /\.xlsx/);
    console.log("  ✓ wrong type → 415");
  }

  // ── 4. Legacy .xls → 415 with a specific message ───────────────────────
  {
    const form = new FormData();
    form.append("file", new File(
      ["legacy"],
      "old.xls",
      { type: "application/vnd.ms-excel" },
    ));
    const res = await handleExcelPreview(makeRequest(form));
    assert.equal(res.status, 415);
    const body = await readJsonBody(res);
    assert.match(body.message ?? "", /\.xls/);
    console.log("  ✓ .xls rejected → 415 with format-specific message");
  }

  // ── 5. Corrupt .xlsx (ZIP magic but not a real workbook) → 415 ─────────
  //      Magic-byte gate passes, but read-excel-file throws when the
  //      inside isn't a workbook. The route surfaces a clear 415.
  {
    // Minimum ZIP local file header followed by junk — passes the magic
    // sniff but isn't a real .xlsx archive.
    const fakeZip = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
      ...new Array(40).fill(0),
    ]);
    const form = new FormData();
    form.append("file", new File(
      [fakeZip],
      "fake.xlsx",
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    ));
    const res = await handleExcelPreview(makeRequest(form));
    assert.equal(res.status, 415);
    const body = await readJsonBody(res);
    assert.match(body.message ?? "", /corrupt|valid \.xlsx/i);
    console.log("  ✓ ZIP-shaped but non-workbook → 415");
  }

  // ── 6. Cap rejection (rows) — call previewExcel directly with a tight cap
  {
    const buf = await makeXlsx([
      { name: "Big", rows: Array.from({ length: 10 }, (_, i) => [`row-${i}`]) },
    ]);
    const result = await previewExcel(
      buf,
      "big.xlsx",
      {
        maxSheets: 25,
        maxRowsPerSheet: 5,
        maxColumnsPerRow: 100,
        maxTotalCells: 200_000,
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 413);
      assert.match(result.message, /rows/);
    }
    console.log("  ✓ too-many-rows → 413");
  }

  // ── 7. Cap rejection (total cells) — wider sheet ───────────────────────
  {
    const buf = await makeXlsx([
      { name: "Wide", rows: Array.from(
        { length: 10 },
        () => Array.from({ length: 10 }, (_, c) => c),
      ) },
    ]);
    const result = await previewExcel(
      buf,
      "wide.xlsx",
      {
        maxSheets: 25,
        maxRowsPerSheet: 5000,
        maxColumnsPerRow: 100,
        maxTotalCells: 50,
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 413);
      assert.match(result.message, /cell/);
    }
    console.log("  ✓ too-many-cells → 413");
  }

  // ── 8. Blank workbook (all sheets empty) → 422 ─────────────────────────
  {
    const buf = await makeXlsx([
      { name: "Empty", rows: [] },
    ]);
    const result = await previewExcel(
      buf,
      "blank.xlsx",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 422);
      assert.match(result.message, /no usable sheets/i);
    }
    console.log("  ✓ blank workbook → 422 with clear message");
  }
}

main()
  .then(() => console.log("\nAll excelPreview assertions passed."))
  .catch((err) => { console.error(err); process.exit(1); });
