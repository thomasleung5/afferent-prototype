/* Convert an Excel-preview sheet + column mapping into the same
 * `ExtractionResult<Service>` shape the existing Fee Schedule merge
 * path (mergeFeeSchedule → mergeImportedServices) already consumes.
 *
 * Mirrors `feesToExtractionResult` in lib/ai/parseFees.ts but with
 * deterministic, Excel-flavored lineage (real sheet name + real
 * source row number, instead of "AI parsed" / sequential index).
 * Successfully-mapped rows carry `confidence: "high"` because this
 * path is NOT AI-backed — the user explicitly mapped each column.
 *
 * Rows that fail validation (missing name, unknown dept, invalid
 * fee) are routed to BOTH:
 *   - `extraction.unmapped` (persistent — flows through
 *     mergeFeeSchedule → pendingReview.fees → Fee Study export's
 *     Review Flags sheet) with reason codes from the shared
 *     UnmappedRow vocabulary.
 *   - `warnings` (session-local — drives the inline "Skipped rows"
 *     panel in the import UI for immediate feedback).
 * Both surfaces are kept so an analyst sees what was dropped right
 * after import AND can still find those rows in the review queue
 * later. */

import type { Service } from "@/lib/types";
import type {
  ExtractedRow, ExtractionResult, SourceLineage, UnmappedRow,
} from "@/lib/parse/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import { mapLegacyUnit } from "@/lib/data/feeUnits";
import { newServiceId } from "@/lib/ai/serviceId";
import type { PreviewCell, PreviewSheet } from "@/lib/import/excelPreview";
import {
  autoMapSheet, cellToNumber, cellToString, isBlankCell, normalizeDept,
  type RoleSpec,
} from "@/lib/import/excelMappingCore";

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

/** Deterministic auto-detection of header row + column roles for a fee
 *  schedule sheet. Synonym sets below cover the headers we see most
 *  often in city fee schedules:
 *    - name: `name`, `service`, `service name`, `fee item`, `fee/service name`
 *    - dept: `dept`, `department`, `division`
 *    - fee:  `fee`, `amount`, `current fee`, `adopted fee`, `price`, `rate`
 *    - unit: `unit`, `basis`, `fee basis`, `pricing unit`
 *
 *  Header normalization is case-insensitive, treats punctuation as
 *  whitespace, and collapses repeats — so "Fee / Service Name",
 *  "FEE_ITEM", and "Service-Name" all match the listed labels. The
 *  algorithm scans the first ~10 rows for the row with the most
 *  recognized headers; ties favor the earlier row. Per-column matching
 *  is left-to-right, first-match-wins, so duplicate headers don't
 *  steal each other's roles. */
export interface FeeAutoMapping {
  headerRowIndex: number;
  /** -1 when no match; UI translates this to its UNSET sentinel. */
  nameCol: number;
  deptCol: number;
  feeCol: number;
  unitCol: number;
  detected: { name: boolean; dept: boolean; fee: boolean; unit: boolean };
}

type FeeRole = "name" | "dept" | "fee" | "unit";

const FEE_ROLES: RoleSpec<FeeRole>[] = [
  { role: "name", synonyms: new Set([
    "name", "service", "service name", "fee item", "fee service name",
  ]) },
  { role: "dept", synonyms: new Set([
    "dept", "department", "division",
  ]) },
  { role: "fee", synonyms: new Set([
    "fee", "amount", "current fee", "adopted fee", "price", "rate",
  ]) },
  { role: "unit", synonyms: new Set([
    "unit", "basis", "fee basis", "pricing unit",
  ]) },
];

export function autoMapFees(sheet: PreviewSheet): FeeAutoMapping {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const result = autoMapSheet(rows, FEE_ROLES);
  return {
    headerRowIndex: result.headerRowIndex,
    nameCol: result.cols.name,
    deptCol: result.cols.dept,
    feeCol:  result.cols.fee,
    unitCol: result.cols.unit,
    detected: result.detected,
  };
}

interface ExcelFeeWarning {
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
 *  applyable — call `excelToFeeExtraction` next.
 *
 *  Defensively normalizes `sheet.rows`, `rowCount`, and `columnCount`
 *  so a malformed preview payload produces clear mapping errors rather
 *  than runtime exceptions. */
export function validateFeeMapping(
  sheet: PreviewSheet,
  mapping: FeeColumnMapping,
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
  if (cols === 0) {
    errors.push("Sheet has no columns to map.");
  }

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
  if (rowCount <= mapping.headerRowIndex + 1) {
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
  const unmapped: UnmappedRow[] = [];
  const warnings: ExcelFeeWarning[] = [];
  let skipped = 0;

  // Defensive: a malformed preview payload could in principle deliver
  // a sheet without `rows`. Normalize to an empty data section so the
  // caller gets an empty (but well-formed) extraction instead of a
  // crash — the UI's validateFeeMapping pass surfaces the underlying
  // problem to the user.
  const allRows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const data = allRows.slice(mapping.headerRowIndex + 1);

  // Build the rejection lineage from the same per-row fields the happy
  // path uses, so reviewers see the actual workbook values for every
  // dropped row.
  const buildRejectLineage = (
    sourceRow: number,
    row: PreviewCell[],
  ): SourceLineage => ({
    file: fileName,
    sheet: sheet.name,
    row: sourceRow,
    rawCells: {
      name: cellToString(row[mapping.nameCol]),
      dept: cellToString(row[mapping.deptCol]),
      fee: cellToString(row[mapping.feeCol]),
      unit: mapping.unitCol != null ? cellToString(row[mapping.unitCol]) : null,
    },
    confidence: "review",
    importedAt: now,
  });

  data.forEach((rawRow, i) => {
    // Source row number as the analyst sees it in Excel (1-based, accounting
    // for the header offset). +2 = +1 to skip header + +1 to go from 0-based.
    const sourceRow = mapping.headerRowIndex + i + 2;

    // Tolerate ragged rows / out-of-range column indexes — `[]` falls
    // through to the cell-level "missing field" / "invalid fee" branches
    // instead of throwing on .length access.
    const row = Array.isArray(rawRow) ? rawRow : [];

    const nameCell = row[mapping.nameCol];
    const deptCell = row[mapping.deptCol];
    const feeCell = row[mapping.feeCol];
    const unitCell = mapping.unitCol != null ? row[mapping.unitCol] : null;

    // Skip rows that look like trailing blanks — common at the bottom of
    // fee schedules (footers, formatting padding). NOT a warning, not
    // routed to review; those rows carry no analyst-actionable data.
    if (isBlankCell(nameCell) && isBlankCell(deptCell) && isBlankCell(feeCell)) {
      skipped += 1;
      return;
    }

    const rawArr = [
      cellToString(nameCell),
      cellToString(deptCell),
      cellToString(feeCell),
      mapping.unitCol != null ? cellToString(unitCell) : "",
    ];

    const name = cellToString(nameCell).trim();
    if (!name) {
      const reason = "Missing fee/service name.";
      warnings.push({ row: sourceRow, reason });
      unmapped.push({
        reason: "missing-required-field",
        raw: rawArr,
        lineage: buildRejectLineage(sourceRow, row),
      });
      skipped += 1;
      return;
    }

    const dept = normalizeDept(cellToString(deptCell), FEE_DEPTS as readonly string[]) as Service["dept"] | null;
    if (!dept) {
      const reason = `Unknown department "${cellToString(deptCell)}".`;
      warnings.push({ row: sourceRow, reason });
      unmapped.push({
        reason: "ambiguous-dept",
        raw: rawArr,
        lineage: buildRejectLineage(sourceRow, row),
      });
      skipped += 1;
      return;
    }

    const fee = cellToNumber(feeCell);
    if (fee == null) {
      const reason = `Could not read fee amount "${cellToString(feeCell)}".`;
      warnings.push({ row: sourceRow, reason });
      unmapped.push({
        reason: "schema-mismatch",
        raw: rawArr,
        lineage: buildRejectLineage(sourceRow, row),
      });
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
    unmapped,
    duplicates,
    stats: {
      total: data.length,
      mapped: mapped.length,
      lowConfidence: 0,
      unmapped: unmapped.length,
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

