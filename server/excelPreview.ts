/* Server-side Excel preview.
 *
 * Reads a validated .xlsx upload and returns a normalized preview of
 * each sheet — enough for an analyst to confirm column mapping before
 * we merge anything into the model. Parsing is intentionally
 * deterministic (no AI in this path); the route lives at
 * /api/import/excel/preview, separately from /api/ai/* so the routing
 * + audit trail tells the story without comments.
 *
 * Caps below run AFTER read-excel-file finishes parsing, since the
 * library doesn't expose a streaming abort. Defence in depth instead
 * comes from the upstream gates: MAX_UPLOAD_MB body cap (default
 * 20 MB) on the compressed bytes and the ZIP magic-byte sniff in
 * `readExcelUpload`. Future task: streaming parser if we see real
 * adversarial inputs.
 *
 * Cell normalization keeps the wire format narrow — string | number |
 * boolean | null. Dates collapse to ISO strings, undefined collapses
 * to null. The client doesn't have to know about Date objects, and
 * the JSON payload survives round-trips. */

import readXlsxFile from "read-excel-file/node";
import type { CellValue } from "read-excel-file/node";

export interface PreviewLimits {
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerRow: number;
  maxTotalCells: number;
}

const DEFAULT_PREVIEW_LIMITS: PreviewLimits = {
  maxSheets: 25,
  maxRowsPerSheet: 5000,
  maxColumnsPerRow: 100,
  maxTotalCells: 200_000,
};

export type PreviewCell = string | number | boolean | null;

export interface PreviewSheet {
  name: string;
  /** Total rows parsed from the source. */
  rowCount: number;
  /** Max column count across all rows in the source. */
  columnCount: number;
  /** All parsed rows, normalized. The full set is returned so the same
   *  payload powers both the mapping UI (typically displays the first
   *  ~50 rows) and the downstream merge step (consumes every row).
   *  Bounded by `maxTotalCells` — pathological workbooks are rejected
   *  before reaching the response. */
  rows: PreviewCell[][];
}

export interface PreviewOk {
  ok: true;
  fileName: string;
  sheets: PreviewSheet[];
}

export interface PreviewFail {
  ok: false;
  status: number;
  message: string;
}

export type PreviewResult = PreviewOk | PreviewFail;

/** Parse an .xlsx workbook buffer and return a preview, or a typed
 *  failure with the HTTP status the route should emit. */
export async function previewExcel(
  buffer: ArrayBuffer,
  fileName: string,
  limits: PreviewLimits = DEFAULT_PREVIEW_LIMITS,
): Promise<PreviewResult> {
  let sheets: { sheet: string; data: (CellValue | null)[][] }[];
  try {
    // The library accepts a Node Buffer; wrap the ArrayBuffer. The
    // default call shape (no `sheet` arg) returns every sheet.
    const result = await readXlsxFile(Buffer.from(buffer));
    sheets = result as unknown as { sheet: string; data: (CellValue | null)[][] }[];
  } catch {
    return { ok: false, status: 415, message: "Could not parse workbook. The file may be corrupt or not a valid .xlsx." };
  }

  if (sheets.length === 0) {
    return { ok: false, status: 422, message: "Workbook has no sheets." };
  }
  if (sheets.length > limits.maxSheets) {
    return {
      ok: false, status: 413,
      message: `Workbook has ${sheets.length} sheets; limit is ${limits.maxSheets}.`,
    };
  }

  let totalCells = 0;
  const previewSheets: PreviewSheet[] = [];

  for (const s of sheets) {
    const rows = s.data;
    if (rows.length > limits.maxRowsPerSheet) {
      return {
        ok: false, status: 413,
        message: `Sheet "${s.sheet}" has ${rows.length} rows; limit is ${limits.maxRowsPerSheet}.`,
      };
    }
    let maxCols = 0;
    for (const r of rows) {
      if (r.length > limits.maxColumnsPerRow) {
        return {
          ok: false, status: 413,
          message: `Sheet "${s.sheet}" has a row with ${r.length} columns; limit is ${limits.maxColumnsPerRow}.`,
        };
      }
      if (r.length > maxCols) maxCols = r.length;
      totalCells += r.length;
      if (totalCells > limits.maxTotalCells) {
        return {
          ok: false, status: 413,
          message: `Workbook exceeds ${limits.maxTotalCells.toLocaleString()}-cell limit.`,
        };
      }
    }

    previewSheets.push({
      name: s.sheet,
      rowCount: rows.length,
      columnCount: maxCols,
      rows: rows.map((r) => r.map(normalizeCell)),
    });
  }

  // A workbook full of empty sheets isn't useful — surface a clearer
  // error than "imported 0 rows" downstream.
  const hasContent = previewSheets.some((s) => s.rowCount > 0 && s.columnCount > 0);
  if (!hasContent) {
    return { ok: false, status: 422, message: "Workbook has no usable sheets (all are empty)." };
  }

  return { ok: true, fileName, sheets: previewSheets };
}

/** Normalize a parsed cell to the narrow wire-format type. Dates
 *  collapse to ISO strings, undefined/null collapse to null. */
function normalizeCell(v: CellValue | null | undefined): PreviewCell {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  // `read-excel-file`'s CellValue includes `typeof Date` (the constructor
  // type, an odd published-types quirk). Runtime values are Date
  // instances handled above; anything else collapses to a string so the
  // wire format stays narrow.
  return String(v);
}
