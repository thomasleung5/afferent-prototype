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
 *  the discriminator. */
export async function previewExcelFile(file: File): Promise<ExcelPreviewResponse> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/import/excel/preview", {
      method: "POST",
      body: form,
      headers: aiAuthHeaders(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error.";
    return { ok: false, message };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<ExcelPreviewResponse>;
  }
  const text = await res.text().catch(() => "");
  return { ok: false, message: text || `HTTP ${res.status}` };
}
