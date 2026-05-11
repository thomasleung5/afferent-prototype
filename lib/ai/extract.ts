/* Client-side helper for the /api/ai/extract route. Called from the DropZone
 * after the deterministic extractor finishes, to interpret rows that didn't
 * auto-map. Returns AiSuggestion[] ready to push into BuildContext. */

import type { Domain } from "@/lib/store";
import type { ParsedDoc, UnmappedRow } from "@/lib/parse";
import type { AiExtractRequest, AiExtractResponse, AiSuggestion } from "./types";

interface RunOptions {
  domain: Domain;
  doc: ParsedDoc;
  unmapped: UnmappedRow[];
  /** Optional small sample of existing model rows for shape reference. */
  exampleRows?: Record<string, unknown>[];
}

export interface AiRunResult {
  ok: boolean;
  status: AiExtractResponse["status"];
  message?: string;
  suggestions: AiSuggestion[];
}

/** POST unmapped rows to the AI extraction route. Always resolves — errors
 *  surface as `ok: false` with a `message`, so the caller can show them
 *  inline without try/catch noise. */
export async function runAiAssist({
  domain, doc, unmapped, exampleRows,
}: RunOptions): Promise<AiRunResult> {
  if (unmapped.length === 0) {
    return { ok: true, status: "no-suggestions", suggestions: [] };
  }

  const headers = doc.sheets?.[0]?.headers ?? [];
  const body: AiExtractRequest = {
    domain,
    headers,
    rows: unmapped.map((u, i) => ({
      index: i,
      cells: u.raw,
      reason: u.reason,
      lineage: u.lineage,
    })),
    examples: exampleRows ? { domain, sample: exampleRows } : undefined,
  };

  try {
    const res = await fetch("/api/ai/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: AiExtractResponse = await res.json();
    return {
      ok: !!json.ok,
      status: json.status ?? (json.ok ? "ok" : "model-error"),
      message: json.message,
      suggestions: json.suggestions ?? [],
    };
  } catch (err) {
    return {
      ok: false,
      status: "model-error",
      message: err instanceof Error ? err.message : "Network error calling AI route.",
      suggestions: [],
    };
  }
}
