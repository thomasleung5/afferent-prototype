/* Shared types for the import pipeline.
 *
 * The pipeline is:
 *
 *   ParsedDoc            from lib/parse — already exists, format-agnostic
 *        ↓
 *   classify()           lib/import/classify.ts → DocumentClassification
 *        ↓
 *   extract()            lib/import/extract/*.ts → ExtractedDocument
 *        ↓
 *   normalize()          lib/import/normalize.ts (applied during map)
 *        ↓
 *   map()                lib/import/map.ts → MappingCandidate[]
 *        ↓
 *   validate()           lib/import/validate.ts → ValidationIssue[]
 *        ↓
 *   ImportBatch          combined snapshot the UI consumes
 *
 * The intermediate ExtractedRow shape is deliberately decoupled from any
 * target table — extractors should never reject rows for "missing required
 * field" before mapping has a chance to run. */

import type { ParsedDoc } from "@/lib/parse/types";

/* ── Document types ─────────────────────────────────────────────────────── */

export type DocumentType =
  | "fee_schedule"
  | "prior_fee_study"
  | "budget_book"
  | "salary_roster"
  | "operating_budget"
  | "cost_allocation_plan"
  | "workload_export"
  | "benchmark_fee_schedule"
  | "unknown";

export type ConfidenceLabel = "high" | "med" | "low";

export interface DocumentClassification {
  documentType: DocumentType;
  /** 0..1. < 0.25 means we shouldn't auto-route — let the user pick. */
  confidence: number;
  /** Jurisdiction inferred from filename or PDF header (e.g. "Los Altos Hills"). */
  jurisdiction?: string;
  /** Fiscal year token, normalized to "FY 2026-27" form when detected. */
  fiscalYear?: string;
  /** Department(s) the document is scoped to, when inferable. */
  department?: string;
  /** Distinct section labels detected (e.g. "PLANNING DEPARTMENT", "Inspections"). */
  detectedSections: string[];
  /** Short human-readable explanation of the signals used. */
  reason: string;
}

/* ── Extracted document tree ────────────────────────────────────────────── */

/** Output of an extractor. Captures the document's natural structure
 *  (sections + rows + notes) without committing to any target table. */
export interface ExtractedDocument {
  documentType: DocumentType;
  sourceFile: string;
  sections: ExtractedSection[];
  /** Rows whose section wasn't determined — typically the top of the file. */
  unsectioned: ExtractedRow[];
  /** Document-level notes (narrative paragraphs, footnotes). */
  notes: string[];
  /** Free-text reasons the extractor logged — for the debug panel. */
  parseWarnings: string[];
}

export interface ExtractedSection {
  /** Section header text as it appeared (e.g. "PLANNING DEPARTMENT"). */
  label: string;
  /** Normalized section name when recognizable (e.g. "Planning"). */
  normalized?: string;
  rows: ExtractedRow[];
  /** Subtotal or total line at the bottom of the section, when present. */
  subtotal?: { label: string; amount: number };
}

/** The fundamental unit of extracted data — purposely loose so that fee+deposit
 *  pairs, hourly rates, and narrative notes all fit through the same shape.
 *  Mapping decides which target tables this candidates for. */
export interface ExtractedRow {
  id: string;
  /** The label as it appeared in the source. */
  rawLabel: string;
  /** Raw cell array (csv/xlsx) or token sequence (pdf). */
  rawCells: (string | number | null)[];
  /** First parsed numeric value found in the row, when applicable. */
  parsedValue?: number;
  /** Unit hint when present (e.g. "per acre", "per hour", "each"). */
  unit?: string;
  /** Free-text note column or trailing parenthetical. */
  note?: string;
  /** When the document mixes fee + deposit, this row's typology. */
  rowType?: ExtractedRowType;
  /** Provenance — required for traceability. */
  source: ExtractedRowSource;
  /** Auxiliary parsed fields the extractor surfaced (numerics by key). */
  fields?: Record<string, string | number | null>;
  /** Why the extractor flagged this row, if anything. */
  warnings?: string[];
  /** Extractor's confidence in the row itself (not the mapping). */
  confidence: ConfidenceLabel;
}

export type ExtractedRowType =
  | "fixed_fee"
  | "deposit"
  | "fee_plus_deposit"
  | "hourly_rate"
  | "per_unit_fee"
  | "actual_cost"
  | "formula_or_multiplier"
  | "note_only"
  | "subtotal"
  | "section_header"
  | "position"
  | "account_line"
  | "cap_pool"
  | "cap_basis"
  | "workload_row"
  | "service_row"
  | "unknown";

export interface ExtractedRowSource {
  file: string;
  /** Sheet name for csv/xlsx. */
  sheet?: string;
  /** Page number for pdf. */
  page?: number;
  /** 1-based row index inside the sheet or page. */
  row?: number | string;
  /** Section the row belongs to, if any. */
  section?: string;
}

/* ── Mapping engine ─────────────────────────────────────────────────────── */

export type TargetTable =
  | "positions" | "operating" | "services" | "fees" | "workload" | "cap";

export type MappingStatus =
  | "auto_accepted"
  | "needs_review"
  | "unresolved"
  | "rejected"
  | "accepted_after_edit";

export interface MappingCandidate {
  id: string;
  extractedRowId: string;
  sourceLabel: string;
  proposedTargetTable: TargetTable | null;
  /** Existing target row id when this is a patch, undefined when it's a new row. */
  proposedTargetId?: string;
  /** Label that will be used for the new/patched row. */
  proposedTargetLabel: string;
  /** 0..1 — confidence in this mapping specifically (not the extraction). */
  confidence: number;
  /** Short rationale: which alias matched, which field is missing, etc. */
  mappingReason: string;
  /** Target-table fields that the row can't supply. */
  requiredMissingFields: string[];
  /** Proposed entity payload — same shape mergeXxx actions expect. */
  proposedEntity: Record<string, string | number | boolean | null | undefined>;
  status: MappingStatus;
}

/* ── Validation ─────────────────────────────────────────────────────────── */

export type ValidationCode =
  | "missing_required_field"
  | "low_confidence"
  | "duplicate_row"
  | "unmatched_department"
  | "unmatched_service"
  | "invalid_amount"
  | "total_reconciliation_warning"
  | "unsupported_row_type"
  | "ambiguous_mapping"
  | "source_parse_warning";

export type ValidationSeverity = "INFO" | "REVIEW" | "ERROR" | "READY";

export interface ValidationIssue {
  code: ValidationCode;
  severity: ValidationSeverity;
  /** Free-text message intended for the review card. */
  message: string;
  /** Which extracted row this is about, when row-scoped. */
  extractedRowId?: string;
  /** Which mapping candidate this is about. */
  mappingCandidateId?: string;
  /** Optional structured details — surfaced in the debug panel. */
  details?: Record<string, string | number | null>;
}

/* ── Pipeline output ────────────────────────────────────────────────────── */

/** A single import attempt — the complete snapshot the UI needs to render
 *  classification, extracted rows, mappings, validation, and writeback. */
export interface ImportBatch {
  id: string;
  sourceFile: string;
  /** The parsed file as it came back from lib/parse. Kept on the batch for
   *  the debug panel. */
  parsed: ParsedDoc;
  classification: DocumentClassification;
  extracted: ExtractedDocument;
  mappings: MappingCandidate[];
  issues: ValidationIssue[];
  /** Overall verdict for the batch — drives the top-level StatusPill. */
  status: ValidationSeverity;
  /** ISO timestamp the pipeline finished. */
  finishedAt: string;
}

/** A user's decision recorded for a single mapping candidate. Persisted on
 *  the store for the audit trail and replay. */
export interface ImportDecision {
  mappingCandidateId: string;
  status: MappingStatus;
  /** Override fields the user typed before accepting. */
  override?: Record<string, string | number | boolean | null>;
  decidedAt: string;
}
