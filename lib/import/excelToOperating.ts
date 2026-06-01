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
import { classifyLaborType } from "@/lib/ai/parseOperating";
import type { PreviewSheet } from "@/lib/import/excelPreview";
import {
  autoMapSheet, cellToNumber, cellToString, isBlankCell, normalizeDept,
  type RoleSpec,
} from "@/lib/import/excelMappingCore";
import type {
  DomainAutoMapping, DomainConvertResult, DomainMapping, ExcelImportWarning,
} from "@/lib/import/excelDomainSpec";

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

const OP_CATEGORIES: OpCategory[] = [
  "Software & subscriptions", "Professional services",
  "Training & travel", "Office & supplies", "Memberships & dues",
  "Vehicles & equipment", "Legal noticing", "Capital outlay", "Other",
];

function normCategory(v: string): OpCategory {
  const s = v.trim();
  const match = OP_CATEGORIES.find((c) => c.toLowerCase() === s.toLowerCase());
  return match ?? "Other";
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
): DomainConvertResult<OperatingLine> {
  const now = new Date().toISOString();
  const mapped: ExtractedRow<OperatingLine>[] = [];
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
      warnings.push({ row: sourceRow, reason: `Could not read amount "${cellToString(amountCell)}".` });
      unmapped.push({ reason: "schema-mismatch", raw: rawArr, lineage: lineage("review") });
      skipped += 1; return;
    }

    const category = normCategory(categoryC >= 0 ? cellToString(categoryCell) : "");
    const costType = classifyCostType(line, category);
    const labor: LaborType | undefined = costType === "Labor"
      ? classifyLaborType({ line, category })
      : undefined;
    const entity: OperatingLine = {
      id: `op-xl-${Date.now()}-${i}`,
      code: codeC >= 0 ? cellToString(codeCell).trim() || "—" : "—",
      dept,
      category,
      costType,
      ...(labor ? { laborType: labor } : {}),
      line,
      amount,
      source: "imported",
      sourceFile: fileName,
      include: true,
    };
    mapped.push({ entity, lineage: lineage("high") });
  });

  const extraction: ExtractionResult<OperatingLine> = {
    mapped, lowConfidence: [], unmapped, duplicates: [],
    stats: {
      total: data.length, mapped: mapped.length, lowConfidence: 0,
      unmapped: unmapped.length, duplicates: 0,
      detected: `Operating budget (Excel · ${sheet.name})`,
    },
  };
  return { extraction, warnings, importedRowCount: mapped.length, skippedRowCount: skipped };
}
