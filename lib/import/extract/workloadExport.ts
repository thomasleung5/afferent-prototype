/* Workload export extractor.
 *
 * Permit-system exports. Each row → workload_row with name / department /
 * priorVolume / currentVolume / unit / fiscalYear / sourceSystem. Service
 * name is just preserved here — fuzzy matching against the catalog happens
 * in the mapping engine. */

import type { ParsedDoc } from "@/lib/parse/types";
import type { ExtractedDocument, ExtractedRow } from "../types";
import { normalizeDept, normalizeFiscalYear, parseMoney } from "../normalize";
import { pickCol, listRows, nextRowId } from "./_sheet";

const FY_RE = /\bFY\s*\d{2,4}\b/i;

export function extractWorkloadExport(doc: ParsedDoc): ExtractedDocument {
  const out: ExtractedDocument = {
    documentType: "workload_export",
    sourceFile: doc.fileName,
    sections: [],
    unsectioned: [],
    notes: [],
    parseWarnings: [...doc.warnings],
  };

  if (!doc.sheets || doc.sheets.length === 0) {
    out.parseWarnings.push("Workload export expected a spreadsheet — none found.");
    return out;
  }

  // Try to find FY tokens in headers — "FY24", "FY25", "FY26" — and treat
  // the rightmost as "current", the prior column as "prior".
  for (const sheet of doc.sheets) {
    const lc = sheet.headers.map((h) => h.toLowerCase());
    const fyCols = sheet.headers
      .map((h, i) => ({ idx: i, m: h.match(FY_RE)?.[0] }))
      .filter((x) => x.m != null);
    const currentCol = fyCols.length > 0
      ? fyCols[fyCols.length - 1].idx
      : pickCol(lc, ["current", "current volume", "this year", "fy26", "fy27"]);
    const priorCol = fyCols.length > 1
      ? fyCols[fyCols.length - 2].idx
      : pickCol(lc, ["prior", "prior volume", "last year", "fy24", "fy25"]);

    const c = {
      name:    pickCol(lc, ["service", "permit", "application", "fee item", "name", "description"]),
      label:   pickCol(lc, ["workload label", "type", "category"]),
      dept:    pickCol(lc, ["dept", "department"]),
      unit:    pickCol(lc, ["unit", "basis", "per"]),
      system:  pickCol(lc, ["source system", "system", "source"]),
      fy:      pickCol(lc, ["fiscal year", "fy", "year"]),
      note:    pickCol(lc, ["note", "notes", "remarks"]),
    };

    sheet.rows.forEach((row, idx) => {
      if (row.every((cell) => cell == null || String(cell).trim() === "")) return;

      const name = c.name >= 0 ? String(row[c.name] ?? "").trim() : "";
      const label = c.label >= 0 ? String(row[c.label] ?? "").trim() : undefined;
      const dept = c.dept >= 0 ? String(row[c.dept] ?? "").trim() : "";
      const unit = c.unit >= 0 ? String(row[c.unit] ?? "").trim() : "Item";
      const system = c.system >= 0 ? String(row[c.system] ?? "").trim() : undefined;
      const fyRaw = c.fy >= 0 ? String(row[c.fy] ?? "").trim() : undefined;
      const note = c.note >= 0 ? String(row[c.note] ?? "").trim() : undefined;

      const current = currentCol >= 0 ? parseMoney(row[currentCol]) : null;
      const prior = priorCol >= 0 ? parseMoney(row[priorCol]) : null;

      const warnings: string[] = [];
      if (current == null) warnings.push("missing current volume");
      if (!name) warnings.push("missing service name");
      if (!normalizeDept(dept)?.value && dept) warnings.push("unmatched department");

      const er: ExtractedRow = {
        id: nextRowId(),
        rawLabel: name || label || "(blank workload row)",
        rawCells: row,
        parsedValue: current ?? undefined,
        unit: unit || undefined,
        note,
        rowType: "workload_row",
        source: { file: doc.fileName, sheet: sheet.name, row: idx + 2 },
        fields: {
          serviceName: name || null,
          workloadLabel: label ?? null,
          department: dept || null,
          unit: unit || null,
          priorVolume: prior ?? null,
          currentVolume: current ?? null,
          fiscalYear: normalizeFiscalYear(fyRaw) ?? fyRaw ?? null,
          sourceSystem: system ?? null,
          note: note ?? null,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        confidence: current != null && name ? "high" : "low",
      };
      out.unsectioned.push(er);
    });
  }
  return out;
}
