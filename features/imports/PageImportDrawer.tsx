import { useRef, useState, type ReactNode } from "react";
import { Btn, Drawer, Icon } from "@/components/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  helper?: ReactNode;

  // ── PDF upload action ──────────────────────────────────────────────────
  /** Label for the PDF upload button. Defaults to "Upload PDF". */
  aiPdfLabel?: string;
  /** Short helper text shown next to the upload status. */
  aiPdfHelper?: ReactNode;
  /** Accept attr for the PDF file input. Defaults to ".pdf". */
  aiPdfAccept?: string;
  /** Visual emphasis for the PDF action — primary by default; secondary
   *  swaps to the lighter ghost styling used by the paste panel. */
  aiPdfPrimary?: boolean;
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
   *  button. Use for richer field-level shape examples; complements
   *  pasteExample, which stays inline. */
  pasteSchema?: ReactNode;
  /** When provided, the paste button is rendered + wired to
   *  navigator.clipboard.readText() → handler. */
  onPasteJson?: (text: string) => Promise<{ ok: boolean; message: string }>;
}

type Status = { ok: boolean; message: string } | null;

export function PageImportDrawer({
  open, onClose,
  title, helper,
  aiPdfLabel = "Upload PDF",
  aiPdfHelper,
  aiPdfAccept = ".pdf",
  aiPdfPrimary = true,
  onAiPdfImport,
  pasteLabel = "Paste JSON",
  pasteHelper,
  pasteExample,
  pasteSchema,
  onPasteJson,
}: Props) {
  // Per-action state: loading flags + last status message. Independent so
  // a stale AI message doesn't get clobbered by a clipboard paste click.
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<Status>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<Status>(null);

  const aiPdfInputRef = useRef<HTMLInputElement>(null);

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
    setAiStatus(null);
    setPasteStatus(null);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={helper}
      width={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {onAiPdfImport && (
          <ActionPanel
            tone={aiPdfPrimary ? "primary" : "secondary"}
            label={aiPdfLabel}
            icon="sparkles"
            buttonText={aiLoading ? "Uploading…" : aiPdfLabel}
            buttonDisabled={aiLoading}
            onClick={() => aiPdfInputRef.current?.click()}
            helper={aiPdfHelper}
            loadingText="Extracting from PDF — this can take 30–60s"
            loading={aiLoading}
            status={aiStatus}
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

        {onAiPdfImport && onPasteJson && <OrDivider/>}

        {onPasteJson && (
          <ActionPanel
            tone="secondary"
            label={pasteLabel}
            buttonText={pasteLoading ? "Reading clipboard…" : pasteLabel}
            buttonDisabled={pasteLoading}
            onClick={runPaste}
            helper={
              pasteHelper ?? (pasteExample
                ? (<>Paste structured output shaped like <code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{pasteExample}</code>.</>)
                : undefined)
            }
            schema={pasteSchema}
            loadingText="Parsing clipboard JSON…"
            loading={pasteLoading}
            status={pasteStatus}
          />
        )}

        {!onAiPdfImport && !onPasteJson && (
          <div style={{
            border: "1px dashed var(--rule-strong)",
            padding: "18px 20px",
            fontSize: 12, color: "var(--ink-3)",
          }}>
            No import methods configured for this drawer.
          </div>
        )}
      </div>

      <div style={{
        position: "sticky", bottom: 0,
        marginTop: 18,
        padding: "12px 0",
        borderTop: "1px solid var(--rule)",
        background: "var(--paper)",
        display: "flex", justifyContent: "flex-end", gap: 8,
      }}>
        <Btn kind="ghost" onClick={handleClose}>Close</Btn>
      </div>
    </Drawer>
  );
}

function OrDivider() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      color: "var(--ink-3)",
    }}>
      <span style={{ flex: 1, height: 1, background: "var(--rule)" }}/>
      <span className="mono" style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}>or</span>
      <span style={{ flex: 1, height: 1, background: "var(--rule)" }}/>
    </div>
  );
}

/** Per-action panel: the action button on the left, helper text + the
 *  current loading/result status on the right. Self-contained so each
 *  enabled handler gets its own visual block in the drawer body. */
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
  status,
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
  status: Status;
  children?: ReactNode;
}) {
  const isPrimary = tone === "primary";
  return (
    <div style={{
      background: isPrimary ? "var(--paper)" : "var(--paper-2)",
      border: `1px solid ${isPrimary ? "var(--rule-strong)" : "var(--rule)"}`,
      padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap",
      }}>
        <Btn kind={isPrimary ? "primary" : "ghost"} onClick={onClick} disabled={buttonDisabled}>
          {icon === "sparkles" && <Icon name="sparkles" size={13}/>} {buttonText}
        </Btn>
        {helper && (
          <span style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
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
          fontSize: 11, lineHeight: 1.55,
          color: "var(--ink-2)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>{schema}</pre>
      )}
      {(loading || status) && (
        <div style={{
          display: "flex", alignItems: "baseline", gap: 10,
          paddingTop: 4,
          borderTop: "1px dashed var(--rule)",
        }}>
          <span className="mono" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>{label}</span>
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
        </div>
      )}
      {children}
    </div>
  );
}
