/* Parser and extractor types shared across the import pipeline. */

/** Per-imported-row lineage. Kept on BuildContext keyed by domain + id. */
export interface SourceLineage {
  file: string;
  sheet?: string;
  page?: number;
  /** Sheet row index (1-based) or PDF line number. Strings allowed for codes. */
  row?: number | string;
  /** Per-column raw values from the source — drives the source drilldown. */
  rawCells?: Record<string, string | number | null>;
  confidence: Confidence;
  importedAt: string;
}

type Confidence = "high" | "med" | "low" | "review";

/** Output of any extractor — typed rows, plus rows that need user attention. */
export interface ExtractionResult<T> {
  /** Rows the extractor mapped with at least medium confidence. */
  mapped: ExtractedRow<T>[];
  /** Rows that pattern-matched the layout but failed individual checks. */
  lowConfidence: ExtractedRow<T>[];
  /** Rows that didn't match the target schema at all — for manual review. */
  unmapped: UnmappedRow[];
  /** Mapped rows that collide with an existing id — caller decides merge/skip. */
  duplicates: ExtractedRow<T>[];
  /** Source-file-level stats for the StatusRow. */
  stats: ExtractionStats;
}

interface ExtractionStats {
  /** Total raw rows considered (excludes blank rows + headers). */
  total: number;
  mapped: number;
  lowConfidence: number;
  unmapped: number;
  duplicates: number;
  /** Optional detected-format note shown in the dropzone provenance. */
  detected?: string;
}

export interface ExtractedRow<T> {
  /** The typed domain entity ready to merge into context state. */
  entity: T;
  lineage: SourceLineage;
}

export interface UnmappedRow {
  reason: "schema-mismatch" | "missing-required-field" | "ambiguous-dept" | "blank";
  raw: (string | number | null)[];
  lineage: SourceLineage;
}

/** What the DropZone reports back after a parse+extract cycle. */
export interface ImportApplyResult {
  domain:
    | "positions" | "operating" | "services"
    | "fees" | "workload" | "cap";
  fileName: string;
  detected?: string;
  rows: number;
  mapped: number;
  lowConfidence: number;
  unmapped: number;
  duplicates: number;
  warnings: string[];
}
