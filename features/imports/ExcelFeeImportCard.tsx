/* Excel Fee Schedule mapping card.
 *
 * Self-contained import flow for fee schedules delivered as `.xlsx`.
 * Uploads to the deterministic /api/import/excel/preview endpoint,
 * lets the analyst pick sheet + header row + the four required columns
 * (name / dept / fee, plus optional unit), surfaces a live preview of
 * what would import, then routes the mapped rows through the same
 * `mergeFeeSchedule` store action the PDF/JSON paths already use. No
 * silent merge — the user has to click Import after reviewing.
 *
 * Lives in features/imports/ so this card can be reused on other
 * surfaces later (e.g. Source Data or the Fee Schedule page itself).
 * Today it's rendered alongside the existing InlineImportCard on the
 * Fees source card. */

import { useMemo, useRef, useState } from "react";
import { Btn } from "@/components/ui";
import {
  excelToFeeExtraction, validateFeeMapping,
  type ExcelFeeWarning, type FeeColumnMapping,
} from "@/lib/import/excelToFees";
import {
  previewExcelFile,
  type ExcelPreviewOk, type PreviewSheet,
} from "@/lib/import/excelPreview";
import { useBuildState } from "@/lib/store";

type Status = { ok: boolean; message: string } | null;

const PREVIEW_DISPLAY_ROWS = 8;

/** Fallback "pick a column" placeholder used in the select dropdowns. */
const UNSET = -1;

export function ExcelFeeImportCard() {
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
      // Auto-pick the first sheet, header row 1.
      setSheetIndex(0);
      setHeaderRow(1);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap",
      }}>
        <Btn kind="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Reading workbook…" : "Upload Excel"}
        </Btn>
        <span style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
          .xlsx file. You'll pick columns before anything imports.
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </div>

      {uploadStatus && (
        <StatusLine status={uploadStatus} loading={uploading} loadingText="Parsing workbook…" label="EXCEL"/>
      )}

      {preview && (
        <MappingPanel
          preview={preview}
          sheetIndex={sheetIndex} setSheetIndex={setSheetIndex}
          headerRow={headerRow} setHeaderRow={setHeaderRow}
          nameCol={nameCol} setNameCol={setNameCol}
          deptCol={deptCol} setDeptCol={setDeptCol}
          feeCol={feeCol} setFeeCol={setFeeCol}
          unitCol={unitCol} setUnitCol={setUnitCol}
          existingServices={services}
          onImport={(extraction, importedCount, dupCount, warns) => {
            const applied = mergeFeeSchedule(extraction, preview.fileName);
            setWarnings(warns);
            const total = applied.mapped + applied.duplicates;
            setImportStatus({
              ok: true,
              message: `Imported ${total} fee${total === 1 ? "" : "s"} (${applied.mapped} new, ${applied.duplicates} updated)${warns.length ? `; ${warns.length} row${warns.length === 1 ? "" : "s"} skipped` : ""}.`,
            });
            // Suppress unused warnings (importedCount/dupCount are
            // surfaced via mergeFeeSchedule's own result so we don't
            // double-count).
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
    preview, sheetIndex, setSheetIndex, headerRow, setHeaderRow,
    nameCol, setNameCol, deptCol, setDeptCol, feeCol, setFeeCol,
    unitCol, setUnitCol, existingServices, onImport,
  } = props;

  const sheet: PreviewSheet | undefined = preview.sheets[sheetIndex];
  // Column header labels come from the chosen header row when valid;
  // otherwise fall back to A/B/C… letters so the dropdowns are still
  // usable on sheets without a real header row.
  const columnLabels = useMemo<string[]>(() => {
    if (!sheet) return [];
    const headerIdx = headerRow - 1;
    const headerRowValues = sheet.rows[headerIdx];
    if (!headerRowValues) {
      return Array.from({ length: sheet.columnCount }, (_, i) => colLetter(i));
    }
    return Array.from({ length: sheet.columnCount }, (_, i) => {
      const v = headerRowValues[i];
      if (v == null || v === "") return colLetter(i);
      return `${colLetter(i)} · ${String(v)}`;
    });
  }, [sheet, headerRow]);

  const mapping: FeeColumnMapping = {
    headerRowIndex: headerRow - 1,
    nameCol, deptCol, feeCol,
    unitCol: unitCol === UNSET ? null : unitCol,
  };

  const mappingErrors = sheet ? validateFeeMapping(sheet, mapping) : [];

  const result = useMemo(() => {
    if (!sheet || mappingErrors.length > 0) return null;
    return excelToFeeExtraction(preview.fileName, sheet, mapping, existingServices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.fileName, sheet, headerRow, nameCol, deptCol, feeCol, unitCol, existingServices, mappingErrors.length]);

  if (!sheet) return null;

  const dataRowsAvailable = sheet.rowCount - headerRow;

  return (
    <div style={{
      border: "1px solid var(--rule)",
      background: "var(--paper)",
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <Eyebrow>Map columns</Eyebrow>

      <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 12px", alignItems: "baseline" }}>
        <Label>Sheet</Label>
        <select
          value={sheetIndex}
          onChange={(e) => setSheetIndex(Number(e.target.value))}
          style={selectStyle}
        >
          {preview.sheets.map((s, i) => (
            <option key={s.name} value={i}>
              {s.name} — {s.rowCount.toLocaleString()} row{s.rowCount === 1 ? "" : "s"}
            </option>
          ))}
        </select>

        <Label>Header row</Label>
        <input
          type="number"
          min={1}
          max={Math.max(1, sheet.rowCount)}
          value={headerRow}
          onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
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
