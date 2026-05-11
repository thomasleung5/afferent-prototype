/* Types shared between the AI server route and the client review queue. */

import type { Domain } from "@/features/build/BuildContext";
import type { SourceLineage } from "@/lib/parse";

export type AiConfidence = "high" | "med" | "low";

/** One suggestion returned by the AI extractor for a single raw row.
 *  The `entity` shape varies by domain — caller narrows on `domain`. */
export interface AiSuggestion {
  /** Stable id so the review queue can key/dismiss correctly. */
  id: string;
  /** Index back into the original unmapped queue, so accept can clear it. */
  sourceIndex: number;
  domain: Domain;
  /** Free-text label shown in the review row, e.g. position title or fee name. */
  label: string;
  /** Plain English reasoning Claude returned. */
  reasoning: string;
  confidence: AiConfidence;
  /** The structured entity the AI proposes. Caller validates by domain. */
  entity: Record<string, string | number | boolean | null>;
  /** Preserved source lineage from the original unmapped row. */
  lineage: SourceLineage;
}

export interface AiExtractRequest {
  domain: Domain;
  /** Sheet/page headers from the source document — gives the AI context. */
  headers: string[];
  /** Raw unmapped rows that need interpretation. */
  rows: {
    /** Index into the caller's unmapped queue. */
    index: number;
    /** Raw cells as strings/numbers. */
    cells: (string | number | null)[];
    /** Reason the local extractor flagged this row. */
    reason: string;
    lineage: SourceLineage;
  }[];
  /** Optional sample of existing model rows so the AI matches the same shape. */
  examples?: { domain: Domain; sample: Record<string, unknown>[] };
}

export interface AiExtractResponse {
  ok: boolean;
  /** Present when ok=true. */
  suggestions?: AiSuggestion[];
  /** Present when ok=false. Plain English so the UI can show it inline. */
  message?: string;
  /** Internal status — used by the client to render different states. */
  status?: "ok" | "no-api-key" | "model-error" | "no-suggestions";
}
