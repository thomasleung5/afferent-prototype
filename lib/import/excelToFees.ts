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

const NAME_SYNONYMS = new Set([
  "name", "service", "service name", "fee item", "fee service name",
]);
const DEPT_SYNONYMS = new Set([
  "dept", "department", "division",
]);
const FEE_SYNONYMS = new Set([
  "fee", "amount", "current fee", "adopted fee", "price", "rate",
]);
const UNIT_SYNONYMS = new Set([
  "unit", "basis", "fee basis", "pricing unit",
]);

const HEADER_SCAN_ROWS = 10;
/** A row needs at least this many recognized headers to count as a
 *  header row. Picking 2 means a sparse first row with one stray match
 *  ("Fee" alone) doesn't get crowned, while still catching the common
 *  3-or-4-column schedules. */
const HEADER_MIN_MATCHES = 2;

export function autoMapFees(sheet: PreviewSheet): FeeAutoMapping {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const empty: FeeAutoMapping = {
    headerRowIndex: 0,
    nameCol: -1, deptCol: -1, feeCol: -1, unitCol: -1,
    detected: { name: false, dept: false, fee: false, unit: false },
  };
  if (rows.length === 0) return empty;

  // Score each candidate row by how many recognized headers it contains.
  // Tie-breaker: earlier row wins, so a redundant repeat header band
  // (common in styled exports) doesn't shadow the real one.
  let bestRow = -1;
  let bestScore = 0;
  const scanLimit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < scanLimit; i++) {
    const score = headerScore(rows[i]);
    if (score > bestScore) {
      bestRow = i;
      bestScore = score;
    }
  }
  const headerRowIndex = bestScore >= HEADER_MIN_MATCHES ? bestRow : 0;
  const headerRow = rows[headerRowIndex] ?? [];

  let nameCol = -1, deptCol = -1, feeCol = -1, unitCol = -1;
  for (let c = 0; c < headerRow.length; c++) {
    const norm = normalizeHeader(headerRow[c]);
    if (norm === "") continue;
    if (nameCol < 0 && NAME_SYNONYMS.has(norm)) { nameCol = c; continue; }
    if (deptCol < 0 && DEPT_SYNONYMS.has(norm)) { deptCol = c; continue; }
    if (feeCol  < 0 && FEE_SYNONYMS.has(norm))  { feeCol  = c; continue; }
    if (unitCol < 0 && UNIT_SYNONYMS.has(norm)) { unitCol = c; continue; }
  }

  return {
    headerRowIndex,
    nameCol, deptCol, feeCol, unitCol,
    detected: {
      name: nameCol >= 0,
      dept: deptCol >= 0,
      fee:  feeCol  >= 0,
      unit: unitCol >= 0,
    },
  };
}

function headerScore(row: PreviewCell[] | undefined): number {
  if (!Array.isArray(row)) return 0;
  let count = 0;
  for (const cell of row) {
    const norm = normalizeHeader(cell);
    if (norm === "") continue;
    if (NAME_SYNONYMS.has(norm) || DEPT_SYNONYMS.has(norm)
        || FEE_SYNONYMS.has(norm) || UNIT_SYNONYMS.has(norm)) {
      count += 1;
    }
  }
  return count;
}

/** Lowercase, replace non-alphanumeric runs with a single space, and
 *  trim. So "Fee / Service Name" → "fee service name", "FEE_ITEM" →
 *  "fee item", "Service-Name" → "service name". Numbers stay (no
 *  current synonyms use them, but they're harmless). */
function normalizeHeader(v: PreviewCell): string {
  if (v == null) return "";
  return String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

    const dept = normDept(cellToString(deptCell));
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

    const fee = cellToFee(feeCell);
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

  // Excel fee schedules often carry user-facing department names rather
  // than internal codes. Accept the common compact labels and registry
  // names so analysts don't have to pre-normalize "Planning" → "PLAN".
  const compact = s
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const aliases: Record<string, Service["dept"]> = {
    PLANNING: "PLAN",
    "PLANNING ADMINISTRATION": "PLAN",
    "PLANNING AND ZONING": "PLAN",
    BUILDING: "BLDG",
    "BUILDING ADMINISTRATION": "BLDG",
    "BUILDING SAFETY": "BLDG",
    "BUILDING AND SAFETY": "BLDG",
    ENGINEERING: "ENG",
    "ENGINEERING ADMINISTRATION": "ENG",
    "PUBLIC WORKS ENGINEERING": "ENG",
    PARKS: "PARKS",
    "PARKS RECREATION": "PARKS",
    "PARKS AND RECREATION": "PARKS",
    "PARKS RECREATION ADMINISTRATION": "PARKS",
    "PARKS AND RECREATION ADMINISTRATION": "PARKS",
    POLICE: "PD",
    "POLICE SERVICES": "PD",
    "POLICE SERVICES ADMINISTRATION": "PD",
    FIRE: "FIRE",
    "FIRE PREVENTION": "FIRE",
    "FIRE PREVENTION ADMINISTRATION": "FIRE",
  };
  if (aliases[compact]) return aliases[compact];
  return null;
}
