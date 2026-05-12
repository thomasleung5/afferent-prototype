/* Helpers shared across the lib/import extractors. Intentionally tiny —
 * each extractor stays domain-specific but they all need the same
 * column-picking, row-iteration, and PDF section-detection primitives. */

import type { ParsedDoc, ParsedSheet } from "@/lib/parse/types";

/** Find the index of a header column whose lowercased value matches any of
 *  the hints (exact, then substring). Returns -1 if none match. */
export function pickCol(headers: string[], hints: string[]): number {
  const lc = headers.map((h) => h.toLowerCase());
  for (const hint of hints) {
    const idx = lc.findIndex((h) => h === hint);
    if (idx >= 0) return idx;
  }
  for (const hint of hints) {
    const idx = lc.findIndex((h) => h.includes(hint));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** First non-empty cell as string. */
export function firstString(row: (string | number | null)[]): string {
  for (const c of row) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
}

/** Build a {header: cell} record for storing into lineage.rawCells. */
export function rowMap(headers: string[], row: (string | number | null)[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  headers.forEach((h, i) => { if (h) out[h] = row[i] ?? null; });
  return out;
}

/** A row is "blank" if every cell is null/empty. */
export function isBlank(row: (string | number | null)[]): boolean {
  return row.every((c) => c == null || String(c).trim() === "");
}

/** Flat list of (sheet, row, idx) tuples — skips blank rows. */
export function listRows(doc: ParsedDoc): Array<{ sheet: ParsedSheet; row: (string | number | null)[]; idx: number }> {
  const out: Array<{ sheet: ParsedSheet; row: (string | number | null)[]; idx: number }> = [];
  for (const sheet of doc.sheets ?? []) {
    sheet.rows.forEach((row, idx) => {
      if (isBlank(row)) return;
      out.push({ sheet, row, idx });
    });
  }
  return out;
}

let rowIdSeq = 0;
export function nextRowId(): string {
  return `er-${++rowIdSeq}`;
}
