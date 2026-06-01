/* Domain-spec contract for the generic Excel import flow.
 *
 * Each Source-Data domain (fees / services / volume / labor / operating)
 * supplies one of these to drive the shared `<ExcelImportCard/>` UI.
 * The card itself owns sheet-picker / header-row-picker / column
 * dropdowns / live preview / Import button / status messages. The
 * spec wires those generic affordances to domain-specific:
 *
 *   - column roles (name vs title, fee vs amount, etc.)
 *   - synonym sets for auto-detection
 *   - row-level validation + entity construction
 *   - the store action that merges the resulting ExtractionResult
 *   - the preview-row shape rendered after mapping
 *
 * Mapping state on the UI side is a flat `Record<RoleKey, number>` —
 * each role has one column index, `-1` when unset. Header row is
 * stored separately as 1-based.
 */

import type { ExtractionResult, ImportApplyResult } from "@/lib/parse/types";
import type { PreviewSheet } from "@/lib/import/excelPreview";

/** A column role the user picks from a sheet (e.g. "name", "dept",
 *  "fee"). Required roles MUST resolve before the Import button
 *  enables; optional roles can stay unset. */
export interface RoleDef {
  key: string;
  label: string;
  optional?: boolean;
}

export type RoleColumns = Record<string, number>;

export interface DomainMapping {
  headerRowIndex: number;
  cols: RoleColumns;
}

export interface DomainAutoMapping extends DomainMapping {
  detected: Record<string, boolean>;
}

export interface ExcelImportWarning {
  row: number;
  reason: string;
}

export interface DomainConvertResult<Entity> {
  extraction: ExtractionResult<Entity>;
  warnings: ExcelImportWarning[];
  importedRowCount: number;
  skippedRowCount: number;
}

export interface PreviewColumn {
  label: string;
  /** Defaults to "left". Use "right" for numeric columns. */
  align?: "left" | "right";
  value: string | number;
}

/** Driven by `useExcelImport(spec)` and consumed by `<ExcelMappingPanel/>`.
 *  Each domain hooks in via this spec; the card is fully generic. */
export interface ExcelImportDomainSpec<Entity> {
  /** Display noun used in status messages ("Imported 12 fees", "Imported 3 positions"). */
  noun: { singular: string; plural: string };

  /** Column roles in display order. */
  roles: RoleDef[];

  /** Auto-detect header row + per-role columns from a sheet. */
  autoMap: (sheet: PreviewSheet) => DomainAutoMapping;

  /** Return user-facing mapping errors (missing required column, bad
   *  header row, etc.). Empty array means the mapping is applyable. */
  validate: (sheet: PreviewSheet, mapping: DomainMapping) => string[];

  /** Convert preview + mapping into the same ExtractionResult shape
   *  the existing store actions already consume. */
  convert: (
    fileName: string,
    sheet: PreviewSheet,
    mapping: DomainMapping,
  ) => DomainConvertResult<Entity>;

  /** Apply the extraction via the appropriate store action.
   *  Returns the ImportApplyResult so the UI can quote merge stats. */
  applyMerge: (
    extraction: ExtractionResult<Entity>,
    fileName: string,
  ) => ImportApplyResult;

  /** Per-entity preview cells shown in the post-mapping sample table.
   *  Should match the spec's `previewHeaders` length. */
  previewRow: (entity: Entity) => PreviewColumn[];

  /** Headers for the sample preview table. Length must match the
   *  arrays returned by `previewRow`. */
  previewHeaders: { label: string; align?: "left" | "right" }[];

  /** Whether an entity in the extraction represents an UPDATE to an
   *  existing record (rendered as "Update" vs "New" in the sample). */
  isUpdate?: (entity: Entity, extraction: ExtractionResult<Entity>) => boolean;
}
