import type { ParsedDoc, ParsedSheet } from "./types";

/** Minimal RFC 4180 CSV parser. Handles quoted fields with embedded commas and
 *  doubled quotes. Does NOT try to handle the edge cases of Excel's quirks. */
function parseCsvText(text: string): (string | number | null)[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      cur.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") {
      cur.push(cell);
      rows.push(cur);
      cur = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell.length > 0 || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows.map((r) => r.map(coerce));
}

function coerce(v: string): string | number | null {
  const t = v.trim();
  if (t === "") return null;
  // Money / commas / parens
  const cleaned = t
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[$,]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return t;
}

export async function parseCsv(file: File): Promise<ParsedDoc> {
  const text = await file.text();
  const rows = parseCsvText(text);
  const nonBlank = rows.filter((r) => r.some((c) => c != null && c !== ""));
  const headers = (nonBlank[0] ?? []).map((c) => String(c ?? "").trim());
  const body = nonBlank.slice(1);
  const sheet: ParsedSheet = { name: "sheet1", headers, rows: body };
  return {
    format: "csv",
    fileName: file.name,
    rowCount: body.length,
    sheets: [sheet],
    warnings: [],
  };
}
