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

/* ── PDF helpers ────────────────────────────────────────────────────────── */

/** All-caps line, 4–80 chars, mostly letters — treated as a section header. */
export const SECTION_RE = /^[A-Z][A-Z0-9 &/()'.,-]{3,80}$/;

/** Walk every non-empty PDF line, threading the most-recent section header
 *  through as context. Yields {line, section, page, lineNo} for each
 *  non-section line. */
export function* iterPdfLines(doc: ParsedDoc): Generator<{
  line: string; section?: string; page: number; lineNo: number;
}> {
  if (!doc.pages) return;
  let section: string | undefined;
  for (const page of doc.pages) {
    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i].trim();
      if (!line) continue;
      if (SECTION_RE.test(line) && line.length < 80) {
        section = line;
        continue;
      }
      yield { line, section, page: page.page, lineNo: i + 1 };
    }
  }
}

/** Pull every money-like token out of a string. Returns numbers in source
 *  order. Handles $1,234.56, (1234) negatives, percents. */
export function moneyTokens(s: string): number[] {
  const out: number[] = [];
  // Conservative: at least one digit, optional $ prefix, commas + decimals OK.
  const re = /-?\(?\$?\d[\d,]*\.?\d*\)?%?/g;
  const matches = s.match(re) ?? [];
  for (const m of matches) {
    const cleaned = m.replace(/[$,]/g, "").replace(/^\(/, "-").replace(/\)$/, "").replace(/%$/, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Strip every money-like token from a string and collapse whitespace. */
export function stripMoneyTokens(s: string): string {
  return s.replace(/-?\(?\$?\d[\d,]*\.?\d*\)?%?/g, " ").replace(/\s+/g, " ").trim();
}
