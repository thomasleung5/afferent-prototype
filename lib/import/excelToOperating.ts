/* Excel-import domain spec: Operating budget.
 *
 * Mirrors lib/ai/parseOperating.ts: each row is one budget line with
 * code / dept / category / line description / amount. Cost-type and
 * labor-type classification reuses the AI-side keyword heuristics
 * via classifyLaborType. */

import type { CostType, LaborType, OperatingLine, OpCategory, OpDept } from "@/lib/types";
import type {
  ExtractedRow, ExtractionResult, SourceLineage, UnmappedRow,
} from "@/lib/parse/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import {
  classifyLaborType, classifyOperatingExclusion, isOperatingTotalRow,
} from "@/lib/ai/parseOperating";
import type { PreviewSheet } from "@/lib/import/excelPreview";
import {
  autoMapSheet, cellToNumber, cellToString, isBlankCell, normalizeDept,
  type RoleSpec,
} from "@/lib/import/excelMappingCore";
import type {
  DomainAutoMapping, DomainConvertResult, DomainMapping, ExcelImportWarning,
} from "@/lib/import/excelDomainSpec";
import { OP_CATEGORIES } from "@/lib/ai/parseOperating";

/** Normalize a source-document category string into a stable lookup key
 *  for `operatingCategoryMappings`. Casing and whitespace differences
 *  in vendor exports (e.g. "  software & subs  " vs "Software & Subs")
 *  must collapse to the same entry so the analyst maps each bucket
 *  exactly once. */
export function normalizeSourceCategoryKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

type OperatingRole = "code" | "dept" | "category" | "line" | "amount";

const OPERATING_ROLES: RoleSpec<OperatingRole>[] = [
  { role: "code",     synonyms: new Set([
    "code", "account", "account code", "gl", "gl code", "object", "object code",
  ]) },
  { role: "dept",     synonyms: new Set([
    "dept", "department", "division",
  ]) },
  { role: "category", synonyms: new Set([
    "category", "type", "classification", "class",
  ]) },
  { role: "line",     synonyms: new Set([
    "line", "line item", "description", "name", "item", "account name",
  ]) },
  { role: "amount",   synonyms: new Set([
    "amount", "budget", "fy budget", "adopted", "adopted budget",
    "proposed", "proposed budget", "total", "dollars",
  ]) },
];

/** Resolve a raw source-category cell against (a) a saved per-study
 *  mapping table, and (b) the canonical OpCategory list via a
 *  case-insensitive exact match. Returns the mapped category when
 *  resolved; null when the analyst still needs to choose. Blank cells
 *  resolve to the placeholder "Other Operational Expenses" with
 *  needsCategoryMapping=false because there is nothing to review. */
export function resolveSourceCategory(
  rawCategory: string,
  savedMappings: Record<string, OpCategory>,
): { category: OpCategory; needsCategoryMapping: boolean } {
  const trimmed = rawCategory.trim();
  if (!trimmed) {
    return { category: "Other Operational Expenses", needsCategoryMapping: false };
  }
  const key = normalizeSourceCategoryKey(trimmed);
  const saved = savedMappings[key];
  if (saved) return { category: saved, needsCategoryMapping: false };
  const canonical = OP_CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (canonical) return { category: canonical, needsCategoryMapping: false };
  return { category: "Other Operational Expenses", needsCategoryMapping: true };
}

const LABOR_TEXT_PATTERNS: RegExp[] = [
  /\bsalar(?:y|ies)\b/i, /\bwages?\b/i, /\bbenefits?\b/i, /\bfringe\b/i,
  /\bovertime\b/i, /\bpayroll\s*tax(?:es)?\b/i, /\bfica\b/i,
  /\bmedicare\b/i, /\boasdi\b/i, /\bworkers?(?:'|’)?\s*comp(?:ensation)?\b/i,
  /\bwellness\b/i, /\b(?:temp(?:orary)?|part[-\s]?time|seasonal)\s+labor\b/i,
  /\blabor\s+burden\b/i, /\bretirement\b/i, /\bpension\b/i, /\bpers\b/i,
];

function classifyCostType(line: string, category: string): CostType {
  const text = `${line} ${category}`.trim();
  if (!text) return "Operating";
  for (const re of LABOR_TEXT_PATTERNS) if (re.test(text)) return "Labor";
  return "Operating";
}

export function autoMapOperating(sheet: PreviewSheet): DomainAutoMapping {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const result = autoMapSheet(rows, OPERATING_ROLES);
  return {
    headerRowIndex: result.headerRowIndex,
    cols: result.cols as Record<string, number>,
    detected: result.detected as Record<string, boolean>,
  };
}

export function validateOperatingMapping(
  sheet: PreviewSheet,
  mapping: DomainMapping,
): string[] {
  const errors: string[] = [];
  const rowCount = typeof sheet?.rowCount === "number" ? sheet.rowCount : 0;
  const cols = typeof sheet?.columnCount === "number" ? sheet.columnCount : 0;
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  if (rowCount === 0 || rows.length === 0) {
    errors.push("This sheet is empty. Pick another sheet from the dropdown above.");
    return errors;
  }
  if (mapping.headerRowIndex < 0 || mapping.headerRowIndex >= rowCount) {
    errors.push(`Header row ${mapping.headerRowIndex + 1} is outside the sheet's ${rowCount} rows.`);
  }
  if (cols === 0) errors.push("Sheet has no columns to map.");

  const requireCol = (label: string, idx: number): void => {
    if (idx < 0) errors.push(`Pick a column for ${label}.`);
    else if (idx >= cols) errors.push(`Column for ${label} is outside the sheet's ${cols} columns.`);
  };
  requireCol("line description", mapping.cols.line ?? -1);
  requireCol("department", mapping.cols.dept ?? -1);
  requireCol("amount", mapping.cols.amount ?? -1);
  // code + category are optional but bounds-check if mapped
  for (const k of ["code", "category"] as const) {
    const idx = mapping.cols[k];
    if (idx != null && idx >= 0 && idx >= cols) {
      errors.push(`Column for ${k} is outside the sheet's ${cols} columns.`);
    }
  }
  if (rowCount <= mapping.headerRowIndex + 1) {
    errors.push("Sheet has no data rows after the header.");
  }
  return errors;
}

export function excelToOperatingExtraction(
  fileName: string,
  sheet: PreviewSheet,
  mapping: DomainMapping,
  /** Saved source-category → canonical mappings from previous imports
   *  in this study (BuildSnapshot.operatingCategoryMappings). Defaults
   *  to {} so callers that haven't wired the panel through can keep
   *  using the converter directly. */
  savedCategoryMappings: Record<string, OpCategory> = {},
): DomainConvertResult<OperatingLine> & { unmappedSourceCategories: string[] } {
  const now = new Date().toISOString();
  const mapped: ExtractedRow<OperatingLine>[] = [];
  const lowConfidence: ExtractedRow<OperatingLine>[] = [];
  const unmapped: UnmappedRow[] = [];
  const warnings: ExcelImportWarning[] = [];
  let skipped = 0;

  const allRows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const data = allRows.slice(mapping.headerRowIndex + 1);
  const codeC = mapping.cols.code ?? -1;
  const deptC = mapping.cols.dept ?? -1;
  const categoryC = mapping.cols.category ?? -1;
  const lineC = mapping.cols.line ?? -1;
  const amountC = mapping.cols.amount ?? -1;

  data.forEach((rawRow, i) => {
    const sourceRow = mapping.headerRowIndex + i + 2;
    const row = Array.isArray(rawRow) ? rawRow : [];
    const codeCell = codeC >= 0 ? row[codeC] : null;
    const deptCell = row[deptC];
    const categoryCell = categoryC >= 0 ? row[categoryC] : null;
    const lineCell = row[lineC];
    const amountCell = row[amountC];

    if (isBlankCell(lineCell) && isBlankCell(deptCell) && isBlankCell(amountCell)) {
      skipped += 1;
      return;
    }
    const rawArr = [
      codeC >= 0 ? cellToString(codeCell) : "",
      cellToString(deptCell),
      categoryC >= 0 ? cellToString(categoryCell) : "",
      cellToString(lineCell),
      cellToString(amountCell),
    ];

    const lineage = (confidence: "high" | "review"): SourceLineage => ({
      file: fileName, sheet: sheet.name, row: sourceRow,
      rawCells: {
        code: codeC >= 0 ? cellToString(codeCell) : null,
        dept: cellToString(deptCell),
        category: categoryC >= 0 ? cellToString(categoryCell) : null,
        line: cellToString(lineCell),
        amount: cellToString(amountCell),
      },
      confidence,
      importedAt: now,
    });

    const line = cellToString(lineCell).trim();
    if (!line) {
      warnings.push({ row: sourceRow, reason: "Missing line description." });
      unmapped.push({ reason: "missing-required-field", raw: rawArr, lineage: lineage("review") });
      skipped += 1; return;
    }
    // Totals / subtotals / grand totals aren't line items — skip them
    // the same way blank rows are skipped, so they don't double-count
    // against the per-line entries underneath.
    if (isOperatingTotalRow(line)) {
      skipped += 1; return;
    }
    const deptRaw = cellToString(deptCell);
    let dept: OpDept | null = normalizeDept(deptRaw, FEE_DEPTS as readonly string[]) as OpDept | null;
    if (!dept) {
      // Allow the synthetic SHARED:CDS dept used by the operating engine.
      const upper = deptRaw.trim().toUpperCase();
      if (upper === "SHARED:CDS" || upper === "SHARED" || upper === "CDS"
          || upper === "COMMUNITY DEVELOPMENT" || upper === "DEVELOPMENT SERVICES") {
        dept = "SHARED:CDS";
      }
    }
    if (!dept) {
      warnings.push({ row: sourceRow, reason: `Unknown department "${deptRaw}".` });
      unmapped.push({ reason: "ambiguous-dept", raw: rawArr, lineage: lineage("review") });
      skipped += 1; return;
    }
    const amount = cellToNumber(amountCell);
    if (amount == null) {
      // Truly unreadable amount (e.g. "TBD", a stray string). Distinct
      // from `amount: 0` which is a valid value the analyst may have
      // intentionally entered and the new policy retains.
      warnings.push({ row: sourceRow, reason: `Could not read amount "${cellToString(amountCell)}".` });
      unmapped.push({ reason: "schema-mismatch", raw: rawArr, lineage: lineage("review") });
      skipped += 1; return;
    }

    const rawCategory = categoryC >= 0 ? cellToString(categoryCell).trim() : "";
    const resolved = resolveSourceCategory(rawCategory, savedCategoryMappings);
    const category = resolved.category;
    // Cost-type + exclusion classification run after the canonical
    // category is assigned. Unresolved rows still get a placeholder
    // run so the preview shows something plausible; once the analyst
    // resolves the source category in the review step the converter
    // re-runs and the final cost-type + include/excludeReason reflect
    // the real canonical mapping.
    const costType = classifyCostType(line, category);
    const labor: LaborType | undefined = costType === "Labor"
      ? classifyLaborType({ line, category })
      : undefined;
    // Apply the shared retention policy so capital outlay / debt
    // service / transfers / pass-throughs / applicant-reimbursed /
    // one-time rows land with include=false + a clear excludeReason
    // instead of silently going into the recovery math. `sourceCategory`
    // is passed because OpCategory no longer enumerates capital outlay
    // as a canonical bucket; the classifier reads the raw cell to
    // preserve the existing exclusion behavior on rows the source
    // document tagged as Capital outlay. PDF/AI uses the same helper.
    const policy = classifyOperatingExclusion({
      line, category, sourceCategory: rawCategory,
    });
    const entity: OperatingLine = {
      id: `op-xl-${Date.now()}-${i}`,
      code: codeC >= 0 ? cellToString(codeCell).trim() || "—" : "—",
      dept,
      category,
      ...(rawCategory ? { sourceCategory: rawCategory } : {}),
      ...(resolved.needsCategoryMapping ? { needsCategoryMapping: true } : {}),
      costType,
      ...(labor ? { laborType: labor } : {}),
      line,
      amount,
      source: "imported",
      sourceFile: fileName,
      include: policy.include,
      ...(policy.excludeReason ? { excludeReason: policy.excludeReason } : {}),
    };
    // Negative amounts always go to lowConfidence — analyst must
    // confirm the row is an intentional expenditure adjustment.
    if (amount < 0) {
      lowConfidence.push({ entity, lineage: lineage("review") });
    } else {
      mapped.push({ entity, lineage: lineage("high") });
    }
  });

  const extraction: ExtractionResult<OperatingLine> = {
    mapped, lowConfidence, unmapped, duplicates: [],
    stats: {
      total: data.length, mapped: mapped.length, lowConfidence: lowConfidence.length,
      unmapped: unmapped.length, duplicates: 0,
      detected: `Operating budget (Excel · ${sheet.name})`,
    },
  };
  // Unique source categories that still need analyst review, preserving
  // the verbatim casing the source document used. Order is
  // first-seen-first so the review UI surfaces them in the order they
  // appeared in the workbook.
  const seen = new Set<string>();
  const unmappedSourceCategories: string[] = [];
  for (const { entity } of [...mapped, ...lowConfidence]) {
    if (!entity.needsCategoryMapping) continue;
    const raw = entity.sourceCategory ?? "";
    const key = normalizeSourceCategoryKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unmappedSourceCategories.push(raw);
  }
  return {
    extraction,
    warnings,
    importedRowCount: mapped.length + lowConfidence.length,
    skippedRowCount: skipped,
    unmappedSourceCategories,
  };
}
