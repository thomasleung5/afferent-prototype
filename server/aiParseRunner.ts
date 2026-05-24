/* Shared scaffolding for the Anthropic-backed PDF parse routes.
 *
 * The five "simple" parsers (fees, salary, operating, services,
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

  let form: FormData;
  let pdfBase64: string;
  let fileName: string;
  let fileSizeKb: number;
  try {
    form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return json({ ok: false, message: "No file provided." }, { status: 400 });
    fileName = file.name;
    fileSizeKb = Math.round(file.size / 1024);
    const buf = await file.arrayBuffer();
    pdfBase64 = Buffer.from(buf).toString("base64");
  } catch {
    return json({ ok: false, message: "Could not read uploaded file." }, { status: 400 });
  }

  let system: string;
  try {
    system = buildSystem(form);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build system prompt.";
    return json({ ok: false, message }, { status: 400 });
  }

  console.log(`[${spec.tag}] Received ${fileName} (${fileSizeKb} KB) — sending to ${MODEL}…`);
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
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const text = response.content.find((c) => c.type === "text")?.text ?? "";
    console.log(`[${spec.tag}] Response received in ${elapsed}s (${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[${spec.tag}] No JSON in response. Raw: ${text.slice(0, 300)}`);
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

    console.log(`[${spec.tag}] Parsed ${rows.length} ${spec.rowNoun} rows from ${fileName}`);
    return json({ ok: true, [spec.rowsKey]: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    console.error(`[${spec.tag}] Error: ${message}`);
    return json({ ok: false, message }, { status: 502 });
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
