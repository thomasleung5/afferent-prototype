/* AI-route upload validators — format-specific layer.
 *
 * Composes the generic `readUpload` pipeline (multipart parse, file
 * presence, size cap, ArrayBuffer read) with format checks. Today
 * `readPdfUpload` is the live path that the parse-* routes consume.
 * `readExcelUpload` lives here as an explicit shape for the upcoming
 * Excel-import surface — it validates Excel-shaped uploads without
 * parsing the workbook, so a follow-up task only has to add a route
 * and a parser; the safe-transport story is already in place.
 *
 * Returns a discriminated `{ ok: true, ... }` payload with everything
 * the downstream consumer needs, or a fully-formed JSON Response with
 * the right HTTP status. */

import {
  jsonError, readUpload,
  type UploadOk, type UploadOptions,
} from "./uploadValidator";

// `resolveMaxBytes` is also imported by `server/index.ts` for the Hono
// body-limit middleware. Re-export so the existing import path keeps
// working without changes to index.ts.
export { resolveMaxBytes } from "./uploadValidator";

// ─── PDF ─────────────────────────────────────────────────────────────

export interface PdfUploadOk extends UploadOk {
  /** Base64 encoding of the PDF, ready for the Anthropic SDK's
   *  `document` block. */
  base64: string;
}

export type PdfUploadOptions = UploadOptions;

/** Read + validate a PDF upload from a multipart/form-data request.
 *  Layers the format checks the AI parse routes need on top of the
 *  generic upload pipeline: PDF MIME (with `.pdf` extension fallback),
 *  `%PDF` magic-byte sniff, base64 encoding. */
export async function readPdfUpload(
  req: Request,
  opts: PdfUploadOptions = {},
): Promise<PdfUploadOk | Response> {
  const upload = await readUpload(req, opts);
  if (upload instanceof Response) return upload;

  if (!isPdf(upload.file)) {
    return jsonError("Only PDF uploads are supported.", 415);
  }

  if (!hasPdfMagicBytes(upload.buffer)) {
    return jsonError("File does not appear to be a valid PDF.", 415);
  }

  return {
    ...upload,
    base64: Buffer.from(upload.buffer).toString("base64"),
  };
}

/** PDFs start with the literal bytes `%PDF` (0x25 0x50 0x44 0x46),
 *  followed by a version tag (e.g. `-1.7`). Sniffing the first four
 *  bytes rejects renamed-extension uploads (a .docx renamed to .pdf
 *  with a PDF MIME type) before we burn an Anthropic call. We don't
 *  validate the version — that's the SDK's problem. */
export function hasPdfMagicBytes(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const view = new Uint8Array(buf, 0, 4);
  return view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46;
}

/** True when the file declares itself as a PDF by MIME type, OR (for
 *  clients that don't set content-type) when the filename ends in
 *  `.pdf` case-insensitively. "Unknown" MIME values — absent, empty,
 *  or the generic `application/octet-stream` fallback that some
 *  multipart libraries inject — fall through to the filename check.
 *  We don't sniff magic bytes here; the magic-byte check above is the
 *  authoritative gate. */
export function isPdf(file: { type?: string; name?: string }): boolean {
  if (file.type === "application/pdf") return true;
  const typeUnknown = !file.type || file.type === "application/octet-stream";
  if (typeUnknown && file.name && /\.pdf$/i.test(file.name)) return true;
  return false;
}

// ─── Excel (placeholder for future upload surface) ───────────────────
//
// Future Excel-import routes will consume `readExcelUpload`. The function
// is wired up but intentionally has no caller yet — adding a route and a
// workbook parser is a follow-up task. Implementing it now means the
// transport-layer story (size cap, magic-byte sniff, JSON errors) is
// finalized and reviewed; future PRs only need to add the parser.
//
// Scope of validation here:
//   - .xlsx is a ZIP archive; first four bytes must be `PK\x03\x04`.
//   - .xls (legacy CFB) is intentionally NOT supported — modern fee
//     schedules ship as .xlsx, and `.xls` parsing has historically been
//     the source of the worst Excel-library CVEs. Reject it explicitly.

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_LEGACY_MIME = "application/vnd.ms-excel";

export type ExcelUploadOk = UploadOk;
export type ExcelUploadOptions = UploadOptions;

/** Read + validate an .xlsx upload. Returns the raw buffer — workbook
 *  parsing is left to the future caller. */
export async function readExcelUpload(
  req: Request,
  opts: ExcelUploadOptions = {},
): Promise<ExcelUploadOk | Response> {
  const upload = await readUpload(req, opts);
  if (upload instanceof Response) return upload;

  if (isLegacyXls(upload.file)) {
    return jsonError(
      "Legacy .xls files are not supported. Please re-save as .xlsx.",
      415,
    );
  }

  if (!isXlsx(upload.file)) {
    return jsonError("Only .xlsx uploads are supported.", 415);
  }

  if (!hasZipMagicBytes(upload.buffer)) {
    return jsonError("File does not appear to be a valid .xlsx workbook.", 415);
  }

  return upload;
}

/** .xlsx files are ZIP archives; the first four bytes are the local
 *  file-header signature `PK\x03\x04`. Rejects empty files and files
 *  with a renamed extension whose actual bytes aren't a ZIP. */
export function hasZipMagicBytes(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const view = new Uint8Array(buf, 0, 4);
  return view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04;
}

/** True when the file declares itself as .xlsx by MIME, OR (for clients
 *  that don't set content-type) when the filename ends in `.xlsx`.
 *  Same fallthrough rules as `isPdf` for unknown MIME values. */
function isXlsx(file: { type?: string; name?: string }): boolean {
  if (file.type === XLSX_MIME) return true;
  const typeUnknown = !file.type || file.type === "application/octet-stream";
  if (typeUnknown && file.name && /\.xlsx$/i.test(file.name)) return true;
  return false;
}

/** Detect legacy .xls so we can reject it with a clearer message than
 *  "wrong MIME". Checks the MIME and the filename. */
function isLegacyXls(file: { type?: string; name?: string }): boolean {
  if (file.type === XLS_LEGACY_MIME) return true;
  if (file.name && /\.xls$/i.test(file.name)) return true;
  return false;
}
