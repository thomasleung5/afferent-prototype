/* Excel Fee Schedule mapping card.
 *
 * Import flow for fee schedules delivered as `.xlsx`. Uploads to the
 * deterministic /api/import/excel/preview endpoint, lets the analyst
 * pick sheet + header row + the four required columns (name / dept /
 * fee, plus optional unit), surfaces a live preview of what would
 * import, then routes the mapped rows through the same
 * `mergeFeeSchedule` store action the PDF/JSON paths already use. No
 * silent merge — the user has to click Import after reviewing.
 *
 * Exposed as three pieces so the upload button can sit beside the
 * Upload PDF button (in InlineImportCard's primary-action row) while
 * the mapping panel still renders below:
 *
 *   - `useExcelFeeImport()` — owns all state; call once per surface.
 *   - `<ExcelFeeUploadButton state={...} />` — just the upload button +
 *     hidden file input.
 *   - `<ExcelFeeMappingPanel state={...} />` — status, mapping form,
 *     skipped-row warnings — everything that renders after upload.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn } from "@/components/ui";
import {
  autoMapFees, excelToFeeExtraction, validateFeeMapping,
  type ExcelFeeWarning, type FeeAutoMapping, type FeeColumnMapping,
} from "@/lib/import/excelToFees";
import {
  previewExcelFile,
  type ExcelPreviewOk, type PreviewCell, type PreviewSheet,
} from "@/lib/import/excelPreview";
import { useBuildState } from "@/lib/store";

type Status = { ok: boolean; message: string } | null;

const PREVIEW_DISPLAY_ROWS = 8;

/** Fallback "pick a column" placeholder used in the select dropdowns. */
const UNSET = -1;

export interface ExcelFeeImportState {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  uploadStatus: Status;
  preview: ExcelPreviewOk | null;
  sheetIndex: number; setSheetIndex: (n: number) => void;
  headerRow: number; setHeaderRow: (n: number) => void;
  nameCol: number; setNameCol: (n: number) => void;
  deptCol: number; setDeptCol: (n: number) => void;
  feeCol: number; setFeeCol: (n: number) => void;
  unitCol: number; setUnitCol: (n: number) => void;
  importStatus: Status;
  warnings: ExcelFeeWarning[];
  autoMap: FeeAutoMapping | null;
  /** Existing services so the mapping panel can match duplicates by name. */
  existingServices: ReturnType<typeof useBuildState>["services"];
  handleFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  applyImport: (
    extraction: ReturnType<typeof excelToFeeExtraction>["extraction"],
    warns: ExcelFeeWarning[],
  ) => void;
}

/** Single-source-of-truth hook for the Excel fee import flow. Call
 *  once per surface; pass the returned state to both
 *  `<ExcelFeeUploadButton/>` and `<ExcelFeeMappingPanel/>`. */
export function useExcelFeeImport(): ExcelFeeImportState {
  const { services, mergeFeeSchedule } = useBuildState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<Status>(null);
  const [preview, setPreview] = useState<ExcelPreviewOk | null>(null);

  // Mapping state. Resets whenever a new file is uploaded.
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(1); // 1-based for UI
  const [nameCol, setNameCol] = useState<number>(UNSET);
  const [deptCol, setDeptCol] = useState<number>(UNSET);
  const [feeCol, setFeeCol] = useState<number>(UNSET);
  const [unitCol, setUnitCol] = useState<number>(UNSET);

  const [importStatus, setImportStatus] = useState<Status>(null);
  const [warnings, setWarnings] = useState<ExcelFeeWarning[]>([]);
  /** Result of the most recent autoMapFees call. Null until preview
   *  loads; used to drive the "auto-detected X" status line. */
  const [autoMap, setAutoMap] = useState<FeeAutoMapping | null>(null);

  // When the active sheet (or the preview itself) changes, run
  // autoMapFees on the chosen sheet and prefill header row + column
  // selections from the result. The user is free to override anything
  // — these are starting values, not locks. Without this, switching
  // sheets within a workbook would land on UNSET / row-1 every time
  // even if the new sheet has obvious headers.
  useEffect(() => {
    if (!preview) {
      setAutoMap(null);
      return;
    }
    const sheet = preview.sheets[sheetIndex];
    if (!sheet) {
      setAutoMap(null);
      setHeaderRow(1);
      setNameCol(UNSET);
      setDeptCol(UNSET);
      setFeeCol(UNSET);
      setUnitCol(UNSET);
      return;
    }
    const auto = autoMapFees(sheet);
    setAutoMap(auto);
    setHeaderRow(auto.headerRowIndex + 1);
    setNameCol(auto.nameCol < 0 ? UNSET : auto.nameCol);
    setDeptCol(auto.deptCol < 0 ? UNSET : auto.deptCol);
    setFeeCol(auto.feeCol < 0 ? UNSET : auto.feeCol);
    setUnitCol(auto.unitCol < 0 ? UNSET : auto.unitCol);
  }, [sheetIndex, preview]);

  const reset = () => {
    setPreview(null);
    setSheetIndex(0);
    setHeaderRow(1);
    setNameCol(UNSET);
    setDeptCol(UNSET);
    setFeeCol(UNSET);
    setUnitCol(UNSET);
    setImportStatus(null);
    setWarnings([]);
    setAutoMap(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting the same file
    reset();
    setUploadStatus(null);
    setUploading(true);
    try {
      const res = await previewExcelFile(file);
      if (!res.ok) {
        setUploadStatus({ ok: false, message: res.message });
        return;
      }
      setPreview(res);
      // Auto-pick the first NON-EMPTY sheet. Many workbooks ship with an
      // empty default Sheet1 and the real data on a later/named sheet —
      // defaulting to index 0 lands the user on an empty sheet with a
      // misleading "no rows" error. The header row + column selections
      // are filled in by the autoMapFees effect once preview + sheetIndex
      // settle, so we don't set them here.
      const firstNonEmpty = res.sheets.findIndex(
        (s) => s && s.rowCount > 0 && s.columnCount > 0,
      );
      setSheetIndex(firstNonEmpty >= 0 ? firstNonEmpty : 0);
      setUploadStatus({
        ok: true,
        message: `Loaded ${res.sheets.length} sheet${res.sheets.length === 1 ? "" : "s"} from ${res.fileName}.`,
      });
    } catch (err) {
      setUploadStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Excel preview failed.",
      });
    } finally {
      setUploading(false);
    }
  };

  const applyImport: ExcelFeeImportState["applyImport"] = (extraction, warns) => {
    if (!preview) return;
    const applied = mergeFeeSchedule(extraction, preview.fileName);
    setWarnings(warns);
    const total = applied.mapped + applied.duplicates;
    setImportStatus({
      ok: true,
      message: `Imported ${total} fee${total === 1 ? "" : "s"} (${applied.mapped} new, ${applied.duplicates} updated)${warns.length ? `; ${warns.length} row${warns.length === 1 ? "" : "s"} skipped` : ""}.`,
    });
  };

  return {
    fileInputRef, uploading, uploadStatus, preview,
    sheetIndex, setSheetIndex, headerRow, setHeaderRow,
    nameCol, setNameCol, deptCol, setDeptCol,
    feeCol, setFeeCol, unitCol, setUnitCol,
    importStatus, warnings, autoMap, existingServices: services,
    handleFile, applyImport,
  };
}

/** Just the Upload Excel button (and its hidden file input). Slotted
 *  into InlineImportCard's primary-action row via its `aiPdfAccessory`
 *  prop so the button sits beside Upload PDF. */
export function ExcelFeeUploadButton({ state }: { state: ExcelFeeImportState }) {
  return (
    <>
      <Btn
        kind="ghost"
        onClick={() => state.fileInputRef.current?.click()}
        disabled={state.uploading}
      >
        {state.uploading ? "Reading workbook…" : "Upload Excel"}
      </Btn>
      <input
        ref={state.fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: "none" }}
        onChange={state.handleFile}
      />
    </>
  );
}

/** Everything that renders AFTER the user picks a file — upload status,
 *  the column-mapping form, the post-import success line, and the
 *  skipped-rows panel. Renders nothing when no upload has happened yet. */
export function ExcelFeeMappingPanel({ state }: { state: ExcelFeeImportState }) {
  const {
    uploading, uploadStatus, preview, autoMap,
    sheetIndex, setSheetIndex, headerRow, setHeaderRow,
    nameCol, setNameCol, deptCol, setDeptCol, feeCol, setFeeCol,
    unitCol, setUnitCol, existingServices, importStatus, warnings, applyImport,
  } = state;

  if (!uploadStatus && !preview && !importStatus && warnings.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {uploadStatus && (
        <StatusLine status={uploadStatus} loading={uploading} loadingText="Parsing workbook…" label="EXCEL"/>
      )}

      {preview && (
        <MappingPanel
          preview={preview}
          autoMap={autoMap}
          sheetIndex={sheetIndex} setSheetIndex={setSheetIndex}
          headerRow={headerRow} setHeaderRow={setHeaderRow}
          nameCol={nameCol} setNameCol={setNameCol}
          deptCol={deptCol} setDeptCol={setDeptCol}
          feeCol={feeCol} setFeeCol={setFeeCol}
          unitCol={unitCol} setUnitCol={setUnitCol}
          existingServices={existingServices}
          onImport={(extraction, importedCount, dupCount, warns) => {
            applyImport(extraction, warns);
            // Suppress unused — mergeFeeSchedule's own result is the
            // source of truth so we don't double-count.
            void importedCount; void dupCount;
          }}
        />
      )}

      {importStatus && (
        <StatusLine status={importStatus} loading={false} loadingText="" label="IMPORT"/>
      )}

      {warnings.length > 0 && <WarningList warnings={warnings}/>}
    </div>
  );
}

// ── Mapping panel ──────────────────────────────────────────────────────

interface MappingPanelProps {
  preview: ExcelPreviewOk;
  autoMap: FeeAutoMapping | null;
  sheetIndex: number;
  setSheetIndex: (n: number) => void;
  headerRow: number;
  setHeaderRow: (n: number) => void;
  nameCol: number;
  setNameCol: (n: number) => void;
  deptCol: number;
  setDeptCol: (n: number) => void;
  feeCol: number;
  setFeeCol: (n: number) => void;
  unitCol: number;
  setUnitCol: (n: number) => void;
  existingServices: ReturnType<typeof useBuildState>["services"];
  onImport: (
    extraction: ReturnType<typeof excelToFeeExtraction>["extraction"],
    importedCount: number, dupCount: number,
    warnings: ExcelFeeWarning[],
  ) => void;
}

function MappingPanel(props: MappingPanelProps) {
  const {
    preview, autoMap, sheetIndex, setSheetIndex, headerRow, setHeaderRow,
    nameCol, setNameCol, deptCol, setDeptCol, feeCol, setFeeCol,
    unitCol, setUnitCol, existingServices, onImport,
  } = props;

  // Defensive reads. Although the PreviewSheet type marks these as
  // required, a malformed preview payload would otherwise produce
  // "undefined is not an object" runtime errors during render. Every
  // downstream access (label computation, validation, extraction)
  // routes through these normalized locals so a bad sheet shape
  // surfaces as a friendly mapping error, not a crash.
  const sheets: PreviewSheet[] = Array.isArray(preview?.sheets) ? preview.sheets : [];
  const sheet: PreviewSheet | undefined = sheets[sheetIndex];
  const sheetRows: PreviewCell[][] = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const sheetRowCount = sheet && typeof sheet.rowCount === "number"
    ? Math.max(sheet.rowCount, sheetRows.length)
    : sheetRows.length;
  const sheetColumnCount = sheet && typeof sheet.columnCount === "number"
    ? sheet.columnCount
    : sheetRows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);

  // Clamp the header-row input into the sheet's actual range. We don't
  // mutate state on render (avoids feedback loops); validateFeeMapping
  // will surface an out-of-range value as a mapping error.
  const headerIdx = Math.max(0, headerRow - 1);

  // Column header labels come from the chosen header row when valid;
  // otherwise fall back to A/B/C… letters so the dropdowns are still
  // usable on sheets without a real header row.
  const columnLabels = useMemo<string[]>(() => {
    if (!sheet || sheetColumnCount === 0) return [];
    const headerRowValues = sheetRows[headerIdx];
    if (!Array.isArray(headerRowValues)) {
      return Array.from({ length: sheetColumnCount }, (_, i) => colLetter(i));
    }
    return Array.from({ length: sheetColumnCount }, (_, i) => {
      const v = headerRowValues[i];
      if (v == null || v === "") return colLetter(i);
      return `${colLetter(i)} · ${String(v)}`;
    });
  }, [sheet, sheetRows, headerIdx, sheetColumnCount]);

  const mapping: FeeColumnMapping = {
    headerRowIndex: headerIdx,
    nameCol, deptCol, feeCol,
    unitCol: unitCol === UNSET ? null : unitCol,
  };

  const mappingErrors = sheet ? validateFeeMapping(sheet, mapping) : ["No sheets in workbook."];

  const result = useMemo(() => {
    if (!sheet || mappingErrors.length > 0) return null;
    return excelToFeeExtraction(preview.fileName, sheet, mapping, existingServices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.fileName, sheet, headerIdx, nameCol, deptCol, feeCol, unitCol, existingServices, mappingErrors.length]);

  if (!sheet) {
    return (
      <div style={{
        border: "1px solid var(--rule)", background: "var(--paper)",
        padding: "12px 14px", fontSize: 12, color: "var(--ink-3)",
      }}>
        No sheets to map.
      </div>
    );
  }

  const dataRowsAvailable = Math.max(0, sheetRowCount - headerRow);

  return (
    <div style={{
      border: "1px solid var(--rule)",
      background: "var(--paper)",
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <Eyebrow>Map columns</Eyebrow>

      {autoMap && <AutoMapStatus auto={autoMap}/>}

      <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 12px", alignItems: "baseline" }}>
        <Label>Sheet</Label>
        <select
          value={sheetIndex}
          onChange={(e) => setSheetIndex(Number(e.target.value))}
          style={selectStyle}
        >
          {sheets.map((s, i) => {
            const rc = typeof s?.rowCount === "number" ? s.rowCount : 0;
            const name = s?.name ?? `Sheet ${i + 1}`;
            return (
              <option key={name} value={i}>
                {name} — {rc.toLocaleString()} row{rc === 1 ? "" : "s"}
              </option>
            );
          })}
        </select>

        <Label>Header row</Label>
        <input
          type="number"
          min={1}
          // Clamp the max to the actual row count we've seen. If the
          // user pastes a larger value, validateFeeMapping catches it.
          max={Math.max(1, sheetRowCount)}
          value={headerRow}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) { setHeaderRow(1); return; }
            setHeaderRow(Math.max(1, Math.floor(n)));
          }}
          style={{ ...selectStyle, width: 80 }}
        />

        <Label>Fee / service name</Label>
        <ColumnSelect value={nameCol} onChange={setNameCol} columnLabels={columnLabels}/>

        <Label>Department</Label>
        <ColumnSelect value={deptCol} onChange={setDeptCol} columnLabels={columnLabels}/>

        <Label>Current fee amount</Label>
        <ColumnSelect value={feeCol} onChange={setFeeCol} columnLabels={columnLabels}/>

        <Label>Unit <Subtle>(optional)</Subtle></Label>
        <ColumnSelect value={unitCol} onChange={setUnitCol} columnLabels={columnLabels} allowUnset/>
      </div>

      {mappingErrors.length > 0 && (
        <ul style={{
          margin: 0, padding: "8px 12px", listStyle: "disc inside",
          background: "var(--warn-tint)", color: "var(--warn)",
          fontSize: 12, lineHeight: 1.5,
        }}>
          {mappingErrors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      {/* Live preview of what would import. */}
      {result && (
        <MappedRowsPreview
          result={result}
          dataRowsAvailable={dataRowsAvailable}
        />
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Btn
          kind="primary"
          disabled={!result || result.importedRowCount === 0}
          onClick={() => {
            if (!result) return;
            onImport(
              result.extraction,
              result.importedRowCount,
              result.extraction.duplicates.length,
              result.warnings,
            );
          }}
        >
          {result
            ? (result.importedRowCount === 0
                ? "No importable rows"
                : `Import ${result.importedRowCount.toLocaleString()} fee${result.importedRowCount === 1 ? "" : "s"}`)
            : "Pick required columns"}
        </Btn>
      </div>
    </div>
  );
}

// ── Live mapped-row preview ────────────────────────────────────────────

function MappedRowsPreview({
  result, dataRowsAvailable,
}: {
  result: NonNullable<ReturnType<typeof excelToFeeExtraction>>;
  dataRowsAvailable: number;
}) {
  const allRows = [
    ...result.extraction.mapped,
    ...result.extraction.duplicates,
  ];
  const display = allRows.slice(0, PREVIEW_DISPLAY_ROWS);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Eyebrow>
        Sample · showing {display.length} of {result.importedRowCount.toLocaleString()} importable
        {dataRowsAvailable !== result.importedRowCount + result.skippedRowCount
          ? ` (out of ${dataRowsAvailable.toLocaleString()} data rows)`
          : ""}
        {result.skippedRowCount > 0 && (
          <> · <span style={{ color: "var(--warn)" }}>{result.skippedRowCount} skipped</span></>
        )}
      </Eyebrow>
      <div style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto auto auto",
        gap: "4px 12px",
        fontSize: "var(--t-l7)",
        alignItems: "baseline",
      }}>
        <HeaderCell>Row</HeaderCell>
        <HeaderCell>Fee / service</HeaderCell>
        <HeaderCell>Dept</HeaderCell>
        <HeaderCell align="right">Fee</HeaderCell>
        <HeaderCell>Status</HeaderCell>
        {display.map(({ entity, lineage }, i) => (
          <div key={`${lineage.row}-${i}`} style={{
            display: "contents",
          }}>
            <span className="mono" style={{ color: "var(--ink-3)", fontSize: "var(--t-l8)" }}>{String(lineage.row)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entity.name}>
              {entity.name}
            </span>
            <span className="mono" style={{ fontSize: "var(--t-l8)" }}>{entity.dept}</span>
            <span className="num" style={{ textAlign: "right" }}>${Number(entity.fee).toLocaleString()}</span>
            <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>
              {result.extraction.duplicates.find((d) => d.entity.id === entity.id) ? "Update" : "New"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Warnings list (rendered after import) ──────────────────────────────

function WarningList({ warnings }: { warnings: ExcelFeeWarning[] }) {
  return (
    <div style={{
      border: "1px solid var(--rule)", background: "var(--paper)",
      padding: "10px 14px",
    }}>
      <Eyebrow>Skipped rows</Eyebrow>
      <div style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "2px 12px",
        fontSize: "var(--t-l7)",
        marginTop: 6,
      }}>
        {warnings.map((w, i) => (
          <div key={i} style={{ display: "contents" }}>
            <span className="mono" style={{ color: "var(--ink-3)", fontSize: "var(--t-l8)" }}>
              Row {w.row}
            </span>
            <span style={{ color: "var(--ink-2)" }}>{w.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Small UI atoms ─────────────────────────────────────────────────────

function ColumnSelect({
  value, onChange, columnLabels, allowUnset = false,
}: {
  value: number;
  onChange: (n: number) => void;
  columnLabels: string[];
  allowUnset?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={selectStyle}
    >
      <option value={UNSET}>{allowUnset ? "— None —" : "— Pick column —"}</option>
      {columnLabels.map((label, i) => (
        <option key={i} value={i}>{label}</option>
      ))}
    </select>
  );
}

/** Inline summary of what autoMapFees found — green note when the
 *  three required columns matched, warn-tinted note when something
 *  still needs picking. Optional Unit isn't called out as missing. */
function AutoMapStatus({ auto }: { auto: FeeAutoMapping }) {
  const required: ("name" | "dept" | "fee")[] = ["name", "dept", "fee"];
  const found = required.filter((k) => auto.detected[k]);
  const missing = required.filter((k) => !auto.detected[k]);
  const allRequired = missing.length === 0;
  const noneDetected = found.length === 0 && !auto.detected.unit;

  const label = (k: "name" | "dept" | "fee" | "unit"): string =>
    k === "name" ? "name"
    : k === "dept" ? "dept"
    : k === "fee" ? "fee"
    : "unit";

  let message: string;
  if (noneDetected) {
    message = "Couldn't auto-detect columns. Pick the columns below to start.";
  } else if (allRequired) {
    const extras: ("name" | "dept" | "fee" | "unit")[] = auto.detected.unit
      ? [...found, "unit"]
      : [...found];
    message = `Auto-detected ${extras.map(label).join(", ")}${auto.detected.unit ? "" : " — unit optional"}.`;
  } else {
    const foundList = found.map(label).join(", ");
    const missingList = missing.map(label).join(", ");
    message = `Auto-detected ${foundList || "no columns"}. Pick a column for ${missingList}.`;
  }

  const tone = noneDetected
    ? "var(--ink-3)"
    : allRequired
      ? "var(--pos)"
      : "var(--warn)";
  return (
    <div style={{ fontSize: 12, color: tone, lineHeight: 1.5 }}>
      {message}
    </div>
  );
}

function StatusLine({
  status, loading, loadingText, label,
}: { status: Status; loading: boolean; loadingText: string; label: string }) {
  if (!status && !loading) return null;
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 12,
      paddingTop: 4,
      borderTop: "1px dashed var(--rule)",
    }}>
      <span className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</span>
      <span style={{
        marginLeft: "auto",
        fontSize: 12,
        color: loading ? "var(--ink-3)" : status?.ok ? "var(--pos)" : "var(--warn)",
        fontWeight: loading ? 400 : 500,
      }}>
        {loading ? loadingText : status?.message}
      </span>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
      color: "var(--ink-3)", textTransform: "uppercase",
    }}>{children}</div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: "var(--t-l7)", color: "var(--ink-2)",
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function Subtle({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{children}</span>;
}

function HeaderCell({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <span className="mono" style={{
      fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.1em",
      color: "var(--ink-3)", textTransform: "uppercase",
      textAlign: align,
    }}>{children}</span>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "4px 6px",
  fontSize: "var(--t-l7)",
  fontFamily: "var(--ff-ui)",
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  color: "var(--ink)",
};

function colLetter(i: number): string {
  // Excel-style column letters: 0 → A, 25 → Z, 26 → AA…
  let n = i;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}
