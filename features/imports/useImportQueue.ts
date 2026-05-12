/* Local state for the global Import Manager drawer. One queue item per file
 * dropped during the open session. Each item moves: parsing → classifying →
 * (needs-domain | extracting) → merging → done | error.
 *
 * The actual merges flow through the existing store actions (mergePositions,
 * mergeOperating, …) so per-page DropZones, ImportBar history, and
 * ImportReview AI suggestions all stay live. */

import { useCallback, useState } from "react";
import {
  extractSalary, extractOperating, extractServices, extractFeeSchedule,
  extractWorkload, extractCap,
} from "@/lib/parse/extract";
import { parseFile, type ParsedDoc } from "@/lib/parse";
import { classify, type Classification } from "@/lib/parse/classify";
import { useBuildStore, type Domain } from "@/lib/store";
import type { ImportApplyResult } from "@/lib/parse";
import { runAiAssistPass } from "@/features/build/runImport";

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
  /** Increments when stage changes — drives the spinner animation. */
  ticks: number;
  stage: QueueStage;
  /** Set after classify() runs. */
  classification?: Classification;
  /** Final domain (auto from classifier OR user-picked). */
  domain?: Domain;
  /** Set when merge succeeds. */
  result?: ImportApplyResult;
  /** Set on error. */
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
    id: string, doc: ParsedDoc, domain: Domain,
  ) => {
    patch(id, { stage: "extracting", domain });
    let result: ImportApplyResult;
    let unmappedDoc = doc;
    try {
      switch (domain) {
        case "positions": {
          const r = extractSalary(doc, store.positions);
          patch(id, { stage: "merging" });
          result = store.mergePositions(r, doc.fileName);
          unmappedDoc = doc;
          void runAiAssistPass({
            domain, doc, unmapped: r.unmapped,
            exampleRows: store.positions.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => store.setAiStatus(domain, s),
            addSuggestions: (items) => store.addAiSuggestions(domain, items),
          });
          break;
        }
        case "operating": {
          const r = extractOperating(doc, store.operating);
          patch(id, { stage: "merging" });
          result = store.mergeOperating(r, doc.fileName);
          void runAiAssistPass({
            domain, doc, unmapped: r.unmapped,
            exampleRows: store.operating.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => store.setAiStatus(domain, s),
            addSuggestions: (items) => store.addAiSuggestions(domain, items),
          });
          break;
        }
        case "services": {
          const r = extractServices(doc, store.services);
          patch(id, { stage: "merging" });
          result = store.mergeServices(r, doc.fileName);
          void runAiAssistPass({
            domain, doc, unmapped: r.unmapped,
            exampleRows: store.services.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => store.setAiStatus(domain, s),
            addSuggestions: (items) => store.addAiSuggestions(domain, items),
          });
          break;
        }
        case "fees": {
          const r = extractFeeSchedule(doc, store.services);
          patch(id, { stage: "merging" });
          result = store.mergeFeeSchedule(r, doc.fileName);
          void runAiAssistPass({
            domain, doc, unmapped: r.unmapped,
            exampleRows: store.services.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => store.setAiStatus(domain, s),
            addSuggestions: (items) => store.addAiSuggestions(domain, items),
          });
          break;
        }
        case "workload": {
          const r = extractWorkload(doc, store.workload, store.services);
          patch(id, { stage: "merging" });
          result = store.mergeWorkload(r, doc.fileName);
          void runAiAssistPass({
            domain, doc, unmapped: r.unmapped,
            exampleRows: store.services.slice(0, 12).map((s) => ({ name: s.name, dept: s.dept })) as unknown as Record<string, unknown>[],
            setStatus: (s) => store.setAiStatus(domain, s),
            addSuggestions: (items) => store.addAiSuggestions(domain, items),
          });
          break;
        }
        case "cap": {
          const r = extractCap(doc, store.capPools);
          patch(id, { stage: "merging" });
          result = store.mergeCap(r, doc.fileName);
          void runAiAssistPass({
            domain, doc, unmapped: r.unmapped,
            exampleRows: store.capPools.slice(0, 3) as unknown as Record<string, unknown>[],
            setStatus: (s) => store.setAiStatus(domain, s),
            addSuggestions: (items) => store.addAiSuggestions(domain, items),
          });
          break;
        }
      }
      patch(id, { stage: "done", result, domain });
    } catch (err) {
      patch(id, {
        stage: "error",
        error: err instanceof Error ? err.message : "Extraction failed",
      });
    }
    void unmappedDoc;
  }, [patch, store]);

  /** Add a file: parse → classify → either auto-extract or stop for user-pick. */
  const addFile = useCallback(async (file: File) => {
    const id = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: QueueItem = {
      id, file, fileName: file.name, size: file.size,
      ticks: 0, stage: "parsing",
    };
    setItems((prev) => [item, ...prev]);

    let doc: ParsedDoc;
    try {
      doc = await parseFile(file);
    } catch (err) {
      patch(id, {
        stage: "error",
        error: err instanceof Error ? err.message : "Parse failed",
      });
      return;
    }

    patch(id, { stage: "classifying" });
    const classification = classify(doc);
    patch(id, { classification });

    if (classification.domain) {
      // Stash the parsed doc on the closure for the extract pass.
      await runExtract(id, doc, classification.domain);
    } else {
      // Park for user to pick. We re-derive doc from the file when they pick.
      patch(id, { stage: "needs-domain" });
    }
  }, [patch, runExtract]);

  /** User picked a domain for a parked item — re-parse and extract. */
  const pickDomain = useCallback(async (id: string, domain: Domain) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    let doc: ParsedDoc;
    try {
      doc = await parseFile(item.file);
    } catch (err) {
      patch(id, {
        stage: "error",
        error: err instanceof Error ? err.message : "Parse failed",
      });
      return;
    }
    await runExtract(id, doc, domain);
  }, [items, patch, runExtract]);

  const clear = useCallback(() => setItems([]), []);

  return { items, addFile, pickDomain, clear };
}
