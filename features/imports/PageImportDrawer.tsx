import { useRef, useState, type ReactNode } from "react";
import { Btn, Drawer, Icon } from "@/components/ui";
import { MappingReview } from "@/features/imports/MappingReview";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { DocumentType } from "@/lib/import/types";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  helper?: ReactNode;
  /** Accept attr for the generic browse/drop input. */
  accept?: string;
  /** Human-readable list of formats the generic importer accepts. */
  formats?: string;
  schema?: ReactNode;
  forceType?: DocumentType;

  // ── Optional AI PDF action ─────────────────────────────────────────────
  /** Label for the AI PDF button. Defaults to "Upload PDF via Claude". */
  aiPdfLabel?: string;
  /** Short helper text shown next to the AI status. */
  aiPdfHelper?: ReactNode;
  /** Accept attr for the AI PDF file input. Defaults to ".pdf". */
  aiPdfAccept?: string;
  /** When provided, the AI button is rendered. Handler returns the message
   *  to show inline; ok=false renders the message in warn color. */
  onAiPdfImport?: (file: File) => Promise<{ ok: boolean; message: string }>;

  // ── Optional paste-JSON action ─────────────────────────────────────────
  /** Label for the paste button. Defaults to "Paste from clipboard". */
  pasteLabel?: string;
  /** Short helper text shown next to the paste status. */
  pasteHelper?: ReactNode;
  /** Example shape rendered inline in the helper (e.g. "{ items: [...] }"). */
  pasteExample?: string;
  /** When provided, the paste button is rendered + wired to
   *  navigator.clipboard.readText() → handler. */
  onPasteJson?: (text: string) => Promise<{ ok: boolean; message: string }>;
}

type Stage = "idle" | "parsing" | "mapping" | "done";
type Status = { ok: boolean; message: string } | null;

export function PageImportDrawer({
  open, onClose,
  title, helper,
  accept = ".xlsx,.csv,.pdf",
  formats = "xlsx, csv, pdf",
  schema,
  forceType,
  aiPdfLabel = "Upload PDF via Claude",
  aiPdfHelper,
  aiPdfAccept = ".pdf",
  onAiPdfImport,
  pasteLabel = "Paste from clipboard",
  pasteHelper,
  pasteExample,
  onPasteJson,
}: Props) {
  const { services, currentBatch, setCurrentBatch, applyCurrentBatch } = useBuildState();
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [latest, setLatest] = useState<{ file: string; rows: number; date: string } | null>(null);

  // Per-action state: loading flags + last status message. Independent so
  // a stale AI message doesn't get clobbered by a clipboard paste click.
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<Status>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<Status>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const aiPdfInputRef = useRef<HTMLInputElement>(null);

  const run = async (file: File) => {
    setStage("parsing");
    try {
      const batch = await runImportPipeline(file, { services, forceType });
      setCurrentBatch(batch);
      setStage("mapping");
      await new Promise((r) => setTimeout(r, 200));
      setStage("done");
      setLatest({
        file: file.name,
        rows: batch.mappings.length,
        date: new Date().toLocaleString(undefined, {
          month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit",
        }),
      });
    } catch (err) {
      setStage("idle");
      console.error("import failed:", err);
    }
  };

  const runAiPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAiPdfImport) return;
    e.target.value = ""; // allow re-selecting the same file
    setAiStatus(null);
    setAiLoading(true);
    try {
      const result = await onAiPdfImport(file);
      setAiStatus(result);
    } catch (err) {
      setAiStatus({ ok: false, message: err instanceof Error ? err.message : "PDF import failed." });
    } finally {
      setAiLoading(false);
    }
  };

  const runPaste = async () => {
    if (!onPasteJson) return;
    setPasteStatus(null);
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setPasteStatus({ ok: false, message: "Clipboard access denied — try Ctrl+C then click again." });
      return;
    }
    setPasteLoading(true);
    try {
      const result = await onPasteJson(text);
      setPasteStatus(result);
    } catch (err) {
      setPasteStatus({ ok: false, message: err instanceof Error ? err.message : "Paste import failed." });
    } finally {
      setPasteLoading(false);
    }
  };

  const handleClose = () => {
    setStage("idle");
    setOver(false);
    setAiStatus(null);
    setPasteStatus(null);
    onClose();
  };

  const handleCancel = () => {
    setCurrentBatch(null);
    setLatest(null);
    handleClose();
  };

  const handleContinue = () => {
    if (currentBatch) applyCurrentBatch();
    setLatest(null);
    handleClose();
  };

  const accepted = currentBatch?.mappings.filter((m) => m.status === "auto_accepted").length ?? 0;
  const review = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;
  const ready = !!currentBatch && stage === "done";

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={helper}
      width={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void run(f);
          }}
          style={{
            background: stage === "idle" ? "var(--paper)" : "var(--paper-2)",
            border: `1px ${stage === "idle" ? "dashed" : "solid"} ${over ? "var(--accent)" : "var(--rule-strong)"}`,
            padding: "18px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 34, height: 34, flexShrink: 0,
              border: "1px solid var(--rule-strong)",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--paper)",
            }}>
              <Icon name="download" size={16} style={{ transform: "rotate(180deg)" }}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="display" style={{ fontSize: 14, fontWeight: 600 }}>
                {stage === "idle"    && "Drop file to import"}
                {stage === "parsing" && "Parsing source…"}
                {stage === "mapping" && "Auto-mapping rows…"}
                {stage === "done"    && "Import complete"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                {stage === "idle"
                  ? `Drag and drop, paste, or click to browse. Accepts ${formats}.`
                  : latest ? `${latest.file} · ${latest.rows} rows` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <Btn kind="primary" onClick={() => fileRef.current?.click()}>
              <Icon name="plus" size={13}/> Browse files
            </Btn>
            {onAiPdfImport && (
              <Btn
                kind="ghost"
                onClick={() => aiPdfInputRef.current?.click()}
                disabled={aiLoading}
              >
                <Icon name="sparkles" size={13}/> {aiLoading ? "Sending to Claude…" : aiPdfLabel}
              </Btn>
            )}
            {onPasteJson && (
              <Btn kind="ghost" onClick={runPaste} disabled={pasteLoading}>
                {pasteLoading ? "Reading clipboard…" : pasteLabel}
              </Btn>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); }}
            />
            {onAiPdfImport && (
              <input
                ref={aiPdfInputRef}
                type="file"
                accept={aiPdfAccept}
                style={{ display: "none" }}
                onChange={runAiPdf}
              />
            )}
          </div>
          {(stage === "parsing" || stage === "mapping") && (
            <div style={{ marginTop: 14, height: 4, background: "var(--paper-3)" }}>
              <div style={{
                height: "100%",
                width: stage === "parsing" ? "35%" : "75%",
                background: "var(--accent)",
                transition: "width 600ms",
              }}/>
            </div>
          )}
        </div>

        {onAiPdfImport && (
          <ActionStatus
            label={aiPdfLabel}
            helper={aiPdfHelper}
            loadingText="Claude is reading the PDF — check the terminal for progress"
            loading={aiLoading}
            status={aiStatus}
          />
        )}

        {onPasteJson && (
          <ActionStatus
            label={pasteLabel}
            helper={
              pasteHelper ?? (pasteExample
                ? (<>Paste the <code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{pasteExample}</code> output from an LLM</>)
                : undefined)
            }
            loadingText="Parsing clipboard JSON…"
            loading={pasteLoading}
            status={pasteStatus}
          />
        )}

        {!currentBatch && (
          <div style={{
            border: "1px solid var(--rule)", background: "var(--paper)",
            padding: "14px 16px",
            display: "grid", gridTemplateColumns: "120px 1fr", gap: "10px 14px",
            fontSize: 12, lineHeight: 1.5,
          }}>
            <div className="mono" style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              color: "var(--ink-3)", textTransform: "uppercase", paddingTop: 2,
            }}>Accepts</div>
            <div style={{ color: "var(--ink-2)" }}>{formats}</div>
            {schema && (
              <>
                <div className="mono" style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
                  color: "var(--ink-3)", textTransform: "uppercase", paddingTop: 2,
                }}>Schema</div>
                <div style={{ color: "var(--ink-2)" }}>{schema}</div>
              </>
            )}
            {latest && (
              <>
                <div className="mono" style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
                  color: "var(--ink-3)", textTransform: "uppercase", paddingTop: 2,
                }}>Last import</div>
                <div className="mono" style={{ color: "var(--ink)" }}>
                  {latest.file} · {latest.date}
                </div>
              </>
            )}
          </div>
        )}

        {ready && (
          <div style={{
            border: "1px solid var(--rule)", background: "var(--paper)",
            padding: "12px 16px",
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14,
            fontSize: 12,
          }}>
            <Stat label="Rows" value={currentBatch.mappings.length} color="var(--ink)"/>
            <Stat label="Auto-mapped" value={accepted} color="var(--pos)"/>
            <Stat label="Need review" value={review} color={review > 0 ? "var(--warn)" : "var(--ink-2)"}/>
          </div>
        )}

        {ready && <MappingReview/>}
      </div>

      <div style={{
        position: "sticky", bottom: 0,
        marginTop: 18,
        padding: "12px 0",
        borderTop: "1px solid var(--rule)",
        background: "var(--paper)",
        display: "flex", justifyContent: "flex-end", gap: 8,
      }}>
        <Btn kind="ghost" onClick={handleCancel}>Cancel</Btn>
        <Btn kind="primary" onClick={handleContinue} disabled={!currentBatch}>
          {currentBatch ? "Apply import" : "Continue"}
        </Btn>
      </div>
    </Drawer>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="num" style={{
        fontSize: 17, fontWeight: 600, marginTop: 3, color,
      }}>{value}</div>
    </div>
  );
}

/** Compact one-row status panel for an in-drawer action (AI PDF, paste).
 *  Shows helper text on the left, the latest status (or a loading line)
 *  on the right. Color follows the same accent / warn / pos convention as
 *  the page-level wiring used to do externally. */
function ActionStatus({
  label, helper, loading, loadingText, status,
}: {
  label: string;
  helper?: ReactNode;
  loading: boolean;
  loadingText: string;
  status: Status;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 10,
      padding: "10px 14px",
      background: "var(--paper)", border: "1px solid var(--rule)",
      fontSize: 11.5, lineHeight: 1.5,
    }}>
      <span className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</span>
      {helper && (
        <span style={{ color: "var(--ink-3)" }}>{helper}</span>
      )}
      {(loading || status) && (
        <span style={{
          marginLeft: "auto",
          fontSize: 12,
          color: loading
            ? "var(--ink-3)"
            : status?.ok ? "var(--pos)" : "var(--warn)",
          fontWeight: loading ? 400 : 500,
        }}>
          {loading ? loadingText : status?.message}
        </span>
      )}
    </div>
  );
}
