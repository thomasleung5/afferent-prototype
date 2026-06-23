import { useRef, useState, type ReactNode } from "react";
import { Btn, Icon, Spinner } from "@/components/ui";
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

  /** Optional extra node rendered inside the PDF action's button row,
   *  to the right of the Upload PDF button. Used today to slot the
   *  Excel-import button so it sits beside Upload PDF for fee imports.
   *  Has no effect when `onAiPdfImport` isn't wired. */
  aiPdfAccessory?: ReactNode;

  /** Optional content rendered below the PDF action panel. Used today
   *  to surface the Excel mapping panel right under Upload PDF /
   *  Upload Excel. */
  aiPdfBelow?: ReactNode;

  /** Minimal PDF-upload status presentation — see ActionPanel's
   *  `compact` doc. Used by the CAP source card to keep the import
   *  affordance focused: spinner + filename while in flight, nothing
   *  once it succeeds (the result shows up in Recent Imports), and the
   *  failure message still surfaces since that path has no other
   *  feedback. */
  compactAiStatus?: boolean;
  /** Button-row alignment. Right-edge Quick Import rows use end alignment
   *  so compact status text can grow left without moving the button. */
  actionAlign?: "start" | "end";
}

type Status = { ok: boolean; message: string } | null;

/** Inline PDF-upload import shell. Sized to embed inside a Source Data
 *  card — the surrounding card owns the header and section
 *  metadata. */
export function InlineImportCard({
  aiPdfLabel = "Upload PDF",
  aiPdfAccept = ".pdf",
  onAiPdfImport,
  aiPdfAccessory,
  aiPdfBelow,
  compactAiStatus,
  actionAlign = "start",
}: Props) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {onAiPdfImport && (
        <ActionPanel
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
          compact={compactAiStatus}
          actionAlign={actionAlign}
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

      {!onAiPdfImport && (
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

/** Action panel: the action button on the left, the current
 *  loading/result status on the right. */
function ActionPanel({
  label,
  icon,
  buttonText,
  buttonDisabled,
  onClick,
  loadingText,
  loading,
  loadingFileName,
  status,
  accessory,
  compact,
  actionAlign,
  children,
}: {
  label: string;
  icon?: "sparkles";
  buttonText: ReactNode;
  buttonDisabled?: boolean;
  onClick: () => void;
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
  /** Minimal status presentation: drop the uppercase label and the
   *  loading-stage text (spinner + filename only while in flight), and
   *  hide the row entirely on success — the import shows up in Recent
   *  Imports instead. Failure messages still render, since a failed
   *  import never reaches Recent Imports and would otherwise vanish
   *  with no feedback. */
  compact?: boolean;
  actionAlign: "start" | "end";
  children?: ReactNode;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap",
        justifyContent: actionAlign === "end" ? "flex-end" : "flex-start",
      }}>
        <Btn kind="primary" onClick={onClick} disabled={buttonDisabled}>
          {icon === "sparkles" && <Icon name="sparkles" size={13}/>} {buttonText}
        </Btn>
        {accessory}
      </div>
      {compact ? (
        (loading || (status && !status.ok)) && (
          <div
            aria-live="polite"
            aria-busy={loading}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              paddingTop: 4,
              borderTop: "1px dashed var(--rule)",
              fontSize: 12,
              color: loading ? "var(--ink-3)" : "var(--warn)",
              fontWeight: loading ? 400 : 500,
            }}
          >
            {loading && <Spinner ariaLabel="Importing"/>}
            {loading
              ? (loadingFileName && (
                <span style={{
                  color: "var(--ink-2)", fontFamily: "var(--ff-mono)",
                  display: "inline-block", maxWidth: 260,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={loadingFileName}>{displayFileName(loadingFileName)}</span>
              ))
              : status?.message}
          </div>
        )
      ) : (loading || status) && (
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
