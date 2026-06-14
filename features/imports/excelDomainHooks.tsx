/* Per-domain Excel import hooks.
 *
 * Each hook wires a domain's converter / validator / store action into
 * the generic `useExcelImport`. The Source Data cards consume these
 * hooks plus `<ExcelUploadButton/>` and `<ExcelFeeMappingPanel-style
 * wrapper/>` from this file.
 *
 * Fees lives in its own ExcelFeeImportCard.tsx for historical reasons;
 * its shape is mirrored here so the four new domains follow the same
 * pattern. The wired-up Mapping panel for each domain uses the shared
 * `applyExcelImport` from ExcelFeeImportCard.tsx so post-import status
 * text stays consistent. */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  OpCategory, OperatingLine, Position, Service, VolumeRow,
} from "@/lib/types";
import { normalizeSourceCategoryKey } from "@/lib/import/excelToOperating";
import { OP_CATEGORIES } from "@/lib/ai/parseOperating";
import type { DomainMapping } from "@/lib/import/excelDomainSpec";
import {
  autoMapServices, excelToServicesExtraction, validateServicesMapping,
} from "@/lib/import/excelToServices";
import {
  autoMapVolume, excelToVolumeExtraction, validateVolumeMapping,
} from "@/lib/import/excelToVolume";
import {
  autoMapLabor, excelToLaborExtraction, validateLaborMapping,
} from "@/lib/import/excelToLabor";
import {
  autoMapOperating, excelToOperatingExtraction, validateOperatingMapping,
} from "@/lib/import/excelToOperating";
import type { ExcelImportDomainSpec } from "@/lib/import/excelDomainSpec";
import {
  useExcelImport, ExcelMappingPanel, type ExcelImportState,
} from "@/features/imports/ExcelImportCard";
import { applyExcelImport } from "@/features/imports/ExcelFeeImportCard";
import { useBuildState } from "@/lib/store";

// ── Services ──────────────────────────────────────────────────────────

export function useExcelServicesImport(): ExcelImportState<Service> {
  const { services, mergeServices } = useBuildState();
  const spec = useMemo<ExcelImportDomainSpec<Service>>(() => ({
    noun: { singular: "service", plural: "services" },
    roles: [
      { key: "name",   label: "Service name" },
      { key: "dept",   label: "Department" },
      { key: "hours",  label: "Hours per occurrence" },
      { key: "volume", label: "Annual volume", optional: true },
      { key: "fee",    label: "Current fee", optional: true },
      { key: "target", label: "Recovery target %", optional: true },
    ],
    autoMap: autoMapServices,
    validate: validateServicesMapping,
    convert: (fileName, sheet, mapping) =>
      excelToServicesExtraction(fileName, sheet, mapping, services),
    applyMerge: (extraction, fileName) => mergeServices(extraction, fileName),
    previewHeaders: [
      { label: "Service" },
      { label: "Dept" },
      { label: "Hours", align: "right" },
      { label: "Fee",   align: "right" },
    ],
    previewRow: (svc) => [
      { label: "Service", value: svc.name },
      { label: "Dept", value: svc.dept },
      { label: "Hours", value: Number(svc.hours).toLocaleString(undefined, { maximumFractionDigits: 1 }), align: "right" },
      { label: "Fee",   value: `$${Number(svc.fee).toLocaleString()}`, align: "right" },
    ],
  }), [services, mergeServices]);
  return useExcelImport(spec);
}

export function ExcelServicesMappingPanel({ state }: { state: ExcelImportState<Service> }) {
  return (
    <ExcelMappingPanel
      state={state}
      applyMerge={(s, setStatus, setWarns) => applyExcelImport(s, setStatus, setWarns)}
    />
  );
}

// ── Volume ────────────────────────────────────────────────────────────

export function useExcelVolumeImport(): ExcelImportState<VolumeRow> {
  const { services, volume, mergeVolume } = useBuildState();
  const spec = useMemo<ExcelImportDomainSpec<VolumeRow>>(() => ({
    noun: { singular: "row", plural: "rows" },
    roles: [
      { key: "name",    label: "Service name" },
      { key: "dept",    label: "Department" },
      { key: "current", label: "Current volume", optional: true },
      { key: "prior",   label: "Prior volume",   optional: true },
      { key: "unit",    label: "Unit",           optional: true },
    ],
    autoMap: autoMapVolume,
    validate: validateVolumeMapping,
    convert: (fileName, sheet, mapping) =>
      excelToVolumeExtraction(fileName, sheet, mapping, services, volume),
    applyMerge: (extraction, fileName) => mergeVolume(extraction, fileName),
    previewHeaders: [
      { label: "Service ID" },
      { label: "Prior",   align: "right" },
      { label: "Current", align: "right" },
    ],
    previewRow: (row) => [
      { label: "Service ID", value: row.id },
      { label: "Prior",   value: row.prior   == null ? "—" : Number(row.prior).toLocaleString(),   align: "right" },
      { label: "Current", value: row.current == null ? "—" : Number(row.current).toLocaleString(), align: "right" },
    ],
  }), [services, volume, mergeVolume]);
  return useExcelImport(spec);
}

export function ExcelVolumeMappingPanel({ state }: { state: ExcelImportState<VolumeRow> }) {
  return (
    <ExcelMappingPanel
      state={state}
      applyMerge={(s, setStatus, setWarns) => applyExcelImport(s, setStatus, setWarns)}
    />
  );
}

// ── Labor ─────────────────────────────────────────────────────────────

export function useExcelLaborImport(): ExcelImportState<Position> {
  const { mergePositions } = useBuildState();
  const spec = useMemo<ExcelImportDomainSpec<Position>>(() => ({
    noun: { singular: "position", plural: "positions" },
    roles: [
      { key: "title", label: "Position title" },
      { key: "dept",  label: "Department" },
      { key: "fte",   label: "FTE" },
      { key: "hours", label: "Annual hours" },
    ],
    autoMap: autoMapLabor,
    validate: validateLaborMapping,
    convert: (fileName, sheet, mapping) =>
      excelToLaborExtraction(fileName, sheet, mapping),
    applyMerge: (extraction, fileName) => mergePositions(extraction, fileName),
    previewHeaders: [
      { label: "Title" },
      { label: "Dept" },
      { label: "FTE",   align: "right" },
      { label: "Hours", align: "right" },
    ],
    previewRow: (pos) => [
      { label: "Title", value: pos.title },
      { label: "Dept",  value: pos.dept },
      { label: "FTE",   value: Number(pos.fte).toLocaleString(undefined, { maximumFractionDigits: 2 }), align: "right" },
      { label: "Hours", value: Number(pos.hours).toLocaleString(), align: "right" },
    ],
  }), [mergePositions]);
  return useExcelImport(spec);
}

export function ExcelLaborMappingPanel({ state }: { state: ExcelImportState<Position> }) {
  return (
    <ExcelMappingPanel
      state={state}
      applyMerge={(s, setStatus, setWarns) => applyExcelImport(s, setStatus, setWarns)}
    />
  );
}

// ── Operating ─────────────────────────────────────────────────────────

/** Operating imports differ from the other domains: the source-document
 *  category column rarely matches the canonical OpCategory list
 *  verbatim, so we surface a review step before the merge. The spec
 *  carries a ref to the persisted per-study mappings; `useExcelOperatingImport`
 *  returns the extra state the panel needs to thread analyst resolutions
 *  through. */
interface ExcelOperatingImportState extends ExcelImportState<OperatingLine> {
  /** Mappings persisted from earlier imports in this study. */
  savedCategoryMappings: Record<string, OpCategory>;
  /** Resolutions the analyst has picked in the current review block,
   *  keyed by the normalized source-category string. */
  pendingCategoryMappings: Record<string, OpCategory>;
  setPendingCategoryMapping: (sourceKey: string, canonical: OpCategory) => void;
  /** Reset the pending review state — called after a successful import
   *  so the next workbook starts fresh. */
  resetPendingCategoryMappings: () => void;
}

export function useExcelOperatingImport(): ExcelOperatingImportState {
  const { mergeOperating, operatingCategoryMappings } = useBuildState();
  // Stable ref so spec.convert reads the current persisted mappings on
  // every invocation without invalidating the spec (the panel's
  // auto-detect effect depends on spec; rebuilding it on every save
  // would clobber the user's column picks).
  const savedRef = useRef(operatingCategoryMappings);
  useEffect(() => {
    savedRef.current = operatingCategoryMappings;
  }, [operatingCategoryMappings]);

  const [pendingCategoryMappings, setPendingCategoryMappings] =
    useState<Record<string, OpCategory>>({});

  const spec = useMemo<ExcelImportDomainSpec<OperatingLine>>(() => ({
    noun: { singular: "line", plural: "lines" },
    roles: [
      { key: "line",     label: "Line description" },
      { key: "dept",     label: "Department" },
      { key: "amount",   label: "Amount" },
      { key: "code",     label: "Account code", optional: true },
      { key: "category", label: "Category",     optional: true },
    ],
    autoMap: autoMapOperating,
    validate: validateOperatingMapping,
    convert: (fileName, sheet, mapping) =>
      excelToOperatingExtraction(fileName, sheet, mapping, savedRef.current),
    applyMerge: (extraction, fileName) => mergeOperating(extraction, fileName),
    previewHeaders: [
      { label: "Line" },
      { label: "Dept" },
      { label: "Category" },
      { label: "Amount", align: "right" },
    ],
    previewRow: (op) => [
      { label: "Line", value: op.line },
      { label: "Dept", value: op.dept },
      { label: "Category", value: op.needsCategoryMapping
        ? `${op.sourceCategory ?? "(blank)"} — needs review`
        : op.category },
      { label: "Amount", value: `$${Number(op.amount).toLocaleString()}`, align: "right" },
    ],
  }), [mergeOperating]);

  const base = useExcelImport(spec);

  return {
    ...base,
    savedCategoryMappings: operatingCategoryMappings,
    pendingCategoryMappings,
    setPendingCategoryMapping: (sourceKey, canonical) => {
      setPendingCategoryMappings((prev) => ({ ...prev, [sourceKey]: canonical }));
    },
    resetPendingCategoryMappings: () => setPendingCategoryMappings({}),
  };
}

/** Operating-specific mapping panel. Wraps the generic ExcelMappingPanel
 *  and slots a source-category review block between the preview and the
 *  Import button. Import is blocked until every unmapped source category
 *  surfaced by the converter has an analyst-selected canonical OpCategory.
 *  On import, the resolutions are merged into the saved per-study
 *  mappings so subsequent imports apply them automatically. */
export function ExcelOperatingMappingPanel({ state }: { state: ExcelOperatingImportState }) {
  const { mergeOperating, saveOperatingCategoryMappings } = useBuildState();
  const {
    preview, sheetIndex, headerRow, cols,
    savedCategoryMappings, pendingCategoryMappings, setPendingCategoryMapping,
    resetPendingCategoryMappings,
  } = state;

  const effectiveMappings = useMemo(
    () => ({ ...savedCategoryMappings, ...pendingCategoryMappings }),
    [savedCategoryMappings, pendingCategoryMappings],
  );

  // Compute the unmapped-source-category list once per render so the
  // review block stays in lockstep with the inner panel's preview.
  // Mirrors the generic panel's own convert call — duplicate work, but
  // small (one Excel sheet, in-memory) and keeps the operating panel
  // independent of the generic panel's internal memoization.
  const reviewQueue: string[] = useMemo(() => {
    if (!preview) return [];
    const sheet = preview.sheets[sheetIndex];
    if (!sheet) return [];
    const mapping: DomainMapping = {
      headerRowIndex: Math.max(0, headerRow - 1),
      cols,
    };
    const errors = validateOperatingMapping(sheet, mapping);
    if (errors.length > 0) return [];
    const result = excelToOperatingExtraction(
      preview.fileName, sheet, mapping, effectiveMappings,
    );
    return result.unmappedSourceCategories;
  }, [preview, sheetIndex, headerRow, cols, effectiveMappings]);

  const unresolvedCount = reviewQueue.length;
  const blockImport = unresolvedCount > 0;
  const blockReason = unresolvedCount === 1
    ? "Resolve 1 category to import"
    : `Resolve ${unresolvedCount.toLocaleString()} categories to import`;

  const reviewNode = reviewQueue.length === 0 ? null : (
    <OperatingCategoryReview
      queue={reviewQueue}
      pendingMappings={pendingCategoryMappings}
      onPick={(sourceCategory, canonical) => {
        setPendingCategoryMapping(normalizeSourceCategoryKey(sourceCategory), canonical);
      }}
    />
  );

  return (
    <ExcelMappingPanel
      state={state}
      applyMerge={(s, setStatus, setWarns) => {
        if (!preview) return;
        const sheet = preview.sheets[sheetIndex];
        if (!sheet) return;
        const mapping: DomainMapping = {
          headerRowIndex: Math.max(0, headerRow - 1),
          cols,
        };
        if (validateOperatingMapping(sheet, mapping).length > 0) return;
        const result = excelToOperatingExtraction(
          preview.fileName, sheet, mapping, effectiveMappings,
        );
        // Defensive: if a row is still flagged for review at import
        // time, surface the block instead of merging incomplete data.
        if (result.unmappedSourceCategories.length > 0) {
          setStatus({
            ok: false,
            message: `Cannot import: ${result.unmappedSourceCategories.length} source categor${result.unmappedSourceCategories.length === 1 ? "y" : "ies"} still need review.`,
          });
          return;
        }
        const applied = mergeOperating(result.extraction, preview.fileName);
        // Persist analyst resolutions so the next import within this
        // study auto-applies them.
        if (Object.keys(pendingCategoryMappings).length > 0) {
          saveOperatingCategoryMappings(pendingCategoryMappings);
        }
        resetPendingCategoryMappings();
        setWarns(result.warnings);
        const total = applied.mapped + applied.duplicates;
        const noun = total === 1 ? s.spec.noun.singular : s.spec.noun.plural;
        setStatus({
          ok: true,
          message: `Imported ${total} ${noun} (${applied.mapped} new, ${applied.duplicates} updated)${result.warnings.length ? `; ${result.warnings.length} row${result.warnings.length === 1 ? "" : "s"} skipped` : ""}.`,
        });
      }}
      extraReview={preview && reviewNode ? { node: reviewNode, blockImport, blockReason } : undefined}
    />
  );
}

function OperatingCategoryReview({
  queue, pendingMappings, onPick,
}: {
  queue: string[];
  pendingMappings: Record<string, OpCategory>;
  onPick: (sourceCategory: string, canonical: OpCategory) => void;
}) {
  return (
    <div style={{
      border: "1px solid var(--rule)",
      background: "var(--paper-2)",
      padding: "10px 14px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        Map source categories ({queue.length})
      </div>
      <div style={{
        fontSize: "var(--t-l7)", color: "var(--ink-3)", lineHeight: 1.5,
      }}>
        Pick a canonical category for each source-document value. The
        original text is preserved on every row for audit; the chosen
        canonical value drives filtering, reporting, and exports. Choices
        are saved to the study so later imports apply them automatically.
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "6px 12px",
        alignItems: "center",
      }}>
        {queue.map((sourceCategory) => {
          const key = normalizeSourceCategoryKey(sourceCategory);
          const picked = pendingMappings[key];
          return (
            <div key={key} style={{ display: "contents" }}>
              <span style={{ fontSize: "var(--t-l7)", color: "var(--ink-2)" }}>
                {sourceCategory}
              </span>
              <select
                value={picked ?? ""}
                onChange={(e) => onPick(sourceCategory, e.target.value as OpCategory)}
                style={{
                  padding: "4px 6px",
                  fontSize: "var(--t-l7)",
                  fontFamily: "var(--ff-ui)",
                  border: "1px solid var(--rule)",
                  background: "var(--paper)",
                  color: "var(--ink)",
                  minWidth: 240,
                }}
              >
                <option value="">— Pick a canonical category —</option>
                {OP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
