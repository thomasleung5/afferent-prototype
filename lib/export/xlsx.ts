/* Shared Excel writer.
 *
 * Wraps `write-excel-file` so the per-deliverable exporters (fee study,
 * CAP, benchmarks) only deal with `Cell[][]` sheet shapes and don't need
 * to know which xlsx backend is in use. Replaced `xlsx` (SheetJS) in
 * 2026-05 because SheetJS shipped two high-severity advisories with no
 * upstream fix, and `write-excel-file` is the cleanest maintained
 * alternative (zero prod-audit findings, ESM-first, browser-friendly).
 *
 * Compatibility surface preserved across the swap:
 *   - `h(label)`     — bold-header cell.
 *   - `n(value, fmt)`— number cell with an Excel number-format string
 *                      (e.g. "$#,##0", "0%", "+0%;-0%"). Non-finite
 *                      values collapse to an empty string, matching the
 *                      old behavior.
 *   - `buildXlsxBlob(sheets)` — workbook builder; per-sheet sticky-row
 *                      count defaults to 1 (frozen header row) so the
 *                      former `!freeze { ySplit: 1 }` behavior carries
 *                      over without callers re-specifying it.
 *   - `downloadBlob`  — browser download trigger; identical semantics.
 *
 * `write-excel-file`'s column width units are characters (same as
 * SheetJS's `wch`), so existing width arrays pass through verbatim.
 */

import type { CellObject, Sheet } from "write-excel-file/browser";

export type Cell = string | number | null | CellObject;

/** Bold header cell. */
export function h(label: string): CellObject {
  return { value: label, fontWeight: "bold" };
}

/** Formatted number cell. Non-finite values collapse to "" so callers
 *  can pass through derived values without first guarding for NaN. */
export function n(value: number, format: string): Cell {
  if (!Number.isFinite(value)) return "";
  return { value, type: Number, format };
}

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  /** Character-width per column. Omitted → no custom widths. */
  columnWidths?: number[];
  /** Top rows to freeze. Defaults to 1; pass 0 to disable freezing for
   *  sheets that don't have a header row. */
  stickyRowsCount?: number;
}

/** Build a multi-sheet workbook and return it as a Blob suitable for
 *  `downloadBlob`. Browser-only: relies on URL.createObjectURL downstream.
 *
 *  The xlsx writer is dynamic-imported so the export bundle stays
 *  code-split out of the initial page chunk — the user only pays the
 *  download cost when they actually trigger an Excel export.
 *
 *  IMPORTANT: write-excel-file's browser entry does NOT return a Blob.
 *  It returns a writer object with `toBlob()` and `toFile(name)` methods
 *  (the published TypeScript types are misleading here — they advertise
 *  a unified `ReturnType` that resolves to the writer, not a Blob). The
 *  initial port treated the awaited writer as a Blob and handed it to
 *  URL.createObjectURL, which silently produced no download. Always go
 *  through `.toBlob()` to get the real binary. */
export async function buildXlsxBlob(sheets: SheetSpec[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const built: Sheet<Blob>[] = sheets.map((s) => ({
    sheet: s.name,
    data: s.rows,
    stickyRowsCount: s.stickyRowsCount ?? 1,
    ...(s.columnWidths
      ? { columns: s.columnWidths.map((w) => ({ width: w })) }
      : {}),
  }));
  const writer = writeXlsxFile(built) as unknown as { toBlob: () => Promise<Blob> };
  return writer.toBlob();
}

/** Trigger a client-side download of `blob` with the given filename. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
