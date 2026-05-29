/* Shared import-handler hooks.
 *
 * One hook per domain (positions, operating, services, volume, fees,
 * cap). Each returns a bundle wiring up:
 *   - aiPdf:    PDF upload handler (Promise<{ ok, message }>)
 *   - pasteJson: clipboard JSON handler (same shape)
 *   - the per-domain drawer copy (title, helper, schema preview, etc.)
 *
 * The handlers themselves are constructed via the existing
 * createPdfImportHandler / createJsonImportHandler factories in
 * importRunners.ts; this module owns the wiring that previously lived
 * inline in each Build Model page.
 *
 * Volume + CAP additionally surface inline review state (unmapped rows
 * / unmapped bases) because their merge actions write those out as
 * side effects the analyst needs to triage. The hooks expose the
 * raw setter so callers can render their own review panel UI. */

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  createJsonImportHandler, createPdfImportHandler,
  type ImportResult,
} from "./importRunners";
import { useBuildActions, useBuildState } from "@/lib/store";
import type { UnmappedRow } from "@/lib/parse/types";
import {
  aiParseDirectLaborPdf, directLaborToExtractionResult,
} from "@/lib/ai/parseDirectLabor";
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
} from "@/lib/ai/parseCap";

type DirectLaborRows = Parameters<typeof directLaborToExtractionResult>[0];
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

const arrLen = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

export interface ImportHandlerBundle {
  aiPdf: (file: File) => Promise<ImportResult>;
  pasteJson: (text: string) => Promise<ImportResult>;
  /** Modal/section title. */
  title: string;
  /** One-line description shown under the title. */
  helper: string;
  /** Tag-line style summary surfaced in the COLLAPSED card so users can
   *  scan what each source represents at a glance. Comma-separated list
   *  of fields / concepts (no full sentence, no period). The expanded
   *  card relies on the same tagline + supported-document chips, so the
   *  description doesn't repeat there. */
  tagline: string;
  /** Inline example shape (e.g. "{ items: [...] }"). */
  pasteExample: string;
  /** Optional richer help line for the paste button. */
  pasteHelper?: string;
  /** Optional multi-line schema preview rendered under the paste action. */
  pasteSchema?: string;
}

export interface VolumeImportHandlerBundle extends ImportHandlerBundle {
  unmapped: UnmappedRow[];
  setUnmapped: Dispatch<SetStateAction<UnmappedRow[]>>;
}

export interface CapImportHandlerBundle extends ImportHandlerBundle {
  unmappedBases: UnmappedRow[];
  setUnmappedBases: Dispatch<SetStateAction<UnmappedRow[]>>;
}

// ─── Direct Labor ──────────────────────────────────────────────────────

const DIRECT_LABOR_SCHEMA = `{
  positions: [
    { title, dept, fte, hours, confidence }
  ]
}`;

function formatDirectLaborSummary(
  total: number, mapped: number, lowConfidence: number,
): string {
  const imported = mapped + lowConfidence;
  const skipped = Math.max(0, total - imported);
  const parts: string[] = [`${mapped} accepted`, `${lowConfidence} for review`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `${imported} position${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
}

export function useDirectLaborImportHandlers(): ImportHandlerBundle {
  const { mergePositions } = useBuildActions((s) => ({
    mergePositions: s.mergePositions,
  }));

  const apply = (rows: DirectLaborRows, source: string) => {
    const extraction = directLaborToExtractionResult(rows, source);
    const applied = mergePositions(extraction, source);
    return formatDirectLaborSummary(
      extraction.stats.total, applied.mapped, applied.lowConfidence,
    );
  };

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: aiParseDirectLaborPdf,
      apply: (parsed, fileName) => apply(parsed.positions, fileName),
    }),
    pasteJson: createJsonImportHandler({
      rootKey: "positions",
      apply: (rows, source) => apply(rows as DirectLaborRows, source),
    }),
    title: "Import Direct Labor",
    helper: "Upload a source PDF, or paste structured JSON as a fallback.",
    tagline: "Positions, departments, FTEs, productive hours",
    pasteExample: "{ positions: [...] }",
    pasteHelper: "Paste structured output shaped like { positions: [...] }.",
    pasteSchema: DIRECT_LABOR_SCHEMA,
  };
}

// ─── Operating ─────────────────────────────────────────────────────────

const OPERATING_SCHEMA = `{
  operating: [
    { code, line, dept, category, amount, include, confidence }
  ]
}`;

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
    pasteJson: createJsonImportHandler({
      rootKey: "operating",
      apply: (rows, source) => apply(rows as OperatingRows, source),
    }),
    title: "Import Operating",
    helper: "Upload a source PDF, or paste structured JSON as a fallback.",
    tagline: "Operating expenditures and personnel costs",
    pasteExample: "{ operating: [...] }",
    pasteHelper: "Paste structured output shaped like { operating: [...] }.",
    pasteSchema: OPERATING_SCHEMA,
  };
}

// ─── Services ──────────────────────────────────────────────────────────

const SERVICES_SCHEMA = `{
  services: [
    { name, dept, hours, volume, fee, target, confidence }
  ]
}`;

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
    pasteJson: createJsonImportHandler({
      rootKey: "services",
      apply: (rows, source) => apply(rows as ServiceRows, source),
    }),
    title: "Import Services",
    helper: "Upload a source PDF, or paste structured JSON as a fallback.",
    tagline: "Department services and workflows",
    pasteExample: "{ services: [...] }",
    pasteHelper: "Paste structured output shaped like { services: [...] }.",
    pasteSchema: SERVICES_SCHEMA,
  };
}

// ─── Volume of Activity ────────────────────────────────────────────────

const VOLUME_SCHEMA = `{
  items: [
    { name, dept, prior, current, unit, confidence }
  ]
}`;

export function useVolumeImportHandlers(): VolumeImportHandlerBundle {
  const { mergeVolume, services, volume } = useBuildState();
  // Unmatched rows are volume-specific (mergeVolume writes them to
  // pendingReview, but the page also surfaces them inline so users see
  // what didn't bind). Populated as a side effect inside the handlers.
  const [unmapped, setUnmapped] = useState<UnmappedRow[]>([]);

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
    pasteJson: createJsonImportHandler({
      rootKey: "items",
      apply: (rows, source) => apply(rows as VolumeRows, source),
      onStart: resetUnmapped,
    }),
    title: "Import Volume of Activity",
    helper: "Upload a source PDF, or paste structured JSON as a fallback. Service names fuzzy-match to the existing catalog.",
    tagline: "Permit, inspection, and review counts",
    pasteExample: "{ items: [...] }",
    pasteHelper: "Paste structured output shaped like { items: [...] }.",
    pasteSchema: VOLUME_SCHEMA,
    unmapped,
    setUnmapped,
  };
}

// ─── Fee Schedule ──────────────────────────────────────────────────────

const FEES_SCHEMA = `{
  fees: [
    { name, dept, fee, peer, target, confidence }
  ]
}`;

export function useFeesImportHandlers(): ImportHandlerBundle {
  const { services, mergeFeeSchedule } = useBuildState();

  // Fee Schedule's two summaries differ subtly: PDF includes "from PDF"
  // in its sentence; clipboard does not. Each handler owns that
  // formatting so the existing copy is preserved verbatim.
  const apply = (rows: FeeRows, source: string, fromPdf: boolean) => {
    const extraction = feesToExtractionResult(rows, services, source);
    const applied = mergeFeeSchedule(extraction, source);
    const total = applied.mapped + applied.duplicates + applied.lowConfidence;
    const noun = `fee${total === 1 ? "" : "s"}`;
    const suffix = fromPdf ? " from PDF" : "";
    return `${total} ${noun} imported${suffix} (${applied.mapped} new, ${applied.duplicates} updated).`;
  };

  return {
    aiPdf: createPdfImportHandler({
      parsePdf: aiParseFeesPdf,
      apply: (parsed, fileName) => apply(parsed.fees, fileName, true),
      parseFailureMessage: "AI parsing failed.",
      importFailureMessage: "PDF parsing failed.",
    }),
    pasteJson: createJsonImportHandler({
      rootKey: "fees",
      apply: (rows, source) => apply(rows as FeeRows, source, false),
    }),
    title: "Import Fee Schedule",
    helper: "Import fees via Claude (PDF) or by pasting LLM JSON output.",
    tagline: "Current fees and adopted rates",
    pasteExample: "{ fees: [...] }",
    pasteHelper: "Paste structured output shaped like { fees: [...] }.",
    pasteSchema: FEES_SCHEMA,
  };
}

// ─── Overhead Cost Allocation (CAP) ────────────────────────────────────

const CAP_SCHEMA = `{
  centers: [{ name, glCode, totalCost, confidence }],
  bases:   [{ name, source, methodologyNote, driverKey, directTo, confidence }],
  basisUnits: [{ basis, source?, receivers:
    [{ dept, glCode, deptCode?, units, confidence? }] }],
  pools:   [{ center, pool, allocationPercent, amount,
              basis, recoverability, confidence }],
  directAllocations: [{ pool, center?, receivers:
    [{ dept, glCode, deptCode?, percent, confidence? }] }]
}`;

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
    const pools = capPoolsToExtractionResult(sections.pools, source);
    const bundle = {
      centers: capCentersToExtractionResult(sections.centers, source),
      bases:   capBasesToExtractionResult(sections.bases, source),
      basisUnits: capBasisUnitsToExtractionResult(sections.basisUnits, source),
      pools,
      directAllocations: capDirectAllocationsToExtractionResult(
        sections.directAllocations, pools, source,
      ),
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
    pasteJson: createJsonImportHandler({
      onStart: resetUnmappedBases,
      // No single rootKey — every section is optional but at least one
      // must be non-empty.
      validate: (parsed) => {
        const total =
          arrLen(parsed.centers) + arrLen(parsed.bases) + arrLen(parsed.basisUnits)
          + arrLen(parsed.pools) + arrLen(parsed.directAllocations);
        if (total === 0) {
          throw new Error('Expected { centers?, bases?, basisUnits?, pools?, directAllocations? } with at least one section.');
        }
      },
      apply: (payload, source) => {
        const p = payload as Record<string, unknown>;
        return applySections({
          centers: (Array.isArray(p.centers) ? p.centers : []) as CapCenterRows,
          bases:   (Array.isArray(p.bases)   ? p.bases   : []) as CapBaseRows,
          basisUnits: (Array.isArray(p.basisUnits) ? p.basisUnits : []) as CapBasisUnitRows,
          pools:   (Array.isArray(p.pools)   ? p.pools   : []) as CapPoolRows,
          directAllocations: (Array.isArray(p.directAllocations)
            ? p.directAllocations : []) as CapDirectAllocationRows,
        }, source);
      },
    }),
    title: "Import Overhead Cost Allocation",
    helper: "Imports centers, allocation bases, and cost pools.",
    tagline: "Indirect cost allocation methodology",
    pasteExample: "{ centers?, bases?, pools? }",
    pasteHelper: "Paste JSON shaped like { centers?, bases?, pools? }.",
    pasteSchema: CAP_SCHEMA,
    unmappedBases,
    setUnmappedBases,
  };
}
