/* Excel-import domain spec: Labor roster (Positions).
 *
 * Mirrors lib/ai/parseLabor.ts: each row produces a Position entity
 * with title / dept / fte / hours. Salary + benefits stay 0 — those
 * live in the Operating budget import, not in the Position roster. */

import type { Position } from "@/lib/types";
import type {
  ExtractedRow, ExtractionResult, SourceLineage, UnmappedRow,
} from "@/lib/parse/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import type { PreviewSheet } from "@/lib/import/excelPreview";
import {
  autoMapSheet, cellToNumber, cellToString, isBlankCell, normalizeDept,
  type RoleSpec,
} from "@/lib/import/excelMappingCore";
import type {
  DomainAutoMapping, DomainConvertResult, DomainMapping, ExcelImportWarning,
} from "@/lib/import/excelDomainSpec";

type LaborRole = "title" | "dept" | "fte" | "hours";

const LABOR_ROLES: RoleSpec<LaborRole>[] = [
  { role: "title", synonyms: new Set([
    "title", "position", "position title", "role", "job title", "name",
  ]) },
  { role: "dept",  synonyms: new Set([
    "dept", "department", "division",
  ]) },
  { role: "fte",   synonyms: new Set([
    "fte", "ftes", "full time equivalent", "full time equivalents",
    "full time", "headcount",
  ]) },
  { role: "hours", synonyms: new Set([
    "hours", "productive hours", "hrs", "annual hours", "hours per year",
    "productive hrs",
  ]) },
];

export function autoMapLabor(sheet: PreviewSheet): DomainAutoMapping {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const result = autoMapSheet(rows, LABOR_ROLES);
  return {
    headerRowIndex: result.headerRowIndex,
    cols: result.cols as Record<string, number>,
    detected: result.detected as Record<string, boolean>,
  };
}

export function validateLaborMapping(
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
  requireCol("position title", mapping.cols.title ?? -1);
  requireCol("department", mapping.cols.dept ?? -1);
  requireCol("FTE", mapping.cols.fte ?? -1);
  requireCol("annual hours", mapping.cols.hours ?? -1);
  if (rowCount <= mapping.headerRowIndex + 1) {
    errors.push("Sheet has no data rows after the header.");
  }
  return errors;
}

export function excelToLaborExtraction(
  fileName: string,
  sheet: PreviewSheet,
  mapping: DomainMapping,
): DomainConvertResult<Position> {
  const now = new Date().toISOString();
  const mapped: ExtractedRow<Position>[] = [];
  const unmapped: UnmappedRow[] = [];
  const warnings: ExcelImportWarning[] = [];
  let skipped = 0;

  const allRows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const data = allRows.slice(mapping.headerRowIndex + 1);
  const titleC = mapping.cols.title ?? -1;
  const deptC = mapping.cols.dept ?? -1;
  const fteC = mapping.cols.fte ?? -1;
  const hoursC = mapping.cols.hours ?? -1;

  data.forEach((rawRow, i) => {
    const sourceRow = mapping.headerRowIndex + i + 2;
    const row = Array.isArray(rawRow) ? rawRow : [];
    const titleCell = row[titleC];
    const deptCell = row[deptC];
    const fteCell = row[fteC];
    const hoursCell = row[hoursC];

    if (isBlankCell(titleCell) && isBlankCell(deptCell) && isBlankCell(fteCell) && isBlankCell(hoursCell)) {
      skipped += 1;
      return;
    }
    const rawArr = [
      cellToString(titleCell), cellToString(deptCell),
      cellToString(fteCell), cellToString(hoursCell),
    ];

    const lineage = (confidence: "high" | "review"): SourceLineage => ({
      file: fileName, sheet: sheet.name, row: sourceRow,
      rawCells: {
        title: cellToString(titleCell), dept: cellToString(deptCell),
        fte: cellToString(fteCell), hours: cellToString(hoursCell),
      },
      confidence,
      importedAt: now,
    });

    const title = cellToString(titleCell).trim();
    if (!title) {
      warnings.push({ row: sourceRow, reason: "Missing position title." });
      unmapped.push({ reason: "missing-required-field", raw: rawArr, lineage: lineage("review") });
      skipped += 1; return;
    }
    const dept = normalizeDept(cellToString(deptCell), FEE_DEPTS as readonly string[]) as Position["dept"] | null;
    if (!dept) {
      warnings.push({ row: sourceRow, reason: `Unknown department "${cellToString(deptCell)}".` });
      unmapped.push({ reason: "ambiguous-dept", raw: rawArr, lineage: lineage("review") });
      skipped += 1; return;
    }
    const fte = cellToNumber(fteCell);
    if (fte == null) {
      warnings.push({ row: sourceRow, reason: `Could not read FTE "${cellToString(fteCell)}".` });
      unmapped.push({ reason: "schema-mismatch", raw: rawArr, lineage: lineage("review") });
      skipped += 1; return;
    }
    const hours = cellToNumber(hoursCell);
    if (hours == null) {
      warnings.push({ row: sourceRow, reason: `Could not read hours "${cellToString(hoursCell)}".` });
      unmapped.push({ reason: "schema-mismatch", raw: rawArr, lineage: lineage("review") });
      skipped += 1; return;
    }

    const entity: Position = {
      id: `pos-xl-${Date.now()}-${i}`,
      title, dept, fte,
      salary: 0, benefits: 0,
      hours,
      source: "imported",
      sourceFile: fileName,
    };
    mapped.push({ entity, lineage: lineage("high") });
  });

  const extraction: ExtractionResult<Position> = {
    mapped, lowConfidence: [], unmapped, duplicates: [],
    stats: {
      total: data.length, mapped: mapped.length, lowConfidence: 0,
      unmapped: unmapped.length, duplicates: 0,
      detected: `Labor roster (Excel · ${sheet.name})`,
    },
  };
  return { extraction, warnings, importedRowCount: mapped.length, skippedRowCount: skipped };
}
