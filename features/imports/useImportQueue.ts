/* Local queue state for the global Import Manager drawer.
 *
 * Each dropped file flows through the same shared pipeline as the per-page
 * DropZones (lib/import/pipeline.ts) and the latest batch becomes the active
 * currentBatch on the store — exactly what the workflow pages render via
 * MappingReview + ImportDebug. The Manager itself shows a compact queue of
 * the files being processed in the current session. */

import { useCallback, useState } from "react";
import { runImportPipelineFromParsed } from "@/lib/import/pipeline";
import { parseFile, type ParsedDoc } from "@/lib/parse";
import { classifyDocument } from "@/lib/import/classify";
import { useBuildStore } from "@/lib/store";
import type { ImportBatch, DocumentType } from "@/lib/import/types";

export type QueueStage =
  | "parsing"
  | "classifying"
  | "needs-domain"
  | "extracting"
  | "merging"
  | "done"
  | "error";

export interface QueueItem {
  id: string;
  file: File;
  fileName: string;
  size: number;
  ticks: number;
  stage: QueueStage;
  /** Captured after parse so we can re-classify after the user picks. */
  parsed?: ParsedDoc;
  /** The classifier result. When documentType === "unknown", we park on "needs-domain". */
  documentType?: DocumentType;
  classifyReason?: string;
  /** The resulting batch for this file. The most recent done batch is also
   *  the store's currentBatch — that's what the Mapping Review surface
   *  consumes. */
  batch?: ImportBatch;
  error?: string;
}

export function useImportQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const store = useBuildStore();

  const patch = useCallback((id: string, p: Partial<QueueItem>) =>
    setItems((prev) => prev.map((it) =>
      it.id === id ? { ...it, ticks: it.ticks + 1, ...p } : it,
    )), []);

  const runExtract = useCallback(async (
    id: string, parsed: ParsedDoc, forceType?: DocumentType,
  ) => {
    patch(id, { stage: "extracting" });
    try {
      const batch = runImportPipelineFromParsed(parsed, {
        services: store.services,
        forceType,
      });
      patch(id, { stage: "merging" });
      store.setCurrentBatch(batch);
      patch(id, { stage: "done", batch });
    } catch (err) {
      patch(id, {
        stage: "error",
        error: err instanceof Error ? err.message : "Extraction failed",
      });
    }
  }, [patch, store]);

  /** Add a file: parse → classify → either auto-extract or stop for user-pick. */
  const addFile = useCallback(async (file: File) => {
    const id = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: QueueItem = {
      id, file, fileName: file.name, size: file.size,
      ticks: 0, stage: "parsing",
    };
    setItems((prev) => [item, ...prev]);

    let parsed: ParsedDoc;
    try {
      parsed = await parseFile(file);
    } catch (err) {
      patch(id, {
        stage: "error",
        error: err instanceof Error ? err.message : "Parse failed",
      });
      return;
    }

    patch(id, { stage: "classifying", parsed });
    const classification = classifyDocument(parsed);
    patch(id, {
      documentType: classification.documentType,
      classifyReason: classification.reason,
    });

    if (classification.documentType !== "unknown") {
      await runExtract(id, parsed, classification.documentType);
    } else {
      patch(id, { stage: "needs-domain" });
    }
  }, [patch, runExtract]);

  /** User picked a documentType for a parked item — run the pipeline. */
  const pickDomain = useCallback(async (id: string, documentType: DocumentType) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    if (item.parsed) {
      await runExtract(id, item.parsed, documentType);
      return;
    }
    let parsed: ParsedDoc;
    try {
      parsed = await parseFile(item.file);
    } catch (err) {
      patch(id, {
        stage: "error",
        error: err instanceof Error ? err.message : "Parse failed",
      });
      return;
    }
    await runExtract(id, parsed, documentType);
  }, [items, patch, runExtract]);

  const clear = useCallback(() => setItems([]), []);

  return { items, addFile, pickDomain, clear };
}
