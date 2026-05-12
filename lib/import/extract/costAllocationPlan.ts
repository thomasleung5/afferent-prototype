/* Cost allocation plan extractor.
 *
 * CAP documents mix center totals, indirect pool rows, allocation basis
 * rows, and percentage-or-amount step-downs. We preserve whichever value
 * is present (percentage OR amount), flag the missing one, and tag rows
 * as cap_pool / cap_basis / subtotal so mapping can route appropriately. */

import type { ParsedDoc } from "@/lib/parse/types";
import type { ExtractedDocument, ExtractedRow, ExtractedRowType } from "../types";
import { normalizeCostPool, normalizeDept, parseMoney } from "../normalize";
import {
  pickCol, listRows, nextRowId,
  iterPdfLines, moneyTokens, stripMoneyTokens,
} from "./_sheet";

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

  // PDF path
  if ((!doc.sheets || doc.sheets.length === 0) && doc.pages && doc.pages.length > 0) {
    extractFromPagesCap(doc, out);
    return out;
  }

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

/* ── PDF path ───────────────────────────────────────────────────────────── */

/** CAP PDF line:  "<pool>  [<center>]  [<target dept>]  [<basis>]  <percent>%  <amount>"
 *  - percent token: number followed by % anywhere on the line
 *  - largest money token: amount
 *  - basis: matches BASIS_RE
 *  - target dept: normalizable dept token
 *  - everything before the first numeric/dept/basis token is the pool name */
function extractFromPagesCap(doc: ParsedDoc, out: ExtractedDocument): void {
  for (const { line, section, page, lineNo } of iterPdfLines(doc)) {
    const pctMatch = line.match(/(-?\d+(?:\.\d+)?)\s*%/);
    const percent = pctMatch ? Number(pctMatch[1]) : null;

    const nums = moneyTokens(line.replace(/-?\d+(?:\.\d+)?\s*%/g, ""));
    const amount = nums.length > 0 ? Math.max(...nums.map(Math.abs)) * Math.sign(nums.find((n) => Math.abs(n) === Math.max(...nums.map(Math.abs))) ?? 1) : null;

    const basisMatch = line.match(BASIS_RE);
    const basis = basisMatch?.[0] ?? "";

    const deptMatch = line.match(/\b(Planning|Building|Engineering|Bldg|Eng)\b/i);
    const target = deptMatch ? normalizeDept(deptMatch[0])?.value ?? null : null;

    // Pool = everything before the first "structural" token (basis / dept / number / %)
    let label = line;
    const stopIdxs = [
      basisMatch?.index,
      deptMatch?.index,
      pctMatch?.index,
      line.search(/-?\$?\d/),
    ].filter((i): i is number => i != null && i >= 0);
    if (stopIdxs.length > 0) label = line.slice(0, Math.min(...stopIdxs)).trim();
    label = label || stripMoneyTokens(line);
    if (!label) continue;

    const isTotal = TOTAL_RE.test(label);
    let rowType: ExtractedRowType = "cap_pool";
    if (isTotal) rowType = "subtotal";
    else if (basis && amount == null && percent == null) rowType = "cap_basis";

    const warnings: string[] = [];
    if (amount == null && percent == null && rowType === "cap_pool") {
      warnings.push("missing amount and percent");
    } else if (amount == null && rowType === "cap_pool") {
      warnings.push("missing amount (percent present)");
    } else if (percent == null && rowType === "cap_pool") {
      warnings.push("missing percent (amount present)");
    }

    const er: ExtractedRow = {
      id: nextRowId(),
      rawLabel: label,
      rawCells: [line],
      parsedValue: amount ?? undefined,
      rowType,
      source: { file: doc.fileName, page, row: lineNo, section },
      fields: {
        poolName: normalizeCostPool(label)?.value ?? label,
        sourceDepartment: section ?? null,
        targetDepartment: target,
        allocationBasis: basis || null,
        allocationPercent: percent ?? null,
        allocatedAmount: amount ?? null,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: (amount != null || percent != null) ? "high" : rowType === "subtotal" ? "high" : "low",
    };
    out.unsectioned.push(er);
  }

  if (out.unsectioned.length === 0) {
    out.parseWarnings.push(
      "PDF parsed but no CAP pool patterns found — try a structured spreadsheet export.",
    );
  }
}
