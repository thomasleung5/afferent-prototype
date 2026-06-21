import { useRef, useState, type ReactNode } from "react";
import { Btn, ExpandIndicator, Icon, Spinner } from "@/components/ui";
import { displayFileName } from "@/lib/format";

interface Props {
  // ── PDF upload action ──────────────────────────────────────────────────
  /** Label for the PDF upload button. Defaults to "Upload PDF". */
  aiPdfLabel?: string;
  /** Accept attr for the PDF file input. Defaults to ".pdf". */
  aiPdfAccept?: string;
  /** When provided, the upload button is rendered. Handler returns the
   *  message to show inline; ok=false renders the message in warn color. */
  onAiPdfImport?: (file: File) => Promise<{ ok: boolean; message: string }>;

  // ── Paste-JSON action ──────────────────────────────────────────────────
  /** Label for the paste button. Defaults to "Paste JSON". */
  pasteLabel?: string;
  /** Short helper text shown next to the paste status. */
  pasteHelper?: ReactNode;
  /** Inline example shape (e.g. "{ items: [...] }") rendered next to the
   *  paste button when no explicit pasteHelper is provided. */
  pasteExample?: string;
  /** Multi-line schema preview rendered as a code block under the paste
   *  button. */
  pasteSchema?: ReactNode;
  /** When provided, the paste button is rendered + wired to
   *  navigator.clipboard.readText() → handler. */
  onPasteJson?: (text: string) => Promise<{ ok: boolean; message: string }>;
  /** When true, the paste action is collapsed behind an "Advanced"
   *  disclosure and the inline OR divider is suppressed — PDF upload
   *  stays the primary affordance. */
  pasteAdvanced?: boolean;

  /** Optional extra node rendered inside the PDF action's button row,
   *  to the right of the Upload PDF button. Used today to slot the
   *  Excel-import button so it sits beside Upload PDF for fee imports.
   *  Has no effect when `onAiPdfImport` isn't wired. */
  aiPdfAccessory?: ReactNode;

  /** Optional content rendered between the PDF action panel and the
   *  Advanced disclosure. Used today to surface the Excel mapping
   *  panel right under Upload PDF / Upload Excel — so it sits above
   *  the paste-JSON fallback rather than below it. */
  aiPdfBelow?: ReactNode;
}

type Status = { ok: boolean; message: string } | null;

/** Inline two-action import shell: PDF upload + paste JSON, each with
 *  independent loading and status reporting. Sized to embed inside a
 *  Source Data card — the surrounding card owns the header and section
 *  metadata. */
export function InlineImportCard({
  aiPdfLabel = "Upload PDF",
  aiPdfAccept = ".pdf",
  onAiPdfImport,
  pasteLabel = "Paste JSON",
  pasteHelper,
  pasteExample,
  pasteSchema,
  onPasteJson,
  pasteAdvanced = false,
  aiPdfAccessory,
  aiPdfBelow,
}: Props) {
  // Per-action state: loading flags + last status message. Independent so
  // a stale AI message doesn't get clobbered by a clipboard paste click.
  // aiFileName surfaces the picked filename next to the loading text so
  // the user can confirm the right file is being processed. Cleared in
  // the finally block — never persisted past the request lifecycle.
  const [aiLoading, setAiLoading] = useState(false);
  // Single-pipeline loading label — "Uploading" while the file leaves the
  // browser, then "Extracting from PDF" for the (much longer) server-side
  // parse. Only one of these is ever shown at a time, alongside the one
  // status row below the button — never two stacked loading indicators.
  const [aiStage, setAiStage] = useState<"uploading" | "extracting">("uploading");
  const [aiStatus, setAiStatus] = useState<Status>(null);
  const [aiFileName, setAiFileName] = useState<string | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<Status>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const aiPdfInputRef = useRef<HTMLInputElement>(null);

  const runAiPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAiPdfImport) return;
    e.target.value = ""; // allow re-selecting the same file
    setAiStatus(null);
    setAiFileName(file.name);
    setAiStage("uploading");
    setAiLoading(true);
    const toExtracting = setTimeout(() => setAiStage("extracting"), 500);
    try {
      const result = await onAiPdfImport(file);
      setAiStatus(result);
    } catch (err) {
      setAiStatus({ ok: false, message: err instanceof Error ? err.message : "PDF import failed." });
    } finally {
      clearTimeout(toExtracting);
      setAiLoading(false);
      setAiFileName(null);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {onAiPdfImport && (
        <ActionPanel
          tone="primary"
          label={aiPdfLabel}
          icon="sparkles"
          buttonText={aiPdfLabel}
          buttonDisabled={aiLoading}
          onClick={() => aiPdfInputRef.current?.click()}
          loadingText={aiStage === "uploading" ? "Uploading" : "Extracting from PDF — this can take 30–60s"}
          loading={aiLoading}
          loadingFileName={aiFileName}
          status={aiStatus}
          accessory={aiPdfAccessory}
        >
          <input
            ref={aiPdfInputRef}
            type="file"
            accept={aiPdfAccept}
            style={{ display: "none" }}
            onChange={runAiPdf}
          />
        </ActionPanel>
      )}

      {aiPdfBelow}

      {onAiPdfImport && onPasteJson && !pasteAdvanced && <OrDivider/>}

      {onPasteJson && !pasteAdvanced && (
        <ActionPanel
          tone="secondary"
          label={pasteLabel}
          buttonText={pasteLoading ? "Reading clipboard…" : pasteLabel}
          buttonDisabled={pasteLoading}
          onClick={runPaste}
          helper={
            pasteHelper ?? (pasteExample
              ? (<>Paste structured output shaped like <code style={{ fontFamily: "var(--ff-mono)", fontSize: "var(--t-l8)" }}>{pasteExample}</code>.</>)
              : undefined)
          }
          schema={pasteSchema}
          loadingText="Parsing clipboard JSON…"
          loading={pasteLoading}
          status={pasteStatus}
        />
      )}

      {onPasteJson && pasteAdvanced && (
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "transparent", border: "none",
              padding: "2px 0",
              cursor: "pointer",
              fontFamily: "var(--ff-mono)",
              fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.12em",
              color: "var(--ink-3)", textTransform: "uppercase",
            }}
          >
            Advanced <ExpandIndicator open={advancedOpen}/>
          </button>
          {advancedOpen && (
            <div style={{ marginTop: 10 }}>
              <ActionPanel
                tone="secondary"
                label={pasteLabel}
                buttonText={pasteLoading ? "Reading clipboard…" : pasteLabel}
                buttonDisabled={pasteLoading}
                onClick={runPaste}
                helper={
                  pasteHelper ?? (pasteExample
                    ? (<>Paste structured output shaped like <code style={{ fontFamily: "var(--ff-mono)", fontSize: "var(--t-l8)" }}>{pasteExample}</code>.</>)
                    : undefined)
                }
                schema={pasteSchema}
                loadingText="Parsing clipboard JSON…"
                loading={pasteLoading}
                status={pasteStatus}
              />
            </div>
          )}
        </div>
      )}

      {!onAiPdfImport && !onPasteJson && (
        <div style={{
          border: "1px dashed var(--rule-strong)",
          padding: "18px 20px",
          fontSize: 12, color: "var(--ink-3)",
        }}>
          No import methods configured for this card.
        </div>
      )}
    </div>
  );
}

function OrDivider() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      color: "var(--ink-3)",
    }}>
      <span style={{ flex: 1, height: 1, background: "var(--rule)" }}/>
      <span className="mono" style={{
        fontSize: "var(--t-l9)", fontWeight: 600, letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}>or</span>
      <span style={{ flex: 1, height: 1, background: "var(--rule)" }}/>
    </div>
  );
}

/** Per-action panel: the action button on the left, helper text + the
 *  current loading/result status on the right. Self-contained so each
 *  enabled handler gets its own visual block. */
function ActionPanel({
  tone = "secondary",
  label,
  icon,
  buttonText,
  buttonDisabled,
  onClick,
  helper,
  schema,
  loadingText,
  loading,
  loadingFileName,
  status,
  accessory,
  children,
}: {
  tone?: "primary" | "secondary";
  label: string;
  icon?: "sparkles";
  buttonText: ReactNode;
  buttonDisabled?: boolean;
  onClick: () => void;
  helper?: ReactNode;
  schema?: ReactNode;
  loadingText: string;
  loading: boolean;
  /** Filename of the file currently being processed. Surfaced next to
   *  loadingText so the user can confirm the right document is in
   *  flight. Cleared by the parent when the request resolves. */
  loadingFileName?: string | null;
  status: Status;
  /** Extra node rendered to the right of the primary button in the
   *  button row — e.g. a secondary Upload Excel button slotted in by
   *  the Fees source card. */
  accessory?: ReactNode;
  children?: ReactNode;
}) {
  const isPrimary = tone === "primary";
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap",
      }}>
        <Btn kind={isPrimary ? "primary" : "ghost"} onClick={onClick} disabled={buttonDisabled}>
          {icon === "sparkles" && <Icon name="sparkles" size={13}/>} {buttonText}
        </Btn>
        {accessory}
        {helper && (
          <span style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
            {helper}
          </span>
        )}
      </div>
      {schema && (
        <pre style={{
          margin: 0,
          padding: "8px 10px",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--ff-mono)",
          fontSize: "var(--t-l8)", lineHeight: 1.55,
          color: "var(--ink-2)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>{schema}</pre>
      )}
      {(loading || status) && (
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
            color: loading
              ? "var(--ink-3)"
              : status?.ok ? "var(--pos)" : "var(--warn)",
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
                        display: "inline-block", maxWidth: 260, verticalAlign: "bottom",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }} title={loadingFileName}>· {displayFileName(loadingFileName)}</span>
                    </>
                  )}
                </span>
              )
              : status?.message}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
