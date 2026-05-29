/* Shared import orchestration factories.
 *
 * Each domain's import wiring (parser, merge call, summary formatter,
 * any local review state) lives in sourceImportHandlers.ts. The
 * surrounding scaffolding — try/catch shape, clipboard JSON
 * extraction, root-key validation, "clipboard" source tag, fallback
 * error messages — was identical across every domain, so these
 * factories collapse that boilerplate into one place.
 *
 * Source-tag convention: PDF imports use `file.name`; clipboard
 * imports use the literal string `"clipboard"`. Codified here so the
 * convention can't drift. */

/** Standard return type for both handlers (`onAiPdfImport`,
 *  `onPasteJson`). Consumers render the message inline with warn-tone
 *  styling when `ok === false`. */
export interface ImportResult {
  ok: boolean;
  message: string;
}

/** Extract the first JSON object out of arbitrary clipboard text and
 *  parse it. Mirrors the regex every page was using to be resilient
 *  to surrounding prose ("Here's the JSON: { ... }"). Throws with the
 *  canonical "No JSON object found in clipboard." message when no
 *  object is found, or with JSON.parse's own SyntaxError when the
 *  matched text isn't valid JSON. */
export function extractJsonObject(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in clipboard.");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// PDF handler factory
// ---------------------------------------------------------------------------

interface PdfParserResult {
  ok: boolean;
  message?: string;
}

interface PdfImportConfig<P extends PdfParserResult> {
  /** Domain-specific PDF parser (e.g. `aiParseDirectLaborPdf`). When the
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

// ---------------------------------------------------------------------------
// JSON handler factory
// ---------------------------------------------------------------------------

interface JsonImportConfig {
  /** Required root key in the parsed JSON. When set, validates
   *  `parsed[rootKey]` is a non-empty array and passes that array to
   *  `apply`. Use for the common `{ services: [...] }` shape. */
  rootKey?: string;
  /** Custom validator for shapes that don't fit a single rootKey
   *  (e.g. CAP's `{ centers?, bases?, basisUnits?, pools?,
   *  directAllocations? }` where at least one section must be
   *  present). Receives the parsed object; throw to fail. Mutually
   *  exclusive with `rootKey`. */
  validate?: (parsed: Record<string, unknown>) => void;
  /** Apply the validated payload. Receives the rootKey array when
   *  `rootKey` was set, otherwise the full parsed object. Returns
   *  the success message. Always invoked with `source = "clipboard"`. */
  apply: (payload: unknown, source: "clipboard") => string | Promise<string>;
  /** Pre-parse hook — same purpose as PDF's onStart. */
  onStart?: () => void;
  /** Override for the catch-all "Failed to parse JSON." fallback. */
  importFailureMessage?: string;
}

/** Build a JSON paste handler. Handles clipboard text → JSON object
 *  extraction, optional rootKey validation, and the canonical
 *  try/catch shape. */
export function createJsonImportHandler(
  config: JsonImportConfig,
): (text: string) => Promise<ImportResult> {
  const {
    rootKey, validate, apply, onStart,
    importFailureMessage = "Failed to parse JSON.",
  } = config;
  return async (text) => {
    onStart?.();
    try {
      const parsed = extractJsonObject(text);
      let payload: unknown = parsed;
      if (rootKey) {
        const rows = parsed[rootKey];
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error(`Expected { "${rootKey}": [...] } structure.`);
        }
        payload = rows;
      } else if (validate) {
        validate(parsed);
      }
      const message = await apply(payload, "clipboard");
      return { ok: true, message };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : importFailureMessage,
      };
    }
  };
}
