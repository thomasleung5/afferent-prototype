/** Maps a row of header strings against a set of target fields with aliases.
 *  Returns `{ field: columnIndex | -1 }`. Used by every extractor to handle
 *  the realistic case where the user's spreadsheet has columns in a different
 *  order or uses synonymous names ("Title" vs "Position", "FTE" vs "Headcount"). */

export interface HeaderAlias {
  /** Canonical field name. */
  field: string;
  /** Lowercase aliases — match if the trimmed header equals or contains any. */
  aliases: string[];
  /** When true, an extractor should refuse to produce mapped rows if this
   *  column is absent. */
  required?: boolean;
}

export type HeaderMap = Record<string, number>;

export function matchHeaders(
  headers: string[],
  aliases: HeaderAlias[],
): { map: HeaderMap; missing: string[] } {
  const cleaned = headers.map((h) => h.toLowerCase().trim().replace(/\s+/g, " "));
  const map: HeaderMap = {};
  const missing: string[] = [];
  for (const a of aliases) {
    let idx = cleaned.findIndex((h) => a.aliases.some((al) => h === al));
    if (idx < 0) {
      idx = cleaned.findIndex((h) => a.aliases.some((al) => h.includes(al)));
    }
    map[a.field] = idx;
    if (idx < 0 && a.required) missing.push(a.field);
  }
  return { map, missing };
}

/** Pick the most-likely sheet from a multi-sheet workbook by header signals. */
export function pickSheet<T extends { headers: string[] }>(
  sheets: T[],
  aliases: HeaderAlias[],
): T | undefined {
  let best: { sheet: T; score: number } | null = null;
  for (const sheet of sheets) {
    const { map, missing } = matchHeaders(sheet.headers, aliases);
    if (missing.length > 0) continue;
    const score = Object.values(map).filter((i) => i >= 0).length;
    if (!best || score > best.score) best = { sheet, score };
  }
  return best?.sheet;
}

export function cellString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function cellNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/^\((.*)\)$/, "-$1").replace(/[$,]/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normalize a dept string to one of PLAN / BLDG / ENG / SHARED:CDS, or null. */
export function normalizeDept(v: unknown): "PLAN" | "BLDG" | "ENG" | "SHARED:CDS" | null {
  if (v == null) return null;
  const s = String(v).toLowerCase().trim();
  if (!s) return null;
  if (s === "plan" || s.startsWith("plan")) return "PLAN";
  if (s === "bldg" || s.startsWith("build")) return "BLDG";
  if (s === "eng"  || s.startsWith("eng"))   return "ENG";
  if (s.includes("shared") || s.includes("cds")) return "SHARED:CDS";
  return null;
}
