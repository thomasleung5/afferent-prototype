/* Upload validator fixture.
 *
 * Run with: npm run test:ai-upload
 *
 * Constructs in-memory multipart Requests against readPdfUpload to
 * verify every rejection path emits the right status + JSON error
 * shape, and the happy path returns the parsed File + base64 payload.
 *
 * isPdf and resolveMaxBytes are exercised directly since they're pure. */

import assert from "node:assert/strict";
import {
  isPdf, readPdfUpload, resolveMaxBytes,
} from "../aiUploadValidator";

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

// readPdfUpload assertions need top-level await — wrap in an async
// main() so tsx's CJS transform can execute them.
async function main() {
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
}

main().then(() => {
  console.log("\nAll aiUploadValidator assertions passed.");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
