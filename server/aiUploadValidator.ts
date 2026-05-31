/* Shared multipart-PDF upload validator for the AI parse routes.
 *
 * Runs the same five-check pipeline every parser needs before it can
 * call Anthropic:
 *
 *   1. Body is multipart/form-data and parses.
 *   2. A `file` field is present.
 *   3. The file is a PDF — checked by MIME type, with a `.pdf`
 *      extension fallback for clients that don't set content-type.
 *   4. The file is within MAX_UPLOAD_MB (default 20 MB; override via
 *      env `MAX_UPLOAD_MB`).
 *   5. The bytes read cleanly into a base64 string for the SDK.
 *
 * Returns a discriminated `{ ok: true, ... }` payload with everything
 * the parser needs, or a fully-formed JSON Response with the right
 * HTTP status the route can return directly. Keeps the existing
 * `{ ok: false, message }` body shape so the frontend doesn't need
 * to learn a new error format. */

const DEFAULT_MAX_UPLOAD_MB = 20;

export interface PdfUploadOk {
  ok: true;
  form: FormData;
  file: File;
  fileName: string;
  fileSizeKb: number;
  base64: string;
}

export interface PdfUploadOptions {
  /** Override the env-driven default size cap. Pure-function escape
   *  hatch used by fixture tests. */
  maxBytes?: number;
}

/** Read + validate a PDF upload from a multipart/form-data request.
 *  On success returns the parsed form, the file handle, derived
 *  metadata, and the base64 payload ready for the Anthropic SDK. On
 *  any failure returns a complete JSON Response — the caller just
 *  returns it. */
export async function readPdfUpload(
  req: Request,
  opts: PdfUploadOptions = {},
): Promise<PdfUploadOk | Response> {
  const maxBytes = opts.maxBytes ?? resolveMaxBytes();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse("Could not read uploaded file.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse("No file provided.", 400);
  }

  if (!isPdf(file)) {
    return errorResponse("Only PDF uploads are supported.", 415);
  }

  if (file.size > maxBytes) {
    const limitMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return errorResponse(`File exceeds ${limitMb} MB limit.`, 413);
  }

  let base64: string;
  try {
    const buf = await file.arrayBuffer();
    base64 = Buffer.from(buf).toString("base64");
  } catch {
    return errorResponse("Could not read uploaded file.", 400);
  }

  return {
    ok: true,
    form,
    file,
    fileName: file.name,
    fileSizeKb: Math.round(file.size / 1024),
    base64,
  };
}

/** True when the file declares itself as a PDF by MIME type, OR (for
 *  clients that don't set content-type) when the filename ends in
 *  `.pdf` case-insensitively. "Unknown" MIME values — absent, empty,
 *  or the generic `application/octet-stream` fallback that some
 *  multipart libraries inject — fall through to the filename check.
 *  We don't sniff magic bytes; Anthropic rejects non-PDF document
 *  blocks itself, so this check exists to reject upload mistakes
 *  early with a useful error. */
export function isPdf(file: { type?: string; name?: string }): boolean {
  if (file.type === "application/pdf") return true;
  const typeUnknown = !file.type || file.type === "application/octet-stream";
  if (typeUnknown && file.name && /\.pdf$/i.test(file.name)) return true;
  return false;
}

/** Resolve the upload size cap from the environment. Invalid /
 *  non-positive values fall back to the default. */
export function resolveMaxBytes(): number {
  const raw = process.env.MAX_UPLOAD_MB;
  const parsed = raw != null ? Number(raw) : NaN;
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_MB;
  return mb * 1024 * 1024;
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
