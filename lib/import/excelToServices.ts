/* Excel-import domain spec: Service catalog.
 *
 * Mirrors the AI-backed services parser (lib/ai/parseServices.ts) but
 * lets the analyst map columns explicitly. Maps each non-empty row
 * into a Service entity; rows that fail validation route to
 * `extraction.unmapped` so they're visible in the persistent review
 * queue, same convention as the Fees Excel flow. */

import type { Service } from "@/lib/types";
import type {
  ExtractedRow, ExtractionResult, SourceLineage, UnmappedRow,
} from "@/lib/parse/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import { newServiceId } from "@/lib/ai/serviceId";
import type { PreviewSheet } from "@/lib/import/excelPreview";
import {
  autoMapSheet, cellToNumber, cellToString, isBlankCell, normalizeDept,
  type RoleSpec,
} from "@/lib/import/excelMappingCore";
import type {
  DomainAutoMapping, DomainConvertResult, DomainMapping, ExcelImportWarning,
} from "@/lib/import/excelDomainSpec";

type ServicesRole = "name" | "dept" | "hours" | "volume" | "fee" | "target";

const SERVICES_ROLES: RoleSpec<ServicesRole>[] = [
  { role: "name",   synonyms: new Set([
    "name", "service", "service name", "fee item",
  ]) },
  { role: "dept",   synonyms: new Set([
    "dept", "department", "division",
  ]) },
  { role: "hours",  synonyms: new Set([
    "hours", "hrs", "staff hours", "time", "labor hours",
  ]) },
  { role: "volume", synonyms: new Set([
    "volume", "count", "annual volume", "units", "annual count",
  ]) },
  { role: "fee",    synonyms: new Set([
    "fee", "amount", "current fee", "adopted fee", "price", "rate",
  ]) },
  { role: "target", synonyms: new Set([
    "target", "recovery target", "target percent", "target %",
  ]) },
];

export function autoMapServices(sheet: PreviewSheet): DomainAutoMapping {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const result = autoMapSheet(rows, SERVICES_ROLES);
  return {
    headerRowIndex: result.headerRowIndex,
    cols: result.cols as Record<string, number>,
    detected: result.detected as Record<string, boolean>,
  };
}

export function validateServicesMapping(
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
  requireCol("hours per occurrence", mapping.cols.hours ?? -1);
  // Optional columns just bounds-check.
  for (const key of ["volume", "fee", "target"] as const) {
    const idx = mapping.cols[key];
    if (idx != null && idx >= 0 && idx >= cols) {
      errors.push(`Column for ${key} is outside the sheet's ${cols} columns.`);
    }
  }
  if (rowCount <= mapping.headerRowIndex + 1) {
    errors.push("Sheet has no data rows after the header.");
  }
  return errors;
}

export function excelToServicesExtraction(
  fileName: string,
  sheet: PreviewSheet,
  mapping: DomainMapping,
  existing: Service[],
): DomainConvertResult<Service> {
  const existingByName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
  const now = new Date().toISOString();
  const mapped: ExtractedRow<Service>[] = [];
  const duplicates: ExtractedRow<Service>[] = [];
  const unmapped: UnmappedRow[] = [];
  const warnings: ExcelImportWarning[] = [];
  let skipped = 0;

  const allRows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const data = allRows.slice(mapping.headerRowIndex + 1);

  const nameC   = mapping.cols.name ?? -1;
  const deptC   = mapping.cols.dept ?? -1;
  const hoursC  = mapping.cols.hours ?? -1;
  const volumeC = mapping.cols.volume ?? -1;
  const feeC    = mapping.cols.fee ?? -1;
  const targetC = mapping.cols.target ?? -1;

  const buildLineage = (sourceRow: number, row: unknown[], confidence: "high" | "review"): SourceLineage => ({
    file: fileName,
    sheet: sheet.name,
    row: sourceRow,
    rawCells: {
      name: cellToString(row[nameC] as never),
      dept: cellToString(row[deptC] as never),
      hours: cellToString(row[hoursC] as never),
      volume: volumeC >= 0 ? cellToString(row[volumeC] as never) : null,
      fee: feeC >= 0 ? cellToString(row[feeC] as never) : null,
      target: targetC >= 0 ? cellToString(row[targetC] as never) : null,
    },
    confidence,
    importedAt: now,
  });

  data.forEach((rawRow, i) => {
    const sourceRow = mapping.headerRowIndex + i + 2;
    const row = Array.isArray(rawRow) ? rawRow : [];
    const nameCell = row[nameC];
    const deptCell = row[deptC];
    const hoursCell = row[hoursC];

    if (isBlankCell(nameCell) && isBlankCell(deptCell) && isBlankCell(hoursCell)) {
      skipped += 1;
      return;
    }
    const rawArr = [
      cellToString(nameCell), cellToString(deptCell), cellToString(hoursCell),
      volumeC >= 0 ? cellToString(row[volumeC]) : "",
      feeC >= 0    ? cellToString(row[feeC])    : "",
      targetC >= 0 ? cellToString(row[targetC]) : "",
    ];

    const name = cellToString(nameCell).trim();
    if (!name) {
      warnings.push({ row: sourceRow, reason: "Missing service name." });
      unmapped.push({ reason: "missing-required-field", raw: rawArr, lineage: buildLineage(sourceRow, row, "review") });
      skipped += 1; return;
    }
    const dept = normalizeDept(cellToString(deptCell), FEE_DEPTS as readonly string[]) as Service["dept"] | null;
    if (!dept) {
      warnings.push({ row: sourceRow, reason: `Unknown department "${cellToString(deptCell)}".` });
      unmapped.push({ reason: "ambiguous-dept", raw: rawArr, lineage: buildLineage(sourceRow, row, "review") });
      skipped += 1; return;
    }
    const hours = cellToNumber(hoursCell);
    if (hours == null) {
      warnings.push({ row: sourceRow, reason: `Could not read hours "${cellToString(hoursCell)}".` });
      unmapped.push({ reason: "schema-mismatch", raw: rawArr, lineage: buildLineage(sourceRow, row, "review") });
      skipped += 1; return;
    }
    const volume = volumeC >= 0 ? cellToNumber(row[volumeC]) : null;
    const fee    = feeC    >= 0 ? cellToNumber(row[feeC])    : null;
    const target = targetC >= 0 ? cellToNumber(row[targetC]) : null;

    const lineage = buildLineage(sourceRow, row, "high");
    const existingSvc = existingByName.get(name.toLowerCase());
    const entity: Service = existingSvc
      ? {
          ...existingSvc,
          hours,
          ...(volume != null ? { volume } : {}),
          ...(fee != null ? { fee } : {}),
          ...(target != null ? { target } : {}),
        }
      : {
          id: newServiceId(dept, name),
          name, dept,
          hours,
          volume: volume ?? 0,
          fee: fee ?? 0,
          peer: 0,
          target: target ?? 100,
          cost: 0,
          source: "imported",
          sourceFile: fileName,
        };
    const extracted = { entity, lineage };
    if (existingSvc) duplicates.push(extracted);
    else mapped.push(extracted);
  });

  const extraction: ExtractionResult<Service> = {
    mapped, lowConfidence: [], unmapped, duplicates,
    stats: {
      total: data.length, mapped: mapped.length, lowConfidence: 0,
      unmapped: unmapped.length, duplicates: duplicates.length,
      detected: `Service catalog (Excel · ${sheet.name})`,
    },
  };
  return { extraction, warnings, importedRowCount: mapped.length + duplicates.length, skippedRowCount: skipped };
}
