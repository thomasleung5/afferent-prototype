/* Upload validator fixture.
 *
 * Run with: npm run test:ai-upload
 *
 * Constructs in-memory multipart Requests against readPdfUpload to
 * verify every rejection path emits the right status + JSON error
 * shape, and the happy path returns the parsed File + base64 payload.
 *
 * Also exercises the generic `readUpload` directly (no PDF / no
 * format-specific assumptions) so future format validators —
 * starting with `readExcelUpload` — have a clear contract to layer
 * on top of.
 *
 * isPdf, hasPdfMagicBytes, hasZipMagicBytes and resolveMaxBytes are
 * exercised directly since they're pure. */

import assert from "node:assert/strict";
import {
  hasPdfMagicBytes, hasZipMagicBytes, isPdf,
  readExcelUpload, readPdfUpload,
} from "../aiUploadValidator";
import { readUpload, resolveMaxBytes } from "../uploadValidator";

/** Build a multipart/form-data Request with the given form fields. */
function makeRequest(form: FormData): Request {
  return new Request("http://localhost/api/ai/parse-x", {
    method: "POST",
    body: form,
  });
}

async function readJsonBody(res: Response): Promise<{ ok: boolean; message?: string }> {
  return res.json() as Promise<{ ok: boolean; message?: string }>;
}

// ── 1. isPdf — pure-function matrix ──────────────────────────────────────
{
  assert.equal(isPdf({ type: "application/pdf" }), true);
  assert.equal(isPdf({ type: "application/pdf", name: "doc.pdf" }), true);
  assert.equal(isPdf({ type: "", name: "doc.pdf" }), true,
    "filename .pdf fallback when no MIME type");
  assert.equal(isPdf({ type: "", name: "doc.PDF" }), true,
    "extension match is case-insensitive");
  assert.equal(isPdf({ type: "application/octet-stream", name: "doc.pdf" }), true,
    "generic octet-stream falls through to filename check (some clients send this)");
  assert.equal(isPdf({ type: "image/png", name: "doc.pdf" }), false,
    "wrong MIME wins even with .pdf extension");
  assert.equal(isPdf({ type: "text/plain" }), false);
  assert.equal(isPdf({ type: "", name: "doc.txt" }), false);
  assert.equal(isPdf({ type: "" }), false,
    "no MIME and no filename → not a PDF");
  console.log("  ✓ isPdf matrix (MIME + filename fallback)");
}

// ── 2. resolveMaxBytes — env override + defaults ─────────────────────────
{
  const original = process.env.MAX_UPLOAD_MB;
  try {
    delete process.env.MAX_UPLOAD_MB;
    assert.equal(resolveMaxBytes(), 20 * 1024 * 1024, "default = 20 MB");

    process.env.MAX_UPLOAD_MB = "5";
    assert.equal(resolveMaxBytes(), 5 * 1024 * 1024, "env override honored");

    process.env.MAX_UPLOAD_MB = "0";
    assert.equal(resolveMaxBytes(), 20 * 1024 * 1024, "zero ignored → default");

    process.env.MAX_UPLOAD_MB = "not-a-number";
    assert.equal(resolveMaxBytes(), 20 * 1024 * 1024, "NaN ignored → default");
  } finally {
    if (original == null) delete process.env.MAX_UPLOAD_MB;
    else process.env.MAX_UPLOAD_MB = original;
  }
  console.log("  ✓ resolveMaxBytes default + env override + invalid-value fallback");
}

// ── 2b. hasPdfMagicBytes — pure-function check ───────────────────────────
{
  // %PDF in hex
  const validPdfPrefix = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]).buffer;
  assert.equal(hasPdfMagicBytes(validPdfPrefix), true);

  const wrong = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer; // ZIP magic
  assert.equal(hasPdfMagicBytes(wrong), false,
    "ZIP magic (DOCX/XLSX/JAR) must not pass the PDF check");

  const tooShort = new Uint8Array([0x25, 0x50]).buffer;
  assert.equal(hasPdfMagicBytes(tooShort), false,
    "buffers shorter than 4 bytes can't be a PDF header");

  assert.equal(hasPdfMagicBytes(new ArrayBuffer(0)), false);
  console.log("  ✓ hasPdfMagicBytes accepts %PDF, rejects junk + short buffers");
}

// ── 2c. hasZipMagicBytes — pure-function check ───────────────────────────
{
  const validZipPrefix = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]).buffer;
  assert.equal(hasZipMagicBytes(validZipPrefix), true);

  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
  assert.equal(hasZipMagicBytes(pdfBytes), false,
    "PDF bytes must not pass the ZIP check (xlsx-shape sniff stays distinct)");

  assert.equal(hasZipMagicBytes(new ArrayBuffer(0)), false);
  assert.equal(
    hasZipMagicBytes(new Uint8Array([0x50, 0x4b]).buffer), false,
    "too-short buffers can't be a ZIP header",
  );
  console.log("  ✓ hasZipMagicBytes accepts PK\\x03\\x04, rejects junk + short buffers");
}

// readPdfUpload assertions need top-level await — wrap in an async
// main() so tsx's CJS transform can execute them.
async function main() {
  // ── GENERIC: readUpload makes no PDF assumptions ──────────────────────
  //   Pins the contract future format-validators (Excel, etc.) layer on
  //   top of. The generic layer accepts any bytes once it has a `file`
  //   field within the size cap and reaches an ArrayBuffer.
  {
    const form = new FormData();
    const file = new File(
      [new Uint8Array([0x01, 0x02, 0x03])],
      "nonsense.bin",
      { type: "application/octet-stream" },
    );
    form.append("file", file);
    form.append("metadata", "hello");
    const result = await readUpload(makeRequest(form));
    assert.ok(!(result instanceof Response),
      "non-PDF bytes must NOT be rejected by the generic helper");
    if (!(result instanceof Response)) {
      assert.equal(result.ok, true);
      assert.equal(result.fileName, "nonsense.bin");
      assert.equal(result.buffer.byteLength, 3,
        "raw bytes preserved for caller-side magic-byte sniffing");
      assert.equal(result.form.get("metadata"), "hello",
        "side fields stay accessible on the returned FormData");
    }
    console.log("  ✓ readUpload accepts arbitrary bytes (no PDF assumptions)");
  }

  // GENERIC: missing file still 400 at the generic layer
  {
    const result = await readUpload(makeRequest(new FormData()));
    assert.ok(result instanceof Response);
    assert.equal((result as Response).status, 400);
    console.log("  ✓ readUpload returns 400 when `file` field is missing");
  }

  // GENERIC: oversize still 413 at the generic layer
  {
    const form = new FormData();
    form.append("file", new File(["1234567890123"], "x.bin"));
    const result = await readUpload(makeRequest(form), { maxBytes: 10 });
    assert.ok(result instanceof Response);
    assert.equal((result as Response).status, 413);
    console.log("  ✓ readUpload returns 413 when file exceeds maxBytes");
  }

  // ── 3. Missing file field → 400 ───────────────────────────────────────
  {
    const form = new FormData();
    const result = await readPdfUpload(makeRequest(form));
    assert.ok(result instanceof Response);
    assert.equal((result as Response).status, 400);
    const body = await readJsonBody(result as Response);
    assert.equal(body.ok, false);
    assert.match(body.message ?? "", /No file/);
    console.log("  ✓ missing file → 400 with clear message");
  }

  // ── 4. Wrong MIME, no .pdf extension → 415 ────────────────────────────
  {
    const form = new FormData();
    const file = new File(["not a pdf"], "doc.txt", { type: "text/plain" });
    form.append("file", file);
    const result = await readPdfUpload(makeRequest(form));
    assert.ok(result instanceof Response);
    assert.equal((result as Response).status, 415);
    const body = await readJsonBody(result as Response);
    assert.match(body.message ?? "", /PDF/);
    console.log("  ✓ wrong MIME → 415");
  }

  // ── 5. .pdf filename fallback when MIME is empty → accept ─────────────
  {
    const form = new FormData();
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "report.pdf");
    form.append("file", file);
    const result = await readPdfUpload(makeRequest(form));
    assert.ok(!(result instanceof Response),
      "fallback should accept .pdf-named files even without MIME");
    if (!(result instanceof Response)) {
      assert.equal(result.ok, true);
      assert.equal(result.fileName, "report.pdf");
      assert.equal(result.fileSizeKb, 0, "4 bytes rounds to 0 KB");
      assert.equal(typeof result.base64, "string");
      assert.ok(result.base64.length > 0);
    }
    console.log("  ✓ .pdf filename fallback accepts upload");
  }

  // ── 6. Oversize file → 413 ────────────────────────────────────────────
  {
    const form = new FormData();
    const file = new File(["12345678901"], "tiny.pdf", { type: "application/pdf" });
    form.append("file", file);
    const result = await readPdfUpload(makeRequest(form), { maxBytes: 10 });
    assert.ok(result instanceof Response);
    assert.equal((result as Response).status, 413);
    const body = await readJsonBody(result as Response);
    assert.match(body.message ?? "", /limit/i);
    console.log("  ✓ oversize file → 413 with size hint");
  }

  // ── 6b. PDF MIME + .pdf extension but bytes aren't PDF → 415 ──────────
  //       Catches a renamed-extension attack: someone uploads a .docx
  //       (ZIP magic) as application/pdf hoping to slip past the MIME
  //       gate. Magic-byte sniff rejects before we burn Anthropic.
  {
    const form = new FormData();
    const file = new File(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff])],
      "fake.pdf",
      { type: "application/pdf" },
    );
    form.append("file", file);
    const result = await readPdfUpload(makeRequest(form));
    assert.ok(result instanceof Response);
    assert.equal((result as Response).status, 415);
    const body = await readJsonBody(result as Response);
    assert.match(body.message ?? "", /valid PDF/);
    console.log("  ✓ wrong magic bytes → 415 (rejects renamed-extension uploads)");
  }

  // ── 7. Happy path → ok payload includes form + base64 + metadata ──────
  {
    const form = new FormData();
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
      "happy.pdf",
      { type: "application/pdf" },
    );
    form.append("file", file);
    form.append("catalog", "[]");
    const result = await readPdfUpload(makeRequest(form));
    assert.ok(!(result instanceof Response));
    if (!(result instanceof Response)) {
      assert.equal(result.ok, true);
      assert.equal(result.fileName, "happy.pdf");
      assert.equal(result.file.size, 5);
      assert.equal(result.form.get("catalog"), "[]",
        "form is returned intact so per-route fields (services catalog) are still accessible");
      assert.equal(result.base64, "JVBERi0=");
    }
    console.log("  ✓ happy path returns form + file + base64");
  }

  // ── 8. Excel placeholder — validator wired but no parser yet ──────────
  //      readExcelUpload is exported so a future Excel-import route can
  //      slot in. Today: confirm it rejects non-xlsx shapes (415) and
  //      accepts a real .xlsx-shaped upload (ZIP magic). No workbook
  //      parsing happens here — the OK payload only carries the raw
  //      buffer for the parser to consume later.
  {
    // PDF bytes routed through the Excel validator → 415
    const pdfForm = new FormData();
    pdfForm.append("file", new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
      "doc.pdf",
      { type: "application/pdf" },
    ));
    const pdfResult = await readExcelUpload(makeRequest(pdfForm));
    assert.ok(pdfResult instanceof Response);
    assert.equal((pdfResult as Response).status, 415);

    // Legacy .xls rejected with a more specific message
    const xlsForm = new FormData();
    xlsForm.append("file", new File(
      ["legacy"],
      "old.xls",
      { type: "application/vnd.ms-excel" },
    ));
    const xlsResult = await readExcelUpload(makeRequest(xlsForm));
    assert.ok(xlsResult instanceof Response);
    assert.equal((xlsResult as Response).status, 415);
    assert.match(
      (await readJsonBody(xlsResult as Response)).message ?? "", /\.xls/,
      "legacy .xls returns a message that names the format",
    );

    // .xlsx-shaped happy path (ZIP magic bytes + xlsx MIME)
    const okForm = new FormData();
    okForm.append("file", new File(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00])],
      "workbook.xlsx",
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    ));
    const okResult = await readExcelUpload(makeRequest(okForm));
    assert.ok(!(okResult instanceof Response));
    if (!(okResult instanceof Response)) {
      assert.equal(okResult.ok, true);
      assert.equal(okResult.fileName, "workbook.xlsx");
      assert.equal(okResult.buffer.byteLength, 7,
        "raw buffer preserved for the future parser");
    }
    console.log("  ✓ readExcelUpload validates xlsx shape without parsing");
  }
}

main().then(() => {
  console.log("\nAll aiUploadValidator assertions passed.");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
