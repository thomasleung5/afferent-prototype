import type { LastImport } from "@/components/ui";
import type { ImportApplyResult, ParsedDoc, UnmappedRow } from "@/lib/parse";
import type { AiSuggestion } from "@/lib/ai/types";
import { runAiAssist } from "@/lib/ai/extract";
import type { Domain } from "@/lib/store";

/** Format an ImportApplyResult into the LastImport shape that DropZone shows
 *  in its right-pane provenance panel. */
export function toLastImport(r: ImportApplyResult): LastImport {
  return {
    file: r.fileName,
    rows: r.rows,
    mapped: r.mapped,
    review: r.lowConfidence + r.unmapped + r.duplicates,
    date: new Date().toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    }),
  };
}

/** Run the AI assist pass for unmapped rows from an import. Fires the AI
 *  status callbacks so the UI can show "Asking Claude…" inline, then pushes
 *  any returned suggestions into the AI review queue.
 *
 *  Safe to call with zero unmapped rows — it just returns immediately. */
export async function runAiAssistPass(opts: {
  domain: Domain;
  doc: ParsedDoc;
  unmapped: UnmappedRow[];
  exampleRows?: Record<string, unknown>[];
  setStatus: (status: { running: boolean; message?: string }) => void;
  addSuggestions: (items: AiSuggestion[]) => void;
}): Promise<void> {
  const { domain, doc, unmapped, exampleRows, setStatus, addSuggestions } = opts;
  if (unmapped.length === 0) return;
  setStatus({ running: true, message: "Asking Claude to interpret unmapped rows…" });
  const result = await runAiAssist({ domain, doc, unmapped, exampleRows });
  if (result.suggestions.length > 0) {
    addSuggestions(result.suggestions);
  }
  setStatus({
    running: false,
    message: result.ok
      ? result.suggestions.length === 0
        ? "Claude reviewed the unmapped rows — no defensible mappings."
        : `Claude suggested ${result.suggestions.length} mapping${result.suggestions.length === 1 ? "" : "s"}.`
      : result.message,
  });
}
