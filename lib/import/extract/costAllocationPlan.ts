/* Cost allocation plan extractor.
 *
 * CAP documents mix center totals, indirect pool rows, allocation basis
 * rows, and percentage-or-amount step-downs. We preserve whichever value
 * is present (percentage OR amount), flag the missing one, and tag rows
 * as cap_pool / cap_basis / subtotal so mapping can route appropriately. */

import type { ParsedDoc } from "@/lib/parse/types";
import type { ExtractedDocument, ExtractedRow, ExtractedRowType } from "../types";
import { normalizeCostPool, normalizeDept, parseMoney } from "../normalize";
import { pickCol, listRows, nextRowId } from "./_sheet";

const BASIS_RE = /\b(fte|sq\s*ft|square foot|payroll|seat|user|hour)\b/i;
const TOTAL_RE = /\b(total|subtotal|grand\s+total)\b/i;

export function extractCostAllocationPlan(doc: ParsedDoc): ExtractedDocument {
  const out: ExtractedDocument = {
    documentType: "cost_allocation_plan",
    sourceFile: doc.fileName,
    sections: [],
    unsectioned: [],
    notes: [],
    parseWarnings: [...doc.warnings],
  };

  if (!doc.sheets || doc.sheets.length === 0) {
    out.parseWarnings.push("CAP doc expected a spreadsheet — none found.");
    return out;
  }

  for (const { sheet, row, idx } of listRows(doc)) {
    const lc = sheet.headers.map((h) => h.toLowerCase());
    const c = {
      pool:      pickCol(lc, ["pool", "indirect pool", "pool name", "category"]),
      center:    pickCol(lc, ["center", "cost center", "source dept", "source department"]),
      target:    pickCol(lc, ["target", "target dept", "target department", "receiving"]),
      basis:     pickCol(lc, ["basis", "allocation basis", "driver"]),
      percent:   pickCol(lc, ["percent", "%", "allocation %", "share"]),
      amount:    pickCol(lc, ["amount", "$", "allocated", "allocation $", "dollars"]),
      sequence:  pickCol(lc, ["sequence", "order", "step", "step-down order"]),
      note:      pickCol(lc, ["note", "notes", "remarks", "recoverability"]),
    };

    const pool = c.pool >= 0 ? String(row[c.pool] ?? "").trim() : "";
    const center = c.center >= 0 ? String(row[c.center] ?? "").trim() : "";
    const target = c.target >= 0 ? String(row[c.target] ?? "").trim() : "";
    const basis = c.basis >= 0 ? String(row[c.basis] ?? "").trim() : "";
    const percent = c.percent >= 0 ? parseMoney(row[c.percent]) : null;
    const amount = c.amount >= 0 ? parseMoney(row[c.amount]) : null;
    const sequence = c.sequence >= 0 ? parseMoney(row[c.sequence]) : null;
    const note = c.note >= 0 ? String(row[c.note] ?? "").trim() : undefined;

    const label = pool || center || basis || "(unlabelled CAP row)";
    let rowType: ExtractedRowType = "cap_pool";
    if (TOTAL_RE.test(label)) rowType = "subtotal";
    else if (basis && BASIS_RE.test(basis) && amount == null && percent == null) rowType = "cap_basis";

    const warnings: string[] = [];
    if (amount == null && percent == null && rowType === "cap_pool") {
      warnings.push("missing amount and percent");
    } else if (amount == null && rowType === "cap_pool") {
      warnings.push("missing amount (percent present)");
    } else if (percent == null && rowType === "cap_pool") {
      warnings.push("missing percent (amount present)");
    }
    if (!normalizeDept(target)?.value && target) warnings.push("unmatched target department");

    const er: ExtractedRow = {
      id: nextRowId(),
      rawLabel: label,
      rawCells: row,
      parsedValue: amount ?? undefined,
      note,
      rowType,
      source: { file: doc.fileName, sheet: sheet.name, row: idx + 2 },
      fields: {
        poolName: normalizeCostPool(pool)?.value ?? pool ?? null,
        sourceDepartment: center || null,
        targetDepartment: target || null,
        allocationBasis: basis || null,
        allocationPercent: percent ?? null,
        allocatedAmount: amount ?? null,
        sequence: sequence ?? null,
        note: note ?? null,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: (amount != null || percent != null) ? "high" : rowType === "subtotal" ? "high" : "low",
    };
    out.unsectioned.push(er);
  }
  return out;
}
