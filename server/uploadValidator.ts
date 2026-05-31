/* Generic multipart-upload validator.
 *
 * Owns the file-format-agnostic upload pipeline that every parse route
 * needs:
 *
 *   1. Body is multipart/form-data and parses.
 *   2. A `file` field is present.
 *   3. The file is within MAX_UPLOAD_MB (default 20 MB; override via
 *      env `MAX_UPLOAD_MB`).
 *   4. The bytes read cleanly into an `ArrayBuffer`.
 *
 * Format-specific checks (MIME class, magic-byte sniff, base64 encoding
 * for the Anthropic SDK, etc.) live next door in `aiUploadValidator.ts`
 * so a Future Self adding Excel uploads can layer their own
 * Excel-specific validators on top of the same safe transport.
 *
 * Returns a discriminated `{ ok: true, ... }` payload with everything
 * a format-specific validator needs, or a fully-formed JSON Response
 * with the right HTTP status the route can return directly. Keeps the
 * `{ ok: false, message }` body shape consistent with the rest of the
 * AI route surface so the frontend doesn't have to learn a new format. */

const DEFAULT_MAX_UPLOAD_MB = 20;

export interface UploadOk {
  ok: true;
  form: FormData;
  file: File;
  fileName: string;
  fileSizeKb: number;
  /** Raw bytes of the uploaded file. Format-specific validators run
   *  magic-byte sniffs against this; downstream parsers consume it
   *  directly (PDF base64-encodes; Excel will decode the workbook
   *  ZIP container). */
  buffer: ArrayBuffer;
}

export interface UploadOptions {
  /** Override the env-driven default size cap. Pure-function escape
   *  hatch used by fixture tests. */
  maxBytes?: number;
}

/** Read + validate a multipart-form upload without making any
 *  assumptions about file format. Returns the parsed form, file,
 *  derived metadata, and the raw bytes for caller-side magic-byte
 *  sniffing. On any failure returns a complete JSON Response — the
 *  caller just returns it. */
export async function readUpload(
  req: Request,
  opts: UploadOptions = {},
): Promise<UploadOk | Response> {
  const maxBytes = opts.maxBytes ?? resolveMaxBytes();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Could not read uploaded file.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("No file provided.", 400);
  }

  if (file.size > maxBytes) {
    const limitMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return jsonError(`File exceeds ${limitMb} MB limit.`, 413);
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return jsonError("Could not read uploaded file.", 400);
  }

  return {
    ok: true,
    form,
    file,
    fileName: file.name,
    fileSizeKb: Math.round(file.size / 1024),
    buffer,
  };
}

/** Resolve the upload size cap from the environment. Invalid /
 *  non-positive values fall back to the default. Exposed so the Hono
 *  body-limit middleware in `server/index.ts` can use the same cap as
 *  the parsed-size gate (otherwise the streaming gate and the in-memory
 *  gate could disagree on the limit). */
export function resolveMaxBytes(): number {
  const raw = process.env.MAX_UPLOAD_MB;
  const parsed = raw != null ? Number(raw) : NaN;
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_MB;
  return mb * 1024 * 1024;
}

/** Build a JSON error Response with the shared `{ ok: false, message }`
 *  body shape. Exported so format-specific validators don't have to
 *  duplicate the response construction. */
export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
