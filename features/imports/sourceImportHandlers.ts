/* Shared import-handler hooks.
 *
 * One hook per domain (positions, operating, services, volume, fees,
 * cap). Each returns a bundle wiring up:
 *   - aiPdf: PDF upload handler (Promise<{ ok, message }>)
 *
 * The handler itself is constructed via the existing
 * createPdfImportHandler factory in importRunners.ts; this module owns
 * the wiring that previously lived inline in each Build Model page.
 *
 * Volume + CAP additionally surface inline review state (unmapped rows
 * / unmapped bases) because their merge actions write those out as
 * side effects the analyst needs to triage. The hooks expose the
 * raw setter so callers can render their own review panel UI. */

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  createPdfImportHandler,
  type ImportResult,
} from "./importRunners";
import { useBuildActions, useBuildState, useBuildStore } from "@/lib/store";
import type { BuildImportLog } from "@/lib/store";
import type { ImportApplyResult, UnmappedRow } from "@/lib/parse/types";
import {
  aiParseLaborPdf, laborToExtractionResult,
} from "@/lib/ai/parseLabor";
import {
  aiParseOperatingPdf, operatingToExtractionResult,
} from "@/lib/ai/parseOperating";
import {
  aiParseVolumePdf, volumeToExtractionResult,
} from "@/lib/ai/parseVolume";
import {
  aiParseServicesPdf, servicesToExtractionResult,
} from "@/lib/ai/parseServices";
import {
  aiParseFeesPdf, feesToExtractionResult,
} from "@/lib/ai/parseFees";
import {
  aiParseCapPdf,
  capCentersToExtractionResult,
  capBasesToExtractionResult,
  capBasisUnitsToExtractionResult,
  capPoolsToExtractionResult,
  capDirectAllocationsToExtractionResult,
  capImportIntegrityIssues,
} from "@/lib/ai/parseCap";
import { aiParseFeeStudyPdf } from "@/lib/ai/parseFeeStudy";

type LaborRows = Parameters<typeof laborToExtractionResult>[0];
type OperatingRows   = Parameters<typeof operatingToExtractionResult>[0];
type VolumeRows      = Parameters<typeof volumeToExtractionResult>[0];
type ServiceRows     = Parameters<typeof servicesToExtractionResult>[0];
type FeeRows         = Parameters<typeof feesToExtractionResult>[0];
type CapCenterRows   = Parameters<typeof capCentersToExtractionResult>[0];
type CapBaseRows     = Parameters<typeof capBasesToExtractionResult>[0];
type CapBasisUnitRows = Parameters<typeof capBasisUnitsToExtractionResult>[0];
type CapPoolRows     = Parameters<typeof capPoolsToExtractionResult>[0];
type CapDirectAllocationRows = Parameters<typeof capDirectAllocationsToExtractionResult>[0];

interface CapImportSections {
  centers: CapCenterRows;
  bases: CapBaseRows;
  basisUnits: CapBasisUnitRows;
  pools: CapPoolRows;
  directAllocations: CapDirectAllocationRows;
}

export interface ImportHandlerBundle {
  aiPdf: (file: File) => Promise<ImportResult>;
}

export interface VolumeImportHandlerBundle extends ImportHandlerBundle {
  unmapped: UnmappedRow[];
  setUnmapped: Dispatch<SetStateAction<UnmappedRow[]>>;
  /** Catalog passed to the volume review panel so the "Map to existing"
   *  dropdown can list candidate services. Filtered by the panel to the
   *  unmapped row's dept. */
  services: { id: string; name: string; dept: string }[];
  /** Promote the unmapped row at `index` into a brand-new Service +
   *  VolumeRow pair. Removes the row from the local review list on
   *  success. Returns the new service id, or null if name/dept couldn't
   *  be reconstructed. */
  createServiceForUnmapped: (u: UnmappedRow, index: number) => string | null;
  /** Attach the unmapped row at `index` to an existing service id.
   *  Removes the row from the local review list. */
  mapUnmappedToService: (u: UnmappedRow, index: number, serviceId: string) => void;
}

export interface CapImportHandlerBundle extends ImportHandlerBundle {
  unmappedBases: UnmappedRow[];
  setUnmappedBases: Dispatch<SetStateAction<UnmappedRow[]>>;
}

// ─── Labor ─────────────────────────────────────────────────────────────

function formatLaborSummary(
  total: number, mapped: number, lowConfidence: number,
): string {
  const imported = mapped + lowConfidence;
  const skipped = Math.max(0, total - imported);
  const parts: string[] = [`${mapped} accepted`, `${lowConfidence} for review`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `${imported} position${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
}

export function useLaborImportHandlers(): ImportHandlerBundle {
  const { mergePositions } = useBuildActions((s) => ({
    mergePositions: s.mergePositions,
  }));

  const apply = (rows: LaborRows, source: string) => {
    const extraction = laborToExtractionResult(rows, source);
    const applied = mergePositions(extraction, source);
    return formatLaborSummary(
      extraction.stats.total, applied.mapped, applied.lowConfidence,
    );
  };

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: aiParseLaborPdf,
      apply: (parsed, fileName) => apply(parsed.positions, fileName),
    }),
  };
}

// ─── Operating ─────────────────────────────────────────────────────────

function formatOperatingSummary(
  total: number, mapped: number, lowConfidence: number,
): string {
  const imported = mapped + lowConfidence;
  const skipped = Math.max(0, total - imported);
  const parts: string[] = [`${mapped} accepted`, `${lowConfidence} for review`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `${imported} line${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
}

export function useOperatingImportHandlers(): ImportHandlerBundle {
  const { mergeOperating } = useBuildActions((s) => ({
    mergeOperating: s.mergeOperating,
  }));

  const apply = (rows: OperatingRows, source: string) => {
    const extraction = operatingToExtractionResult(rows, source);
    const applied = mergeOperating(extraction, source);
    return formatOperatingSummary(
      extraction.stats.total, applied.mapped, applied.lowConfidence,
    );
  };

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: aiParseOperatingPdf,
      apply: (parsed, fileName) => apply(parsed.operating, fileName),
    }),
  };
}

// ─── Services ──────────────────────────────────────────────────────────

function formatServicesSummary(
  total: number, mapped: number, lowConfidence: number, duplicates: number,
): string {
  const imported = mapped + lowConfidence + duplicates;
  const skipped = Math.max(0, total - imported);
  const parts: string[] = [`${mapped} accepted`];
  if (duplicates > 0)    parts.push(`${duplicates} updated`);
  parts.push(`${lowConfidence} for review`);
  if (skipped > 0)       parts.push(`${skipped} skipped`);
  return `${imported} service${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
}

export function useServicesImportHandlers(): ImportHandlerBundle {
  const { services, mergeServices } = useBuildState();

  const apply = (rows: ServiceRows, source: string) => {
    const extraction = servicesToExtractionResult(rows, services, source);
    const applied = mergeServices(extraction, source);
    return formatServicesSummary(
      extraction.stats.total, applied.mapped, applied.lowConfidence, applied.duplicates,
    );
  };

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: (file) => aiParseServicesPdf(
        file, services.map((s) => ({ name: s.name, dept: s.dept })),
      ),
      apply: (parsed, fileName) => apply(parsed.services, fileName),
    }),
  };
}

// ─── Volume of Activity ────────────────────────────────────────────────

export function useVolumeImportHandlers(): VolumeImportHandlerBundle {
  const {
    mergeVolume, services, volume,
    createServiceFromUnmappedVolume, mapUnmappedVolumeToService,
  } = useBuildState();
  // Unmatched rows are volume-specific (mergeVolume writes them to
  // pendingReview, but the page also surfaces them inline so users see
  // what didn't bind). Populated as a side effect inside the handlers.
  const [unmapped, setUnmapped] = useState<UnmappedRow[]>([]);

  const removeAt = (i: number) => setUnmapped((prev) => prev.filter((_, j) => j !== i));
  const createServiceForUnmapped = (u: UnmappedRow, i: number): string | null => {
    const id = createServiceFromUnmappedVolume(u);
    if (id) removeAt(i);
    return id;
  };
  const mapUnmappedToService = (u: UnmappedRow, i: number, serviceId: string): void => {
    mapUnmappedVolumeToService(u, serviceId);
    removeAt(i);
  };

  const apply = (rows: VolumeRows, source: string) => {
    const extraction = volumeToExtractionResult(rows, services, source, volume);
    const applied = mergeVolume(extraction, source);
    setUnmapped(extraction.unmapped);
    const imported = applied.mapped + applied.lowConfidence + applied.duplicates;
    const parts: string[] = [`${applied.mapped} accepted`];
    if (applied.duplicates > 0)    parts.push(`${applied.duplicates} updated`);
    parts.push(`${applied.lowConfidence} for review`);
    if (applied.unmapped > 0)      parts.push(`${applied.unmapped} unmatched`);
    return `${imported} row${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
  };

  const resetUnmapped = () => setUnmapped([]);

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: aiParseVolumePdf,
      apply: (parsed, fileName) => apply(parsed.items, fileName),
      onStart: resetUnmapped,
    }),
    unmapped,
    setUnmapped,
    services: services.map((s) => ({ id: s.id, name: s.name, dept: s.dept })),
    createServiceForUnmapped,
    mapUnmappedToService,
  };
}

// ─── Fee Schedule ──────────────────────────────────────────────────────

export function useFeesImportHandlers(): ImportHandlerBundle {
  const { services, mergeFeeSchedule } = useBuildState();

  const apply = (rows: FeeRows, source: string) => {
    const extraction = feesToExtractionResult(rows, services, source);
    const applied = mergeFeeSchedule(extraction, source);
    const total = applied.mapped + applied.duplicates + applied.lowConfidence;
    const noun = `fee${total === 1 ? "" : "s"}`;
    return `${total} ${noun} imported from PDF (${applied.mapped} new, ${applied.duplicates} updated).`;
  };

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: aiParseFeesPdf,
      apply: (parsed, fileName) => apply(parsed.fees, fileName),
      parseFailureMessage: "AI parsing failed.",
      importFailureMessage: "PDF parsing failed.",
    }),
  };
}

// ─── Overhead Costs (CAP bundle) ───────────────────────────────────────

function bundleCountsMessage(counts: {
  centers: number; bases: number; basisUnits: number;
  pools: number; directAllocations: number;
}): string {
  const parts: string[] = [];
  if (counts.centers > 0) parts.push(`${counts.centers} center${counts.centers === 1 ? "" : "s"}`);
  if (counts.bases > 0)   parts.push(`${counts.bases} bas${counts.bases === 1 ? "is" : "es"}`);
  if (counts.basisUnits > 0) parts.push(`${counts.basisUnits} schedule${counts.basisUnits === 1 ? "" : "s"}`);
  if (counts.pools > 0)   parts.push(`${counts.pools} pool${counts.pools === 1 ? "" : "s"}`);
  if (counts.directAllocations > 0) parts.push(`${counts.directAllocations} direct alloc${counts.directAllocations === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "nothing";
}

export function useCapImportHandlers(): CapImportHandlerBundle {
  const { mergeCapBundle } = useBuildState();
  // Bases the model returned with driverKey "OTHER" or otherwise
  // un-bindable. Surfaced inline so users see what didn't bind.
  const [unmappedBases, setUnmappedBases] = useState<UnmappedRow[]>([]);

  function buildStatusMessage(applied: ReturnType<typeof mergeCapBundle>): string {
    const counts = bundleCountsMessage({
      centers: applied.centersImported,
      bases: applied.basesImported,
      basisUnits: applied.basisUnitsImported,
      pools: applied.poolsImported,
      directAllocations: applied.directAllocationsImported,
    });
    const unmatched = applied.unmappedBases.length;
    const parts: string[] = [`${applied.mapped} accepted`, `${applied.lowConfidence} for review`];
    if (unmatched > 0) parts.push(`${unmatched} unmatched bas${unmatched === 1 ? "is" : "es"}`);
    return `${counts} imported (${parts.join(", ")}).`;
  }

  // CAP imports are multi-section: centers / bases / basisUnits / pools /
  // directAllocations. PDF builds all five from one parser result;
  // clipboard JSON treats each section as optional but requires at least
  // one. Both paths share this bundle-building step.
  const applySections = (sections: CapImportSections, source: string) => {
    const bases = capBasesToExtractionResult(sections.bases, source);
    const importedBases = [...bases.mapped, ...bases.lowConfidence].map((row) => row.entity);
    const basisUnits = capBasisUnitsToExtractionResult(sections.basisUnits, source);
    const pools = capPoolsToExtractionResult(sections.pools, source, importedBases);
    const directAllocations = capDirectAllocationsToExtractionResult(
      sections.directAllocations, pools, source,
    );
    const integrityIssues = capImportIntegrityIssues(
      bases, basisUnits, pools, directAllocations, source,
    );
    const bundle = {
      centers: capCentersToExtractionResult(sections.centers, source),
      bases,
      basisUnits: {
        ...basisUnits,
        unmapped: [...basisUnits.unmapped, ...integrityIssues],
        stats: {
          ...basisUnits.stats,
          unmapped: basisUnits.stats.unmapped + integrityIssues.length,
        },
      },
      pools,
      directAllocations,
    };
    const applied = mergeCapBundle(bundle, source);
    setUnmappedBases(applied.unmappedBases);
    return buildStatusMessage(applied);
  };

  const resetUnmappedBases = () => setUnmappedBases([]);

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: aiParseCapPdf,
      apply: (parsed, fileName) => applySections({
        centers: parsed.centers,
        bases: parsed.bases,
        basisUnits: parsed.basisUnits,
        pools: parsed.pools,
        directAllocations: parsed.directAllocations,
      }, fileName),
      onStart: resetUnmappedBases,
    }),
    unmappedBases,
    setUnmappedBases,
  };
}

// ─── Fee Study (composite) ──────────────────────────────────────────────
//
// Fee Study is not a domain — it's an optional composite upload surface
// for one PDF that may mix Services, Staffing, Volume, and Fee Schedule
// data. The parser returns the same wire shapes the four single-domain
// endpoints already produce; this hook's only job is to run them through
// the EXISTING converters + merge actions, in the safe order (Services
// populates the catalog Volume/Fees match against by name), and collect
// per-domain summaries. No new store field, no new Domain value.

export interface FeeStudyDomainSummary {
  domain: "services" | "volume" | "fees" | "positions";
  applied: ImportApplyResult;
}

const FEE_STUDY_DOMAIN_NOUN: Record<FeeStudyDomainSummary["domain"], { singular: string; plural: string }> = {
  services: { singular: "service", plural: "services" },
  volume: { singular: "volume row", plural: "volume rows" },
  fees: { singular: "fee", plural: "fees" },
  positions: { singular: "position", plural: "positions" },
};

function formatFeeStudySummary(summaries: FeeStudyDomainSummary[]): string {
  if (summaries.length === 0) {
    return "No services, staffing, volume, or fee data found in this PDF.";
  }
  const parts = summaries.map(({ domain, applied }) => {
    const total = applied.mapped + applied.duplicates + applied.lowConfidence;
    const noun = FEE_STUDY_DOMAIN_NOUN[domain];
    return `${total} ${total === 1 ? noun.singular : noun.plural}`;
  });
  return `Imported ${parts.join(", ")} from this fee study — see each source card above for full detail.`;
}

/** One past Fee Study upload, for this card's own "Recent imports" list.
 *  Spans every domain the upload touched, so it's grouped from the
 *  persisted BuildImportLog entries that share a batchId rather than
 *  tracked separately — same shape (id/fileName/rows/at) so it renders
 *  through the same list component as the single-domain cards. */
export interface FeeStudyHistoryEntry {
  id: string;
  fileName: string;
  rows: number;
  at: string;
}

/** Groups BuildImportLog entries written by one Fee Study upload (shared
 *  batchId) into one history row, most recent first, capped to 4 — mirrors
 *  ExpandedDetail's own filter/sort/slice for single-domain history. */
export function feeStudyHistoryFromImports(imports: BuildImportLog[]): FeeStudyHistoryEntry[] {
  const byBatch = new Map<string, FeeStudyHistoryEntry>();
  for (const entry of imports) {
    if (!entry.batchId) continue;
    const existing = byBatch.get(entry.batchId);
    if (existing) {
      existing.rows += entry.result.rows;
    } else {
      byBatch.set(entry.batchId, {
        id: entry.batchId, fileName: entry.result.fileName, rows: entry.result.rows, at: entry.at,
      });
    }
  }
  return [...byBatch.values()]
    .sort((a, b) => (b.at > a.at ? 1 : -1))
    .slice(0, 4);
}

export interface FeeStudyImportHandlerBundle {
  aiPdf: (file: File) => Promise<ImportResult>;
  /** Per-domain summaries from the last run, in apply order. A domain
   *  absent from the PDF is simply absent from this list. */
  summaries: FeeStudyDomainSummary[];
  /** Past Fee Study uploads, most recent first, capped to 4 — mirrors each
   *  domain card's own "Recent imports" list. Persisted (read off the
   *  store's `imports` log), unlike the per-run `summaries` above. */
  history: FeeStudyHistoryEntry[];
  /** Volume's unmapped rows from the last run — same shape/lifecycle as
   *  useVolumeImportHandlers' `unmapped`, reused by VolumeUnmappedPanel
   *  verbatim. */
  unmapped: UnmappedRow[];
  setUnmapped: Dispatch<SetStateAction<UnmappedRow[]>>;
  services: { id: string; name: string; dept: string }[];
  createServiceForUnmapped: (u: UnmappedRow, index: number) => string | null;
  mapUnmappedToService: (u: UnmappedRow, index: number, serviceId: string) => void;
}

type FeeStudyParsed = Awaited<ReturnType<typeof aiParseFeeStudyPdf>>;

export function useFeeStudyImportHandlers(): FeeStudyImportHandlerBundle {
  const {
    services, imports, createServiceFromUnmappedVolume, mapUnmappedVolumeToService,
  } = useBuildState();

  const [summaries, setSummaries] = useState<FeeStudyDomainSummary[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedRow[]>([]);

  const removeAt = (i: number) => setUnmapped((prev) => prev.filter((_, j) => j !== i));
  const createServiceForUnmapped = (u: UnmappedRow, i: number): string | null => {
    const id = createServiceFromUnmappedVolume(u);
    if (id) removeAt(i);
    return id;
  };
  const mapUnmappedToService = (u: UnmappedRow, i: number, serviceId: string): void => {
    mapUnmappedVolumeToService(u, serviceId);
    removeAt(i);
  };

  // Sequenced Services -> Volume -> Fees -> Positions. Each step reads
  // the LATEST store snapshot via getState() rather than this render's
  // `services` closure — mergeServices just wrote rows the Volume/Fees
  // steps need to see, and the render-time closure wouldn't reflect that
  // within one synchronous apply() call. All four merges share one
  // batchId so the persisted import log can be grouped back into a single
  // "Recent imports" row on this card.
  const apply = (parsed: FeeStudyParsed, fileName: string): string => {
    const batchId = `fee-study-${Date.now()}`;
    const nextSummaries: FeeStudyDomainSummary[] = [];

    if (parsed.services.length > 0) {
      const store = useBuildStore.getState();
      const extraction = servicesToExtractionResult(parsed.services, store.services, fileName);
      const applied = store.mergeServices(extraction, fileName, batchId);
      nextSummaries.push({ domain: "services", applied });
    }

    if (parsed.items.length > 0) {
      const store = useBuildStore.getState();
      const extraction = volumeToExtractionResult(parsed.items, store.services, fileName, store.volume);
      const applied = store.mergeVolume(extraction, fileName, batchId);
      setUnmapped(extraction.unmapped);
      nextSummaries.push({ domain: "volume", applied });
    }

    if (parsed.fees.length > 0) {
      const store = useBuildStore.getState();
      const extraction = feesToExtractionResult(parsed.fees, store.services, fileName);
      const applied = store.mergeFeeSchedule(extraction, fileName, batchId);
      nextSummaries.push({ domain: "fees", applied });
    }

    if (parsed.positions.length > 0) {
      const store = useBuildStore.getState();
      const extraction = laborToExtractionResult(parsed.positions, fileName);
      const applied = store.mergePositions(extraction, fileName, batchId);
      nextSummaries.push({ domain: "positions", applied });
    }

    setSummaries(nextSummaries);
    return formatFeeStudySummary(nextSummaries);
  };

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: (file) => aiParseFeeStudyPdf(file, services.map((s) => ({ name: s.name, dept: s.dept }))),
      apply: (parsed, fileName) => apply(parsed, fileName),
      onStart: () => { setUnmapped([]); setSummaries([]); },
    }),
    summaries,
    history: feeStudyHistoryFromImports(imports),
    unmapped,
    setUnmapped,
    services: services.map((s) => ({ id: s.id, name: s.name, dept: s.dept })),
    createServiceForUnmapped,
    mapUnmappedToService,
  };
}
