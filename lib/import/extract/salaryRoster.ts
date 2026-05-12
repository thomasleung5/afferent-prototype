/* Salary roster extractor.
 *
 * Maps each row to an ExtractedRow with rowType "position" and a fields
 * payload that carries title / dept / fte / salary / benefits / hours /
 * allocationPercent / sourceNote. Missing benefits is intentionally NOT a
 * blocker — flagged via warning instead so the mapping engine sees it. */

import type { ParsedDoc } from "@/lib/parse/types";
import type { ExtractedDocument, ExtractedRow } from "../types";
import { normalizeDept, parseMoney } from "../normalize";
import {
  pickCol, listRows, rowMap, nextRowId,
  iterPdfLines, moneyTokens, stripMoneyTokens,
} from "./_sheet";

export function extractSalaryRoster(doc: ParsedDoc): ExtractedDocument {
  const out: ExtractedDocument = {
    documentType: "salary_roster",
    sourceFile: doc.fileName,
    sections: [],
    unsectioned: [],
    notes: [],
    parseWarnings: [...doc.warnings],
  };

  // PDF path — walk lines and parse domain-heuristically.
  if ((!doc.sheets || doc.sheets.length === 0) && doc.pages && doc.pages.length > 0) {
    extractFromPagesSalary(doc, out);
    return out;
  }

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

/* ── PDF path ───────────────────────────────────────────────────────────── */

/** Heuristic salary-roster line:  "<title>  <dept>  <fte>  <salary>  <benefits>"
 *
 *   - find the leftmost department token (Planning / Building / Engineering)
 *   - everything before it is the title
 *   - money tokens after it map salary → benefits → totalComp
 *   - small decimal between 0.1 and 2.0 is FTE
 *
 *  Lines without a dept token or a salary number are skipped silently to
 *  avoid flooding the queue with PDF table-header artifacts. */
function extractFromPagesSalary(doc: ParsedDoc, out: ExtractedDocument): void {
  for (const { line, section, page, lineNo } of iterPdfLines(doc)) {
    // Look for a dept anchor in the line.
    const deptMatch = line.match(/\b(Planning|Building|Engineering|Bldg|Eng)\b/i);
    if (!deptMatch) continue;

    const deptHit = normalizeDept(deptMatch[0]);
    if (!deptHit) continue;

    const title = line.slice(0, deptMatch.index).trim();
    if (!title || title.length < 3) continue;

    const after = line.slice((deptMatch.index ?? 0) + deptMatch[0].length);
    const nums = moneyTokens(after);
    const fteCandidate = nums.find((n) => n > 0 && n <= 2 && !Number.isInteger(n * 10) === false);
    const moneyNums = nums.filter((n) => n > 1000);
    const salary = moneyNums[0] ?? null;
    const benefits = moneyNums[1] ?? null;
    const totalComp = moneyNums[2] ?? null;

    // Don't fail if salary is missing — emit anyway, mapping will flag it.
    const warnings: string[] = [];
    if (salary == null) warnings.push("missing salary");
    if (benefits == null) warnings.push("missing_benefits_assumption");

    const er: ExtractedRow = {
      id: nextRowId(),
      rawLabel: title,
      rawCells: [line],
      parsedValue: salary ?? totalComp ?? undefined,
      rowType: "position",
      source: { file: doc.fileName, page, row: lineNo, section },
      fields: {
        title,
        dept: deptHit.value,
        fte: fteCandidate ?? null,
        salary: salary ?? null,
        benefits: benefits ?? null,
        totalComp: totalComp ?? null,
        hours: null,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: salary != null ? "high" : "low",
    };
    out.unsectioned.push(er);
  }

  if (out.unsectioned.length === 0) {
    out.parseWarnings.push(
      "PDF parsed but no position-like lines found — try a structured spreadsheet export.",
    );
  }
}
