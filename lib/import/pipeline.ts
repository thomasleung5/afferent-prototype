/* Pipeline orchestrator.
 *
 * Walks an upload through every stage and returns a single ImportBatch with
 * everything intact:  classification, the ExtractedDocument tree, mapping
 * candidates, validation issues, an overall status, and a finishedAt
 * timestamp. The UI binds to that batch directly — there is no other state
 * to thread through.
 *
 * Each stage can be swapped out without touching the others. New document
 * types add an extractor + (optional) tweaks to the mapping engine. */

import { parseFile } from "@/lib/parse";
import type { ParsedDoc } from "@/lib/parse/types";
import type { Service } from "@/lib/types";

import { classifyDocument } from "./classify";
import { extractFeeSchedule } from "./extract/feeSchedule";
import { mapExtractedDocument } from "./map";
import { validate } from "./validate";
import type {
  DocumentType, ExtractedDocument, ImportBatch,
} from "./types";

let batchIdSeq = 0;
const nextBatchId = () => `batch-${Date.now()}-${++batchIdSeq}`;

interface PipelineOptions {
  /** Required for mapping — used for fuzzy service name matches. */
  services: Service[];
  /** Override the classifier's detected type. Useful when the user picks
   *  manually in the Import Manager. */
  forceType?: DocumentType;
}

/** Run the full pipeline from a File. */
export async function runImportPipeline(
  file: File, opts: PipelineOptions,
): Promise<ImportBatch> {
  const parsed = await parseFile(file);
  return runImportPipelineFromParsed(parsed, opts);
}

/** Run the pipeline from an already-parsed doc. Used by tests and by the
 *  Import Manager when re-classifying after a user picks the type. */
export function runImportPipelineFromParsed(
  parsed: ParsedDoc, opts: PipelineOptions,
): ImportBatch {
  const classification = classifyDocument(parsed);
  const documentType = opts.forceType ?? classification.documentType;

  const extracted = extractFor(parsed, documentType);

  const mappings = mapExtractedDocument(extracted, { services: opts.services });
  const { issues, severity } = validate(extracted, mappings);

  return {
    id: nextBatchId(),
    sourceFile: parsed.fileName,
    parsed,
    classification: { ...classification, documentType },
    extracted,
    mappings,
    issues,
    status: severity,
    finishedAt: new Date().toISOString(),
  };
}

/** Extractor dispatch. Only fee_schedule + benchmark_fee_schedule are
 *  implemented here yet — other types come in PR 3. Falls back to a
 *  minimal extractor that surfaces parse warnings + an "unsupported"
 *  document so the UI still has something to render. */
function extractFor(parsed: ParsedDoc, documentType: DocumentType): ExtractedDocument {
  switch (documentType) {
    case "fee_schedule":
    case "benchmark_fee_schedule":
    case "prior_fee_study":
      return extractFeeSchedule(parsed);
    default:
      return {
        documentType,
        sourceFile: parsed.fileName,
        sections: [],
        unsectioned: [],
        notes: [],
        parseWarnings: [
          ...parsed.warnings,
          `Extractor for "${documentType}" not yet implemented in lib/import — falling back to passthrough.`,
        ],
      };
  }
}
