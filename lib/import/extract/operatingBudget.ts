/* Operating budget / GL export extractor.
 *
 * Preserves department totals (rows where the line label looks like a dept
 * total) alongside line items. Never fails on missing object code or
 * category — those become warnings, not exclusions. */

import type { ParsedDoc } from "@/lib/parse/types";
import type { ExtractedDocument, ExtractedRow, ExtractedRowType } from "../types";
import { normalizeDept, normalizeOpCategory, parseMoney } from "../normalize";
import { pickCol, listRows, nextRowId } from "./_sheet";

const TOTAL_RE = /\b(total|subtotal|department\s+total|grand\s+total)\b/i;

export function extractOperatingBudget(doc: ParsedDoc): ExtractedDocument {
  const out: ExtractedDocument = {
    documentType: "operating_budget",
    sourceFile: doc.fileName,
    sections: [],
    unsectioned: [],
    notes: [],
    parseWarnings: [...doc.warnings],
  };

  if (!doc.sheets || doc.sheets.length === 0) {
    out.parseWarnings.push("Operating budget expected a spreadsheet — none found.");
    return out;
  }

  for (const { sheet, row, idx } of listRows(doc)) {
    const lc = sheet.headers.map((h) => h.toLowerCase());
    const c = {
      account: pickCol(lc, ["account", "object code", "object", "code", "account code"]),
      line:    pickCol(lc, ["line", "account name", "description", "expense", "obligation", "item"]),
      dept:    pickCol(lc, ["dept", "department"]),
      division:pickCol(lc, ["division"]),
      category:pickCol(lc, ["category", "object class", "class"]),
      amount:  pickCol(lc, ["amount", "budget", "fy budget", "adopted", "actual", "obligated", "expense"]),
      costType:pickCol(lc, ["cost type", "recurring", "one-time", "one time"]),
      include: pickCol(lc, ["include", "include in cost of service", "in cos"]),
      note:    pickCol(lc, ["note", "notes", "remarks"]),
    };

    const account = c.account >= 0 ? String(row[c.account] ?? "").trim() : "";
    const line = c.line >= 0 ? String(row[c.line] ?? "").trim() : "";
    const dept = c.dept >= 0 ? String(row[c.dept] ?? "").trim() : "";
    const division = c.division >= 0 ? String(row[c.division] ?? "").trim() : undefined;
    const category = c.category >= 0 ? String(row[c.category] ?? "").trim() : "";
    const amount = c.amount >= 0 ? parseMoney(row[c.amount]) : null;
    const costType = c.costType >= 0 ? String(row[c.costType] ?? "").trim() : undefined;
    const includeRaw = c.include >= 0 ? String(row[c.include] ?? "").trim() : undefined;
    const note = c.note >= 0 ? String(row[c.note] ?? "").trim() : undefined;

    const label = line || account || "(unlabelled)";
    const rowType: ExtractedRowType = TOTAL_RE.test(label) ? "subtotal" : "account_line";

    const warnings: string[] = [];
    if (amount == null && rowType !== "subtotal") warnings.push("missing amount");
    if (!normalizeDept(dept)?.value && dept) warnings.push("unmatched department");

    const includeBool = includeRaw === undefined
      ? undefined
      : /^(no|false|0|excluded)/i.test(includeRaw) ? false : true;

    const er: ExtractedRow = {
      id: nextRowId(),
      rawLabel: label,
      rawCells: row,
      parsedValue: amount ?? undefined,
      note,
      rowType,
      source: { file: doc.fileName, sheet: sheet.name, row: idx + 2 },
      fields: {
        accountCode: account || null,
        accountName: line || null,
        dept: dept || null,
        division: division ?? null,
        category: normalizeOpCategory(category)?.value ?? category ?? null,
        amount: amount ?? null,
        costType: costType ?? null,
        includeInCostOfService: includeBool == null ? null : includeBool ? "yes" : "no",
        note: note ?? null,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: amount != null ? "high" : rowType === "subtotal" ? "high" : "low",
    };
    out.unsectioned.push(er);
  }
  return out;
}
