/* Client adapter for the deterministic Excel preview endpoint.
 *
 * Lives outside `lib/ai/` on purpose — this path is NOT AI-backed,
 * even though the server applies the same auth/rate-limit gates. The
 * shared bearer header lives in `lib/ai/aiApi.ts`, so we reuse it
 * here without taking on any other AI dependencies.
 *
 * Returns the server's normalized preview payload verbatim. The
 * mapping / merge step is intentionally NOT part of this adapter —
 * that's a follow-up task that will read this payload as input. */

import { aiAuthHeaders } from "../ai/aiApi";
import { reportClientError } from "@/lib/telemetry/clientErrorReporter";

export type PreviewCell = string | number | boolean | null;

export interface PreviewSheet {
  name: string;
  rowCount: number;
  columnCount: number;
  /** All parsed rows. The mapping UI typically displays only the first
   *  ~50; the merge step iterates the full set. */
  rows: PreviewCell[][];
}

export interface ExcelPreviewOk {
  ok: true;
  fileName: string;
  sheets: PreviewSheet[];
}

export interface ExcelPreviewFail {
  ok: false;
  message: string;
}

export type ExcelPreviewResponse = ExcelPreviewOk | ExcelPreviewFail;

/** POST an .xlsx File to /api/import/excel/preview and return the
 *  server's preview payload. Transport / parse errors are surfaced
 *  as `{ ok: false, message }` so the caller only has to switch on
 *  the discriminator.
 *
 *  Non-2xx responses + thrown fetch errors are logged to the browser
 *  console (warn / error tone depending on severity). Only endpoint
 *  + HTTP status are logged — workbook bytes, file name, and auth
 *  headers never enter the log. */
export async function previewExcelFile(file: File): Promise<ExcelPreviewResponse> {
  const path = "/api/import/excel/preview";
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      body: form,
      headers: await aiAuthHeaders(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error.";
    reportClientError({
      source: "apiFetch",
      level: "error",
      message,
      fields: { path },
    });
    return { ok: false, message };
  }

  if (res.status >= 400) {
    reportClientError({
      source: "apiResponse",
      level: "warn",
      message: `non-2xx response`,
      fields: { path, status: res.status },
    });
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<ExcelPreviewResponse>;
  }
  const text = await res.text().catch(() => "");
  return { ok: false, message: text || `HTTP ${res.status}` };
}
