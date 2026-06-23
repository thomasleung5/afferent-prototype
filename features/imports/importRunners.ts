/* Shared import orchestration factories.
 *
 * Each domain's import wiring (parser, merge call, summary formatter,
 * any local review state) lives in sourceImportHandlers.ts. The
 * surrounding try/catch shape and fallback error messages were
 * identical across every domain, so this factory collapses that
 * boilerplate into one place.
 *
 * Source-tag convention: PDF imports use `file.name`. Codified here
 * so the convention can't drift. */

/** Standard return type for `onAiPdfImport` handlers. Consumers
 *  render the message inline with warn-tone styling when
 *  `ok === false`. */
export interface ImportResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// PDF handler factory
// ---------------------------------------------------------------------------

interface PdfParserResult {
  ok: boolean;
  message?: string;
}

interface PdfImportConfig<P extends PdfParserResult> {
  /** Domain-specific PDF parser (e.g. `aiParseLaborPdf`). When the
   *  page needs extra context (a services catalog, a target year),
   *  wrap the parser in a closure here. */
  parsePdf: (file: File) => Promise<P>;
  /** Convert the parser's result into a success message string. This
   *  is where the page calls its `convertTo…` + `merge…` functions
   *  and formats the per-import summary. Throw to surface an error. */
  apply: (parsed: P, fileName: string) => string | Promise<string>;
  /** Fires before parsing — use to reset any inline review-state
   *  before the new import runs (e.g. setUnmapped([])). */
  onStart?: () => void;
  /** Override for the "PDF extraction failed." fallback used when
   *  parsePdf resolves with ok=false and no message of its own. */
  parseFailureMessage?: string;
  /** Override for the catch-all "PDF import failed." used when a
   *  thrown error has no message. */
  importFailureMessage?: string;
}

/** Build a PDF import handler. Wraps parsePdf + apply in the
 *  canonical try/catch shape and standardizes the fallback messages. */
export function createPdfImportHandler<P extends PdfParserResult>(
  config: PdfImportConfig<P>,
): (file: File) => Promise<ImportResult> {
  const {
    parsePdf, apply, onStart,
    parseFailureMessage = "PDF extraction failed.",
    importFailureMessage = "PDF import failed.",
  } = config;
  return async (file) => {
    onStart?.();
    try {
      const result = await parsePdf(file);
      if (!result.ok) throw new Error(result.message ?? parseFailureMessage);
      const message = await apply(result, file.name);
      return { ok: true, message };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : importFailureMessage,
      };
    }
  };
}

