import type { ParsedDoc, ParsedSheet } from "./types";

/** Parses an XLSX/XLS file via SheetJS. Loaded dynamically — the ~700KB
 *  SheetJS bundle only ships when a user actually uploads a spreadsheet. */
export async function parseXlsx(file: File): Promise<ParsedDoc> {
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const warnings: string[] = [];
  const sheets: ParsedSheet[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // sheet_to_json with header: 1 gives us raw cell arrays.
    const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1, defval: null, blankrows: false, raw: true,
    });
    if (raw.length === 0) continue;
    const headers = raw[0].map((c) => String(c ?? "").trim());
    const body = raw.slice(1).map((r) => r.map(normalizeCell));
    sheets.push({ name, headers, rows: body });
  }

  const rowCount = sheets.reduce((a, s) => a + s.rows.length, 0);
  if (rowCount === 0) warnings.push("Workbook contained no data rows.");
  return {
    format: "xlsx",
    fileName: file.name,
    rowCount,
    sheets,
    warnings,
  };
}

function normalizeCell(v: unknown): string | number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "") return null;
  const cleaned = s.replace(/^\((.*)\)$/, "-$1").replace(/[$,]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return s;
}
