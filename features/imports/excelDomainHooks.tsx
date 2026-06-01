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

import { useMemo } from "react";
import type { OperatingLine, Position, Service, VolumeRow } from "@/lib/types";
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

export function useExcelOperatingImport(): ExcelImportState<OperatingLine> {
  const { mergeOperating } = useBuildState();
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
      excelToOperatingExtraction(fileName, sheet, mapping),
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
      { label: "Category", value: op.category },
      { label: "Amount", value: `$${Number(op.amount).toLocaleString()}`, align: "right" },
    ],
  }), [mergeOperating]);
  return useExcelImport(spec);
}

export function ExcelOperatingMappingPanel({ state }: { state: ExcelImportState<OperatingLine> }) {
  return (
    <ExcelMappingPanel
      state={state}
      applyMerge={(s, setStatus, setWarns) => applyExcelImport(s, setStatus, setWarns)}
    />
  );
}
