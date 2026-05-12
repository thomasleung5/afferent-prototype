/* Salary roster extractor.
 *
 * Maps each row to an ExtractedRow with rowType "position" and a fields
 * payload that carries title / dept / fte / salary / benefits / hours /
 * allocationPercent / sourceNote. Missing benefits is intentionally NOT a
 * blocker — flagged via warning instead so the mapping engine sees it. */

import type { ParsedDoc } from "@/lib/parse/types";
import type { ExtractedDocument, ExtractedRow } from "../types";
import { normalizeDept, parseMoney } from "../normalize";
import { pickCol, listRows, rowMap, nextRowId } from "./_sheet";

export function extractSalaryRoster(doc: ParsedDoc): ExtractedDocument {
  const out: ExtractedDocument = {
    documentType: "salary_roster",
    sourceFile: doc.fileName,
    sections: [],
    unsectioned: [],
    notes: [],
    parseWarnings: [...doc.warnings],
  };

  if (!doc.sheets || doc.sheets.length === 0) {
    out.parseWarnings.push("Salary roster expected a spreadsheet — none found.");
    return out;
  }

  const rows = listRows(doc);
  for (const { sheet, row, idx } of rows) {
    const lc = sheet.headers.map((h) => h.toLowerCase());
    const c = {
      title:        pickCol(lc, ["position", "title", "classification", "role", "job title"]),
      dept:         pickCol(lc, ["dept", "department"]),
      division:     pickCol(lc, ["division"]),
      fte:          pickCol(lc, ["fte", "headcount", "count"]),
      salary:       pickCol(lc, ["salary", "base salary", "annual salary", "wages"]),
      benefits:     pickCol(lc, ["benefits", "benefit", "loaded benefits"]),
      totalComp:    pickCol(lc, ["total comp", "total compensation", "total cost"]),
      hours:        pickCol(lc, ["productive hours", "prod hours", "annual hours", "hours"]),
      allocation:   pickCol(lc, ["allocation %", "allocation", "% allocation"]),
      status:       pickCol(lc, ["status", "vacant", "filled"]),
      note:         pickCol(lc, ["note", "notes", "remarks"]),
    };

    const title = c.title >= 0 ? String(row[c.title] ?? "").trim() : "";
    if (!title) continue;

    const deptRaw = c.dept >= 0 ? String(row[c.dept] ?? "").trim() : "";
    const division = c.division >= 0 ? String(row[c.division] ?? "").trim() : undefined;
    const fte = c.fte >= 0 ? parseMoney(row[c.fte]) : null;
    const salary = c.salary >= 0 ? parseMoney(row[c.salary]) : null;
    const benefits = c.benefits >= 0 ? parseMoney(row[c.benefits]) : null;
    const totalComp = c.totalComp >= 0 ? parseMoney(row[c.totalComp]) : null;
    const hours = c.hours >= 0 ? parseMoney(row[c.hours]) : null;
    const allocation = c.allocation >= 0 ? parseMoney(row[c.allocation]) : null;
    const status = c.status >= 0 ? String(row[c.status] ?? "").trim() : undefined;
    const note = c.note >= 0 ? String(row[c.note] ?? "").trim() : undefined;

    const warnings: string[] = [];
    if (salary == null) warnings.push("missing salary");
    if (benefits == null) warnings.push("missing_benefits_assumption");
    if (!normalizeDept(deptRaw)?.value) warnings.push("unmatched department");

    const er: ExtractedRow = {
      id: nextRowId(),
      rawLabel: title,
      rawCells: row,
      parsedValue: salary ?? totalComp ?? undefined,
      note,
      rowType: "position",
      source: { file: doc.fileName, sheet: sheet.name, row: idx + 2 },
      fields: {
        title,
        dept: deptRaw,
        division: division ?? null,
        fte: fte ?? null,
        salary: salary ?? null,
        benefits: benefits ?? null,
        totalComp: totalComp ?? null,
        hours: hours ?? null,
        allocationPercent: allocation ?? null,
        status: status ?? null,
        sourceNote: note ?? null,
        ...{ rawRow: JSON.stringify(rowMap(sheet.headers, row)) },
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: salary != null ? "high" : "low",
    };
    out.unsectioned.push(er);
  }

  return out;
}
