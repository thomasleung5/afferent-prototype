/* Route handler for POST /api/import/excel/preview.
 *
 * Deterministic, non-AI Excel preview path. Reads a validated .xlsx
 * upload via `readExcelUpload`, parses it with `previewExcel`, and
 * returns a normalized preview payload. No Anthropic call, no model
 * mutation — analysts use the preview to confirm column mapping
 * before a follow-up task wires the merge step.
 *
 * The transport / auth gates (origin guard, bearer, rate limit, body
 * cap) are applied by `server/index.ts` middleware scoped to
 * /api/import/*, so this handler can assume the request already
 * cleared those checks. */

import { readExcelUpload } from "./aiUploadValidator";
import { previewExcel } from "./excelPreview";
import { jsonError } from "./uploadValidator";
import { logEvent } from "./logger";

export async function handleExcelPreview(req: Request): Promise<Response> {
  const upload = await readExcelUpload(req);
  if (upload instanceof Response) return upload;

  const result = await previewExcel(upload.buffer, upload.fileName);
  if (!result.ok) {
    return jsonError(result.message, result.status);
  }

  // Per-upload shape summary so we can diagnose "this sheet is empty"
  // reports without asking users to share their actual workbook. Logs
  // only counts (not values) — no row content escapes.
  logEvent({
    level: "info",
    msg: "excel preview",
    file: upload.fileName,
    file_kb: upload.fileSizeKb,
    sheets: result.sheets.length,
    sheet_meta: result.sheets.map((s) => `${s.name}:${s.rowCount}x${s.columnCount}`).join("|"),
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
