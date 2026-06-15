/* Generic Excel-import card.
 *
 * Domain-agnostic UI driven by an `ExcelImportDomainSpec`. Each
 * Source-Data domain (fees / services / volume / labor / operating)
 * supplies a spec that wires the generic sheet/column-picker /
 * preview / Import affordances to its own column roles, validation,
 * converter, and store merge action.
 *
 * Exposed as three pieces so the upload button can sit beside the
 * Upload PDF button while the mapping panel renders below:
 *
 *   - `useExcelImport(spec)` — owns all state; call once per card.
 *   - `<ExcelUploadButton state={...} />`
 *   - `<ExcelMappingPanel state={...} />`
 *
 * `spec` should be memoized in the consumer (useMemo over the source
 * data it closes over) so the inner auto-detect effect doesn't churn. */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Btn, Spinner } from "@/components/ui";
import {
  previewExcelFile,
  type ExcelPreviewOk, type PreviewCell, type PreviewSheet,
} from "@/lib/import/excelPreview";
import type {
  DomainAutoMapping, DomainMapping,
  ExcelImportDomainSpec, ExcelImportWarning,
} from "@/lib/import/excelDomainSpec";

type Status = { ok: boolean; message: string } | null;

const PREVIEW_DISPLAY_ROWS = 8;
const UNSET = -1;

export interface ExcelImportState<Entity> {
  spec: ExcelImportDomainSpec<Entity>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  uploadStatus: Status;
  /** Filename of the workbook currently being previewed. Set the moment
   *  the user picks a file; cleared in the `handleFile` finally block.
   *  Surfaced next to the "Parsing workbook…" status so the user can
   *  confirm the right document is being processed. */
  uploadingFileName: string | null;
  preview: ExcelPreviewOk | null;
  sheetIndex: number; setSheetIndex: (n: number) => void;
  headerRow: number; setHeaderRow: (n: number) => void;
  cols: Record<string, number>;
  setCol: (key: string, n: number) => void;
  importStatus: Status;
  warnings: ExcelImportWarning[];
  autoMap: DomainAutoMapping | null;
  handleFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export function useExcelImport<Entity>(
  spec: ExcelImportDomainSpec<Entity>,
): ExcelImportState<Entity> {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<Status>(null);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExcelPreviewOk | null>(null);

  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(1);
  const [cols, setCols] = useState<Record<string, number>>(() => emptyCols(spec));

  const [importStatus, setImportStatus] = useState<Status>(null);
  const [warnings, setWarnings] = useState<ExcelImportWarning[]>([]);
  const [autoMap, setAutoMap] = useState<DomainAutoMapping | null>(null);

  const setCol = (key: string, n: number) => setCols((prev) => ({ ...prev, [key]: n }));

  // Auto-detect on preview load / sheet change.
  useEffect(() => {
    if (!preview) { setAutoMap(null); return; }
    const sheet = preview.sheets[sheetIndex];
    if (!sheet) {
      setAutoMap(null);
      setHeaderRow(1);
      setCols(emptyCols(spec));
      return;
    }
    const auto = spec.autoMap(sheet);
    setAutoMap(auto);
    setHeaderRow(auto.headerRowIndex + 1);
    const next: Record<string, number> = {};
    for (const r of spec.roles) {
      const v = auto.cols[r.key];
      next[r.key] = v == null || v < 0 ? UNSET : v;
    }
    setCols(next);
  }, [sheetIndex, preview, spec]);

  const reset = () => {
    setPreview(null);
    setSheetIndex(0);
    setHeaderRow(1);
    setCols(emptyCols(spec));
    setImportStatus(null);
    setWarnings([]);
    setAutoMap(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    reset();
    setUploadStatus(null);
    setUploadingFileName(file.name);
    setUploading(true);
    try {
      const res = await previewExcelFile(file);
      if (!res.ok) {
        setUploadStatus({ ok: false, message: res.message });
        return;
      }
      setPreview(res);
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
      setUploadingFileName(null);
    }
  };

  return {
    spec, fileInputRef, uploading, uploadStatus, uploadingFileName, preview,
    sheetIndex, setSheetIndex, headerRow, setHeaderRow,
    cols, setCol, importStatus, warnings, autoMap, handleFile,
  };
}

function emptyCols<Entity>(spec: ExcelImportDomainSpec<Entity>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of spec.roles) out[r.key] = UNSET;
  return out;
}

// ── Components ──────────────────────────────────────────────────────────

export function ExcelUploadButton<Entity>({
  state, label = "Upload Excel",
}: { state: ExcelImportState<Entity>; label?: string }) {
  return (
    <>
      <Btn
        kind="ghost"
        onClick={() => state.fileInputRef.current?.click()}
        disabled={state.uploading}
      >
        {state.uploading ? "Reading workbook…" : label}
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

/** Optional per-domain review slot rendered between the mapped-row
 *  preview and the Import button. `node` is any JSX (e.g. the operating
 *  import's source-category review block); when `blockImport` is true
 *  the Import button stays disabled and shows `blockReason` instead of
 *  the usual count summary. Used by `ExcelOperatingMappingPanel`. */
export interface ExcelMappingExtraReview {
  node: ReactNode;
  blockImport: boolean;
  blockReason?: string;
}

export function ExcelMappingPanel<Entity>({
  state, applyMerge, extraReview,
}: {
  state: ExcelImportState<Entity>;
  applyMerge: (
    state: ExcelImportState<Entity>,
    setImportStatus: (s: Status) => void,
    setWarnings: (w: ExcelImportWarning[]) => void,
  ) => void;
  extraReview?: ExcelMappingExtraReview;
}) {
  // The hook owns importStatus/warnings; mapping panel just renders.
  // We expose them via a wrapper component to keep the API clean.
  return <Panel state={state} applyMerge={applyMerge} extraReview={extraReview}/>;
}

function Panel<Entity>({
  state, applyMerge, extraReview,
}: {
  state: ExcelImportState<Entity>;
  applyMerge: (
    state: ExcelImportState<Entity>,
    setImportStatus: (s: Status) => void,
    setWarnings: (w: ExcelImportWarning[]) => void,
  ) => void;
  extraReview?: ExcelMappingExtraReview;
}) {
  const {
    spec, uploading, uploadStatus, uploadingFileName, preview, autoMap,
    sheetIndex, setSheetIndex, headerRow, setHeaderRow,
    cols, setCol, importStatus, warnings,
  } = state;

  const [localStatus, setLocalStatus] = useState<Status>(importStatus);
  const [localWarnings, setLocalWarnings] = useState<ExcelImportWarning[]>(warnings);
  useEffect(() => setLocalStatus(importStatus), [importStatus]);
  useEffect(() => setLocalWarnings(warnings), [warnings]);

  // Render whenever an in-flight upload is being processed OR there is
  // any settled state to surface. Previously the panel hid itself while
  // `uploading=true` with no prior status, so the "Parsing workbook…"
  // line never appeared during a first upload — the user had no
  // feedback until the request resolved. Including `uploading` here
  // makes the StatusLine (and its new spinner + filename) visible from
  // the moment the file is picked.
  if (!uploading && !uploadStatus && !preview && !localStatus && localWarnings.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(uploading || uploadStatus) && (
        <StatusLine
          status={uploadStatus}
          loading={uploading}
          loadingText="Parsing workbook…"
          loadingFileName={uploadingFileName}
          label="EXCEL"
        />
      )}
      {preview && (
        <InnerMappingPanel
          spec={spec}
          preview={preview}
          autoMap={autoMap}
          sheetIndex={sheetIndex} setSheetIndex={setSheetIndex}
          headerRow={headerRow} setHeaderRow={setHeaderRow}
          cols={cols} setCol={setCol}
          onImport={() => applyMerge(state, setLocalStatus, setLocalWarnings)}
          extraReview={extraReview}
        />
      )}
      {localStatus && (
        <StatusLine status={localStatus} loading={false} loadingText="" label="IMPORT"/>
      )}
      {localWarnings.length > 0 && <WarningList warnings={localWarnings}/>}
    </div>
  );
}

// ── Inner mapping panel (sheet selector + column dropdowns + sample) ────

function InnerMappingPanel<Entity>({
  spec, preview, autoMap, sheetIndex, setSheetIndex,
  headerRow, setHeaderRow, cols, setCol, onImport, extraReview,
}: {
  spec: ExcelImportDomainSpec<Entity>;
  preview: ExcelPreviewOk;
  autoMap: DomainAutoMapping | null;
  sheetIndex: number;
  setSheetIndex: (n: number) => void;
  headerRow: number;
  setHeaderRow: (n: number) => void;
  cols: Record<string, number>;
  setCol: (key: string, n: number) => void;
  onImport: () => void;
  extraReview?: ExcelMappingExtraReview;
}) {
  const sheets: PreviewSheet[] = Array.isArray(preview?.sheets) ? preview.sheets : [];
  const sheet: PreviewSheet | undefined = sheets[sheetIndex];
  const sheetRows: PreviewCell[][] = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const sheetRowCount = sheet && typeof sheet.rowCount === "number"
    ? Math.max(sheet.rowCount, sheetRows.length)
    : sheetRows.length;
  const sheetColumnCount = sheet && typeof sheet.columnCount === "number"
    ? sheet.columnCount
    : sheetRows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  const headerIdx = Math.max(0, headerRow - 1);

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

  const mapping: DomainMapping = { headerRowIndex: headerIdx, cols };
  const mappingErrors = sheet ? spec.validate(sheet, mapping) : ["No sheets in workbook."];

  const result = useMemo(() => {
    if (!sheet || mappingErrors.length > 0) return null;
    return spec.convert(preview.fileName, sheet, mapping);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.fileName, sheet, headerIdx, JSON.stringify(cols), spec, mappingErrors.length]);

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

      {autoMap && <AutoMapStatus auto={autoMap} spec={spec}/>}

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
          max={Math.max(1, sheetRowCount)}
          value={headerRow}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) { setHeaderRow(1); return; }
            setHeaderRow(Math.max(1, Math.floor(n)));
          }}
          style={{ ...selectStyle, width: 80 }}
        />

        {spec.roles.map((r) => (
          <div key={r.key} style={{ display: "contents" }}>
            <Label>
              {r.label} {r.optional && <Subtle>(optional)</Subtle>}
            </Label>
            <ColumnSelect
              value={cols[r.key] ?? UNSET}
              onChange={(n) => setCol(r.key, n)}
              columnLabels={columnLabels}
              allowUnset={r.optional}
            />
          </div>
        ))}
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

      {result && (
        <MappedRowsPreview
          spec={spec}
          result={result}
          dataRowsAvailable={dataRowsAvailable}
        />
      )}

      {extraReview?.node}

      <div style={{ display: "flex", gap: 8 }}>
        <Btn
          kind="primary"
          disabled={!result || result.importedRowCount === 0 || !!extraReview?.blockImport}
          onClick={onImport}
        >
          {extraReview?.blockImport && extraReview.blockReason
            ? extraReview.blockReason
            : result
              ? (result.importedRowCount === 0
                  ? `No importable ${spec.noun.plural}`
                  : `Import ${result.importedRowCount.toLocaleString()} ${result.importedRowCount === 1 ? spec.noun.singular : spec.noun.plural}`)
              : "Pick required columns"}
        </Btn>
      </div>
    </div>
  );
}

// ── Mapped-row sample preview ───────────────────────────────────────────

function MappedRowsPreview<Entity>({
  spec, result, dataRowsAvailable,
}: {
  spec: ExcelImportDomainSpec<Entity>;
  result: NonNullable<ReturnType<ExcelImportDomainSpec<Entity>["convert"]>>;
  dataRowsAvailable: number;
}) {
  const allRows = [
    ...result.extraction.mapped,
    ...result.extraction.duplicates,
  ];
  const display = allRows.slice(0, PREVIEW_DISPLAY_ROWS);
  const cols = spec.previewHeaders;
  // Row + spec columns + Status column
  const gridTemplate = `auto ${cols.map((c) => c.align === "right" ? "auto" : "minmax(0, 1fr)").join(" ")} auto`;
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
        gridTemplateColumns: gridTemplate,
        gap: "4px 12px",
        fontSize: "var(--t-l7)",
        alignItems: "baseline",
      }}>
        <HeaderCell>Row</HeaderCell>
        {cols.map((c) => (
          <HeaderCell key={c.label} align={c.align}>{c.label}</HeaderCell>
        ))}
        <HeaderCell>Status</HeaderCell>
        {display.map(({ entity, lineage }, i) => {
          const cells = spec.previewRow(entity);
          const isUpdate = spec.isUpdate
            ? spec.isUpdate(entity, result.extraction)
            : result.extraction.duplicates.some((d) => d.entity === entity);
          return (
            <div key={`${lineage.row}-${i}`} style={{ display: "contents" }}>
              <span className="mono" style={{ color: "var(--ink-3)", fontSize: "var(--t-l8)" }}>{String(lineage.row)}</span>
              {cells.map((c, ci) => (
                <span key={ci} className={typeof c.value === "number" ? "num" : undefined} style={{
                  textAlign: c.align ?? "left",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={String(c.value)}>
                  {c.value}
                </span>
              ))}
              <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>
                {isUpdate ? "Update" : "New"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Skipped-rows warnings list ──────────────────────────────────────────

function WarningList({ warnings }: { warnings: ExcelImportWarning[] }) {
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

// ── Auto-detect status line ─────────────────────────────────────────────

function AutoMapStatus<Entity>({
  auto, spec,
}: { auto: DomainAutoMapping; spec: ExcelImportDomainSpec<Entity> }) {
  const required = spec.roles.filter((r) => !r.optional);
  const optional = spec.roles.filter((r) => r.optional);
  const foundReq = required.filter((r) => auto.detected[r.key]);
  const missing = required.filter((r) => !auto.detected[r.key]);
  const foundOpt = optional.filter((r) => auto.detected[r.key]);
  const noneDetected = foundReq.length === 0 && foundOpt.length === 0;

  let message: string;
  let tone: string;
  if (noneDetected) {
    message = "Couldn't auto-detect columns. Pick the columns below to start.";
    tone = "var(--ink-3)";
  } else if (missing.length === 0) {
    const labels = [...foundReq, ...foundOpt].map((r) => r.label.toLowerCase());
    message = `Auto-detected ${labels.join(", ")}.`;
    tone = "var(--pos)";
  } else {
    const foundList = [...foundReq, ...foundOpt].map((r) => r.label.toLowerCase()).join(", ");
    const missingList = missing.map((r) => r.label.toLowerCase()).join(", ");
    message = `Auto-detected ${foundList || "no columns"}. Pick a column for ${missingList}.`;
    tone = "var(--warn)";
  }

  return (
    <div style={{ fontSize: 12, color: tone, lineHeight: 1.5 }}>{message}</div>
  );
}

// ── Small UI atoms ──────────────────────────────────────────────────────

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

function StatusLine({
  status, loading, loadingText, loadingFileName, label,
}: {
  status: Status;
  loading: boolean;
  loadingText: string;
  /** Optional filename to surface beside loadingText while the request
   *  is in flight. Cleared by the caller when the request resolves. */
  loadingFileName?: string | null;
  label: string;
}) {
  if (!status && !loading) return null;
  return (
    <div
      aria-live="polite"
      aria-busy={loading}
      style={{
        display: "flex", alignItems: "baseline", gap: 12,
        paddingTop: 4,
        borderTop: "1px dashed var(--rule)",
      }}
    >
      <span className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</span>
      <span style={{
        marginLeft: "auto",
        display: "inline-flex", alignItems: "center", gap: 8,
        fontSize: 12,
        color: loading ? "var(--ink-3)" : status?.ok ? "var(--pos)" : "var(--warn)",
        fontWeight: loading ? 400 : 500,
      }}>
        {loading && <Spinner ariaLabel={loadingText}/>}
        {loading
          ? (
            <span>
              {loadingText}
              {loadingFileName && (
                <>
                  {" "}
                  <span style={{
                    color: "var(--ink-2)", fontFamily: "var(--ff-mono)",
                  }}>· {loadingFileName}</span>
                </>
              )}
            </span>
          )
          : status?.message}
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

const selectStyle: CSSProperties = {
  padding: "4px 6px",
  fontSize: "var(--t-l7)",
  fontFamily: "var(--ff-ui)",
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  color: "var(--ink)",
};

function colLetter(i: number): string {
  let n = i;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}
