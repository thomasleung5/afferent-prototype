/* Excel Fee Schedule mapping card — thin spec on top of the generic
 * `<ExcelImportCard/>`. Owns the Fees-specific column roles, store
 * action, and preview-row formatter. */

import { useMemo } from "react";
import type { Service } from "@/lib/types";
import {
  autoMapFees, excelToFeeExtraction, validateFeeMapping,
  type FeeColumnMapping,
} from "@/lib/import/excelToFees";
import type {
  DomainMapping, ExcelImportDomainSpec,
} from "@/lib/import/excelDomainSpec";
import {
  useExcelImport, ExcelUploadButton, ExcelMappingPanel,
  type ExcelImportState,
} from "@/features/imports/ExcelImportCard";
import { useBuildState } from "@/lib/store";

export { ExcelUploadButton as ExcelFeeUploadButton } from "@/features/imports/ExcelImportCard";

/** Re-exports for the wired-up Fees card surface. The Fees card uses
 *  the generic mapping panel directly; this wrapper just supplies the
 *  Fees spec. */
export function useExcelFeeImport(): ExcelImportState<Service> {
  const { services, mergeFeeSchedule } = useBuildState();

  const spec = useMemo<ExcelImportDomainSpec<Service>>(() => ({
    noun: { singular: "fee", plural: "fees" },
    roles: [
      { key: "name", label: "Fee / service name" },
      { key: "dept", label: "Department" },
      { key: "fee",  label: "Current fee amount" },
      { key: "unit", label: "Unit", optional: true },
    ],
    autoMap: (sheet) => {
      const auto = autoMapFees(sheet);
      return {
        headerRowIndex: auto.headerRowIndex,
        cols: { name: auto.nameCol, dept: auto.deptCol, fee: auto.feeCol, unit: auto.unitCol },
        detected: auto.detected,
      };
    },
    validate: (sheet, mapping: DomainMapping) => validateFeeMapping(sheet, {
      headerRowIndex: mapping.headerRowIndex,
      nameCol: mapping.cols.name ?? -1,
      deptCol: mapping.cols.dept ?? -1,
      feeCol:  mapping.cols.fee  ?? -1,
      unitCol: mapping.cols.unit != null && mapping.cols.unit >= 0 ? mapping.cols.unit : null,
    } as FeeColumnMapping),
    convert: (fileName, sheet, mapping) => excelToFeeExtraction(fileName, sheet, {
      headerRowIndex: mapping.headerRowIndex,
      nameCol: mapping.cols.name ?? -1,
      deptCol: mapping.cols.dept ?? -1,
      feeCol:  mapping.cols.fee  ?? -1,
      unitCol: mapping.cols.unit != null && mapping.cols.unit >= 0 ? mapping.cols.unit : null,
    } as FeeColumnMapping, services),
    applyMerge: (extraction, fileName) => mergeFeeSchedule(extraction, fileName),
    previewHeaders: [
      { label: "Fee / service" },
      { label: "Dept" },
      { label: "Fee", align: "right" },
    ],
    previewRow: (svc) => [
      { label: "Fee / service", value: svc.name },
      { label: "Dept", value: svc.dept },
      { label: "Fee", value: `$${Number(svc.fee).toLocaleString()}`, align: "right" },
    ],
  }), [services, mergeFeeSchedule]);

  return useExcelImport(spec);
}

/** Convenience export for RefreshImportGrid — combines the upload
 *  button + mapping panel using the standard Fees spec. */
export function ExcelFeeMappingPanel({ state }: { state: ExcelImportState<Service> }) {
  return (
    <ExcelMappingPanel
      state={state}
      applyMerge={(s, setStatus, setWarns) => applyExcelImport(s, setStatus, setWarns)}
    />
  );
}

// ── Shared applyMerge implementation ──────────────────────────────────
//
// The generic ExcelMappingPanel takes an applyMerge callback that
// computes the extraction (re-running the spec's convert), calls
// spec.applyMerge, then surfaces a status + warnings. The same logic
// applies for every domain, so it's centralized here for re-use.

export function applyExcelImport<Entity>(
  state: ExcelImportState<Entity>,
  setStatus: (s: { ok: boolean; message: string } | null) => void,
  setWarnings: (w: { row: number; reason: string }[]) => void,
): void {
  const { spec, preview, sheetIndex, headerRow, cols } = state;
  if (!preview) return;
  const sheet = preview.sheets[sheetIndex];
  if (!sheet) return;
  const mapping: DomainMapping = {
    headerRowIndex: Math.max(0, headerRow - 1),
    cols,
  };
  if (spec.validate(sheet, mapping).length > 0) return;
  const result = spec.convert(preview.fileName, sheet, mapping);
  const applied = spec.applyMerge(result.extraction, preview.fileName);
  setWarnings(result.warnings);
  const total = applied.mapped + applied.duplicates;
  const noun = total === 1 ? state.spec.noun.singular : state.spec.noun.plural;
  setStatus({
    ok: true,
    message: `Imported ${total} ${noun} (${applied.mapped} new, ${applied.duplicates} updated)${result.warnings.length ? `; ${result.warnings.length} row${result.warnings.length === 1 ? "" : "s"} skipped` : ""}.`,
  });
}
