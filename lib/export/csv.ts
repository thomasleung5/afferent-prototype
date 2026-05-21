/* Tiny CSV builder + browser-side download helper for "Export brief" /
 * "Export log" buttons. Pages that need a quick tabular export reach for
 * this; richer multi-sheet exports keep using lib/export/excel.ts. */

import { downloadBlob } from "./excel";

export type CsvCell = string | number | boolean | null | undefined;

/** RFC-4180-style quoting: wrap in double quotes whenever the cell contains
 *  a comma, quote, CR, or LF; escape internal quotes by doubling them. */
function escapeCell(v: CsvCell): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Convert one row (an array of cells) to a CSV line. */
export function csvRow(cells: CsvCell[]): string {
  return cells.map(escapeCell).join(",");
}

/** Convert a 2D array of cells to a CSV string. Skips null sections so
 *  callers can splice in "blank line" separators with `null`. */
export function buildCsv(rows: (CsvCell[] | null)[]): string {
  return rows.map((r) => (r === null ? "" : csvRow(r))).join("\r\n");
}

/** Trigger a download of `csv` as a UTF-8 .csv file. Adds a BOM so Excel
 *  on Windows opens non-ASCII characters correctly. */
export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, fileName);
}
