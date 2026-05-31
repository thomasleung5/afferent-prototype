/* Shared scaffolding for the Anthropic-backed PDF parse routes.
 *
 * The five "simple" parsers (fees, labor, operating, services,
 * volume) each follow the same pipeline:
 *
 *   1. Verify ANTHROPIC_API_KEY is set.
 *   2. Read a multipart form, pull out the PDF, base64 it.
 *   3. Build the domain-specific system prompt (services reads a
 *      catalog hint from the same form).
 *   4. Call Anthropic with the PDF as a `document` block.
 *   5. Extract a JSON object from the model's reply, or fall back to
 *      a per-row partial-recovery regex when the response was
 *      truncated mid-array.
 *   6. Return `{ ok: true, [rowsKey]: rows }`.
 *
 * This module owns steps 1, 2, 4, 5, 6 plus the consistent log
 * tagging and error shape. Each handler keeps its own SYSTEM prompt,
 * row interface, and any per-route form fields (e.g. services'
 * catalog).
 *
 * aiParseCap stays self-contained — its response is a five-section
 * bundle, not a single row array, so it doesn't fit `rowsKey`. */

import Anthropic from "@anthropic-ai/sdk";
import { readPdfUpload } from "./aiUploadValidator";
import { logEvent } from "./logger";

const MODEL = "claude-sonnet-4-6";

/** Per-domain knobs the runner needs to tag logs, locate the row
 *  array in the model's JSON response, and build the partial-recovery
 *  regex when the response is truncated. */
export interface ParserSpec {
  /** Log-line prefix, e.g. "ai-parse-fees". */
  tag: string;
  /** Top-level key in both the Anthropic response and the route's
   *  response body. e.g. "fees", "positions", "operating". */
  rowsKey: string;
  /** Field name expected on every row; used to recover individual
   *  rows from a truncated JSON response. e.g. "name", "title",
   *  "line". */
  rowAnchor: string;
  /** Singular human-readable label, used in user-facing error
   *  messages. e.g. "fee" → "no complete fee rows could be recovered". */
  rowNoun: string;
}

interface ResponseBody {
  ok: boolean;
  message?: string;
  /** When ok=true the runner adds `[rowsKey]: rows[]` dynamically. */
  [key: string]: unknown;
}

function json(body: ResponseBody, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

/** Run the canonical PDF-parse pipeline for a single-section parser.
 *  `buildSystem` lets the caller construct the prompt from form
 *  fields (for services' catalog hint); most callers ignore the form
 *  and just return a static string. */
export async function runPdfParser(
  req: Request,
  spec: ParserSpec,
  buildSystem: (form: FormData) => string,
): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({
      ok: false,
      message: "AI parsing is not configured. Set ANTHROPIC_API_KEY in .env.local to enable it.",
    }, { status: 503 });
  }

  const upload = await readPdfUpload(req);
  if (upload instanceof Response) return upload;
  const { form, fileName, fileSizeKb, base64: pdfBase64 } = upload;

  let system: string;
  try {
    system = buildSystem(form);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build system prompt.";
    return json({ ok: false, message }, { status: 400 });
  }

  logEvent({
    tag: spec.tag,
    msg: "anthropic request start",
    file: fileName, file_kb: fileSizeKb, model: MODEL,
  });
  const t0 = Date.now();

  const client = new Anthropic({ apiKey, timeout: 10 * 60 * 1000 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: [{
        role: "user",
        content: [{
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        }],
      }],
    }, {
      // Propagate the client's disconnect signal so when the SPA tab
      // closes mid-parse we stop billing for output tokens the user
      // will never see.
      signal: req.signal,
    });

    const elapsed_ms = Date.now() - t0;
    const text = response.content.find((c) => c.type === "text")?.text ?? "";
    logEvent({
      tag: spec.tag,
      msg: "anthropic response",
      latency_ms: elapsed_ms,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logEvent({
        level: "error", tag: spec.tag,
        msg: "no JSON in model response",
        raw_preview: text.slice(0, 300),
      });
      return json({
        ok: false,
        message: `Model returned no JSON. Raw: ${text.slice(0, 200)}`,
      }, { status: 502 });
    }

    const rows = parseRowsOrRecover(jsonMatch[0], spec);
    if (rows === null) {
      return json({
        ok: false,
        message: `Response was truncated and no complete ${spec.rowNoun} rows could be recovered. Try a shorter document.`,
      }, { status: 502 });
    }

    logEvent({
      tag: spec.tag,
      msg: "parsed rows",
      row_count: rows.length,
      row_noun: spec.rowNoun,
      file: fileName,
    });
    return json({ ok: true, [spec.rowsKey]: rows });
  } catch (err) {
    // AbortError fires when the client disconnects — log at info, not
    // error, since this is a normal outcome of the user navigating away.
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Unknown model error.";
    logEvent({
      level: aborted ? "info" : "error",
      tag: spec.tag,
      msg: aborted ? "request aborted by client" : "anthropic error",
      error: message,
      latency_ms: Date.now() - t0,
    });
    return json({ ok: false, message }, { status: aborted ? 499 : 502 });
  }
}

/** First try a normal JSON.parse on the whole matched object and pull
 *  out `[rowsKey]`. If that fails (Anthropic truncated mid-array
 *  because we hit max_tokens), scan for every brace-balanced object
 *  containing the anchor field and parse each individually. Returns
 *  null only when zero rows could be recovered.
 *
 *  Exported for fixture testing — server runtime callers only use it
 *  via `runPdfParser`. */
export function parseRowsOrRecover(jsonText: string, spec: ParserSpec): unknown[] | null {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const rows = parsed[spec.rowsKey];
    if (Array.isArray(rows)) return rows;
  } catch {
    /* fall through to partial recovery */
  }
  const anchorPattern = new RegExp(
    `\\{[^{}]*"${spec.rowAnchor}"\\s*:[^{}]*\\}`,
    "g",
  );
  const partial = jsonText.matchAll(anchorPattern);
  const rows: unknown[] = [];
  for (const m of partial) {
    try { rows.push(JSON.parse(m[0])); } catch { /* skip malformed */ }
  }
  if (rows.length === 0) return null;
  console.warn(`[${spec.tag}] Response truncated — recovered ${rows.length} partial rows`);
  return rows;
}
