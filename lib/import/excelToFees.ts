/* Convert an Excel-preview sheet + column mapping into the same
 * `ExtractionResult<Service>` shape the existing Fee Schedule merge
 * path (mergeFeeSchedule → mergeImportedServices) already consumes.
 *
 * Mirrors `feesToExtractionResult` in lib/ai/parseFees.ts but with
 * deterministic, Excel-flavored lineage (real sheet name + real
 * source row number, instead of "AI parsed" / sequential index).
 * Each emitted row carries `confidence: "high"` because this path is
 * NOT AI-backed — the user explicitly mapped each column, so we
 * don't have the same low-confidence escape hatch the AI parser uses.
 *
 * Rows that fail validation (missing required cells, invalid fee,
 * unknown dept code) are dropped from the extraction and surfaced
 * separately as `warnings`, so the UI can show the analyst exactly
 * which rows were skipped and why. */

import type { Service } from "@/lib/types";
import type { ExtractedRow, ExtractionResult, SourceLineage } from "@/lib/parse/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import { mapLegacyUnit } from "@/lib/data/feeUnits";
import { newServiceId } from "@/lib/ai/serviceId";
import type { PreviewCell, PreviewSheet } from "@/lib/import/excelPreview";

export interface FeeColumnMapping {
  /** 0-based index of the header row in the sheet's `rows` array. Data
   *  rows start at `headerRowIndex + 1`. */
  headerRowIndex: number;
  /** 0-based column indexes into each preview row array. */
  nameCol: number;
  deptCol: number;
  feeCol: number;
  /** Optional unit column; null when not mapped. */
  unitCol: number | null;
}

export interface ExcelFeeWarning {
  /** 1-based source row number (matches what the analyst sees in Excel). */
  row: number;
  reason: string;
}

export interface ExcelToFeeResult {
  extraction: ExtractionResult<Service>;
  warnings: ExcelFeeWarning[];
  /** Rows that produced an extracted Service (mapped + duplicates). */
  importedRowCount: number;
  /** Data rows that were dropped (invalid + skipped-blank). */
  skippedRowCount: number;
}

/** Returns the user-facing list of mapping errors (missing required
 *  column, header row out of range). Empty array means the mapping is
 *  applyable — call `excelToFeeExtraction` next. */
export function validateFeeMapping(
  sheet: PreviewSheet,
  mapping: FeeColumnMapping,
): string[] {
  const errors: string[] = [];
  if (mapping.headerRowIndex < 0 || mapping.headerRowIndex >= sheet.rowCount) {
    errors.push(`Header row ${mapping.headerRowIndex + 1} is outside the sheet's ${sheet.rowCount} rows.`);
  }
  const cols = sheet.columnCount;
  const requireCol = (label: string, idx: number): void => {
    if (idx < 0) errors.push(`Pick a column for ${label}.`);
    else if (idx >= cols) errors.push(`Column for ${label} is outside the sheet's ${cols} columns.`);
  };
  requireCol("fee/service name", mapping.nameCol);
  requireCol("department", mapping.deptCol);
  requireCol("current fee amount", mapping.feeCol);
  if (mapping.unitCol != null && mapping.unitCol >= cols) {
    errors.push(`Unit column is outside the sheet's ${cols} columns.`);
  }
  if (sheet.rowCount <= mapping.headerRowIndex + 1) {
    errors.push("Sheet has no data rows after the header.");
  }
  return errors;
}

export function excelToFeeExtraction(
  fileName: string,
  sheet: PreviewSheet,
  mapping: FeeColumnMapping,
  existing: Service[],
): ExcelToFeeResult {
  const existingByName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
  const now = new Date().toISOString();

  const mapped: ExtractedRow<Service>[] = [];
  const duplicates: ExtractedRow<Service>[] = [];
  const warnings: ExcelFeeWarning[] = [];
  let skipped = 0;

  const data = sheet.rows.slice(mapping.headerRowIndex + 1);

  data.forEach((row, i) => {
    // Source row number as the analyst sees it in Excel (1-based, accounting
    // for the header offset). +2 = +1 to skip header + +1 to go from 0-based.
    const sourceRow = mapping.headerRowIndex + i + 2;

    const nameCell = row[mapping.nameCol];
    const deptCell = row[mapping.deptCol];
    const feeCell = row[mapping.feeCol];
    const unitCell = mapping.unitCol != null ? row[mapping.unitCol] : null;

    // Skip rows that look like trailing blanks — common at the bottom of
    // fee schedules (footers, formatting padding). NOT a warning.
    if (isBlankCell(nameCell) && isBlankCell(deptCell) && isBlankCell(feeCell)) {
      skipped += 1;
      return;
    }

    const name = cellToString(nameCell).trim();
    if (!name) {
      warnings.push({ row: sourceRow, reason: "Missing fee/service name." });
      skipped += 1;
      return;
    }

    const dept = normDept(cellToString(deptCell));
    if (!dept) {
      warnings.push({ row: sourceRow, reason: `Unknown department "${cellToString(deptCell)}".` });
      skipped += 1;
      return;
    }

    const fee = cellToFee(feeCell);
    if (fee == null) {
      warnings.push({ row: sourceRow, reason: `Could not read fee amount "${cellToString(feeCell)}".` });
      skipped += 1;
      return;
    }

    const unitOption = mapping.unitCol != null && !isBlankCell(unitCell)
      ? mapLegacyUnit(cellToString(unitCell))
      : undefined;
    const unitPatch = unitOption
      ? { unitLabel: unitOption.label, unitType: unitOption.type }
      : {};

    const lineage: SourceLineage = {
      file: fileName,
      sheet: sheet.name,
      row: sourceRow,
      rawCells: {
        name: cellToString(nameCell),
        dept: cellToString(deptCell),
        fee,
        unit: mapping.unitCol != null ? cellToString(unitCell) : null,
      },
      confidence: "high",
      importedAt: now,
    };

    const existingSvc = existingByName.get(name.toLowerCase());
    const entity: Service = existingSvc
      ? { ...existingSvc, fee, ...unitPatch }
      : {
          id: newServiceId(dept, name),
          name,
          dept,
          fee,
          peer: 0,
          target: 100,
          hours: 0,
          volume: 0,
          cost: 0,
          ...unitPatch,
          source: "imported",
          sourceFile: fileName,
        };

    const extracted = { entity, lineage };
    if (existingSvc) duplicates.push(extracted);
    else mapped.push(extracted);
  });

  const extraction: ExtractionResult<Service> = {
    mapped,
    lowConfidence: [],
    unmapped: [],
    duplicates,
    stats: {
      total: data.length,
      mapped: mapped.length,
      lowConfidence: 0,
      unmapped: 0,
      duplicates: duplicates.length,
      detected: `Fee schedule (Excel · ${sheet.name})`,
    },
  };

  return {
    extraction,
    warnings,
    importedRowCount: mapped.length + duplicates.length,
    skippedRowCount: skipped,
  };
}

function isBlankCell(v: PreviewCell): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

function cellToString(v: PreviewCell): string {
  if (v == null) return "";
  return String(v);
}

/** Coerce a cell to a finite fee amount, or null if it can't read.
 *  Accepts numbers directly; strings are stripped of common currency
 *  formatting ($, commas, whitespace) before parsing. Empty / blank
 *  cells return null so the caller can warn. */
function cellToFee(v: PreviewCell): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,\s]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normDept(v: string): Service["dept"] | null {
  const s = v.trim().toUpperCase();
  if ((FEE_DEPTS as readonly string[]).includes(s)) return s as Service["dept"];
  return null;
}
