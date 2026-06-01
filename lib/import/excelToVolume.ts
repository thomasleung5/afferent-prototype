/* Excel-import domain spec: Volume of Activity.
 *
 * Mirrors lib/ai/parseVolume.ts: each row carries a service NAME +
 * dept that's looked up against the existing service catalog. Rows
 * that don't match a catalog service route to `extraction.unmapped`
 * with reason "schema-mismatch", same convention as the AI path so
 * downstream review surfaces don't need an Excel-specific code path.
 *
 * Required column: name + dept + at least one of (prior, current).
 * Optional: unit. */

import type { Service, VolumeRow } from "@/lib/types";
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

type VolumeRole = "name" | "dept" | "prior" | "current" | "unit";

const VOLUME_ROLES: RoleSpec<VolumeRole>[] = [
  { role: "name",    synonyms: new Set([
    "name", "service", "service name", "activity", "fee item",
  ]) },
  { role: "dept",    synonyms: new Set([
    "dept", "department", "division",
  ]) },
  { role: "prior",   synonyms: new Set([
    "prior", "previous", "last year", "prior count", "prior fy", "prior year",
  ]) },
  { role: "current", synonyms: new Set([
    "current", "count", "this year", "current count", "current fy",
    "current year", "annual count", "volume",
  ]) },
  { role: "unit",    synonyms: new Set([
    "unit", "basis", "activity type",
  ]) },
];

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—−—–\-()/.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function autoMapVolume(sheet: PreviewSheet): DomainAutoMapping {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const result = autoMapSheet(rows, VOLUME_ROLES);
  return {
    headerRowIndex: result.headerRowIndex,
    cols: result.cols as Record<string, number>,
    detected: result.detected as Record<string, boolean>,
  };
}

export function validateVolumeMapping(
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
  requireCol("service name", mapping.cols.name ?? -1);
  requireCol("department", mapping.cols.dept ?? -1);
  // At least one of prior / current must be present.
  const priorIdx = mapping.cols.prior ?? -1;
  const currentIdx = mapping.cols.current ?? -1;
  if (priorIdx < 0 && currentIdx < 0) {
    errors.push("Pick a column for prior or current volume.");
  } else {
    if (priorIdx >= 0 && priorIdx >= cols) errors.push(`Column for prior is outside the sheet's ${cols} columns.`);
    if (currentIdx >= 0 && currentIdx >= cols) errors.push(`Column for current is outside the sheet's ${cols} columns.`);
  }
  const unitIdx = mapping.cols.unit ?? -1;
  if (unitIdx >= 0 && unitIdx >= cols) errors.push(`Column for unit is outside the sheet's ${cols} columns.`);
  if (rowCount <= mapping.headerRowIndex + 1) {
    errors.push("Sheet has no data rows after the header.");
  }
  return errors;
}

export function excelToVolumeExtraction(
  fileName: string,
  sheet: PreviewSheet,
  mapping: DomainMapping,
  existingServices: Service[],
  existingVolume: VolumeRow[] = [],
): DomainConvertResult<VolumeRow> {
  const byName = new Map<string, Service>();
  for (const s of existingServices) byName.set(normName(s.name), s);
  const existingByServiceId = new Map<string, VolumeRow>();
  for (const w of existingVolume) existingByServiceId.set(w.id, w);

  const now = new Date().toISOString();
  const mapped: ExtractedRow<VolumeRow>[] = [];
  const duplicates: ExtractedRow<VolumeRow>[] = [];
  const unmapped: UnmappedRow[] = [];
  const warnings: ExcelImportWarning[] = [];
  let skipped = 0;

  const allRows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const data = allRows.slice(mapping.headerRowIndex + 1);

  const nameC = mapping.cols.name ?? -1;
  const deptC = mapping.cols.dept ?? -1;
  const priorC = mapping.cols.prior ?? -1;
  const currentC = mapping.cols.current ?? -1;
  const unitC = mapping.cols.unit ?? -1;

  data.forEach((rawRow, i) => {
    const sourceRow = mapping.headerRowIndex + i + 2;
    const row = Array.isArray(rawRow) ? rawRow : [];
    const nameCell = row[nameC];
    const deptCell = row[deptC];
    const priorCell = priorC >= 0 ? row[priorC] : null;
    const currentCell = currentC >= 0 ? row[currentC] : null;
    const unitCell = unitC >= 0 ? row[unitC] : null;

    if (isBlankCell(nameCell) && isBlankCell(deptCell) && isBlankCell(priorCell) && isBlankCell(currentCell)) {
      skipped += 1;
      return;
    }
    const rawArr = [
      cellToString(nameCell), cellToString(deptCell),
      priorC >= 0 ? cellToString(priorCell) : "",
      currentC >= 0 ? cellToString(currentCell) : "",
      unitC >= 0 ? cellToString(unitCell) : "",
    ];

    const baseLineage: SourceLineage = {
      file: fileName, sheet: sheet.name, row: sourceRow,
      rawCells: {
        name: cellToString(nameCell), dept: cellToString(deptCell),
        prior: priorC >= 0 ? cellToString(priorCell) : null,
        current: currentC >= 0 ? cellToString(currentCell) : null,
        unit: unitC >= 0 ? cellToString(unitCell) : null,
      },
      confidence: "high",
      importedAt: now,
    };

    const name = cellToString(nameCell).trim();
    if (!name) {
      warnings.push({ row: sourceRow, reason: "Missing service name." });
      unmapped.push({ reason: "missing-required-field", raw: rawArr, lineage: { ...baseLineage, confidence: "review" } });
      skipped += 1; return;
    }
    const dept = normalizeDept(cellToString(deptCell), FEE_DEPTS as readonly string[]) as Service["dept"] | null;
    if (!dept) {
      warnings.push({ row: sourceRow, reason: `Unknown department "${cellToString(deptCell)}".` });
      unmapped.push({ reason: "ambiguous-dept", raw: rawArr, lineage: { ...baseLineage, confidence: "review" } });
      skipped += 1; return;
    }
    const priorNum = priorC >= 0 ? cellToNumber(priorCell) : null;
    const currentNum = currentC >= 0 ? cellToNumber(currentCell) : null;
    if (priorNum == null && currentNum == null) {
      warnings.push({ row: sourceRow, reason: "Neither prior nor current volume is readable." });
      unmapped.push({ reason: "missing-required-field", raw: rawArr, lineage: { ...baseLineage, confidence: "review" } });
      skipped += 1; return;
    }
    const matched = byName.get(normName(name));
    if (!matched) {
      warnings.push({ row: sourceRow, reason: `No matching service found for "${name}".` });
      unmapped.push({ reason: "schema-mismatch", raw: rawArr, lineage: { ...baseLineage, confidence: "review" } });
      skipped += 1; return;
    }
    if (matched.dept !== dept) {
      warnings.push({ row: sourceRow, reason: `Department mismatch — "${name}" belongs to ${matched.dept}, not ${dept}.` });
      unmapped.push({
        reason: "ambiguous-dept",
        raw: rawArr,
        lineage: { ...baseLineage, confidence: "review", rawCells: { ...baseLineage.rawCells, catalogDept: matched.dept, catalogServiceId: matched.id } },
      });
      skipped += 1; return;
    }

    const entity: VolumeRow = {
      id: matched.id,
      prior: priorNum,
      current: currentNum,
      source: "imported",
      status: "Imported",
      sourceFile: fileName,
      ...(currentNum == null ? { flag: "missing-current-volume" as const } : {}),
    };
    const extracted = { entity, lineage: baseLineage };
    const prev = existingByServiceId.get(matched.id);
    if (prev && prev.current != null) duplicates.push(extracted);
    else mapped.push(extracted);
  });

  const extraction: ExtractionResult<VolumeRow> = {
    mapped, lowConfidence: [], unmapped, duplicates,
    stats: {
      total: data.length, mapped: mapped.length, lowConfidence: 0,
      unmapped: unmapped.length, duplicates: duplicates.length,
      detected: `Volume (Excel · ${sheet.name})`,
    },
  };
  return { extraction, warnings, importedRowCount: mapped.length + duplicates.length, skippedRowCount: skipped };
}
