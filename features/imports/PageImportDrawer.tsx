import { useRef, useState, type ReactNode } from "react";
import { Btn, Drawer, Icon } from "@/components/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  helper?: ReactNode;

  // ── AI PDF action ──────────────────────────────────────────────────────
  /** Label for the AI PDF button. Defaults to "Upload PDF via Claude". */
  aiPdfLabel?: string;
  /** Short helper text shown next to the AI status. */
  aiPdfHelper?: ReactNode;
  /** Accept attr for the AI PDF file input. Defaults to ".pdf". */
  aiPdfAccept?: string;
  /** When provided, the AI button is rendered. Handler returns the message
   *  to show inline; ok=false renders the message in warn color. */
  onAiPdfImport?: (file: File) => Promise<{ ok: boolean; message: string }>;

  // ── Paste-JSON action ──────────────────────────────────────────────────
  /** Label for the paste button. Defaults to "Paste JSON from clipboard". */
  pasteLabel?: string;
  /** Short helper text shown next to the paste status. */
  pasteHelper?: ReactNode;
  /** Example shape rendered inline in the helper (e.g. "{ items: [...] }"). */
  pasteExample?: string;
  /** When provided, the paste button is rendered + wired to
   *  navigator.clipboard.readText() → handler. */
  onPasteJson?: (text: string) => Promise<{ ok: boolean; message: string }>;
}

type Status = { ok: boolean; message: string } | null;

export function PageImportDrawer({
  open, onClose,
  title, helper,
  aiPdfLabel = "Upload PDF via Claude",
  aiPdfHelper,
  aiPdfAccept = ".pdf",
  onAiPdfImport,
  pasteLabel = "Paste JSON from clipboard",
  pasteHelper,
  pasteExample,
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
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {onAiPdfImport && (
          <ActionPanel
            label={aiPdfLabel}
            icon="sparkles"
            buttonText={aiLoading ? "Sending to Claude…" : aiPdfLabel}
            buttonDisabled={aiLoading}
            onClick={() => aiPdfInputRef.current?.click()}
            helper={aiPdfHelper}
            loadingText="Claude is reading the PDF — check the terminal for progress"
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

        {onPasteJson && (
          <ActionPanel
            label={pasteLabel}
            buttonText={pasteLoading ? "Reading clipboard…" : pasteLabel}
            buttonDisabled={pasteLoading}
            onClick={runPaste}
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

/** Per-action panel: the action button on the left, helper text + the
 *  current loading/result status on the right. Self-contained so each
 *  enabled handler gets its own visual block in the drawer body. */
function ActionPanel({
  label,
  icon,
  buttonText,
  buttonDisabled,
  onClick,
  helper,
  loadingText,
  loading,
  status,
  children,
}: {
  label: string;
  icon?: "sparkles";
  buttonText: ReactNode;
  buttonDisabled?: boolean;
  onClick: () => void;
  helper?: ReactNode;
  loadingText: string;
  loading: boolean;
  status: Status;
  children?: ReactNode;
}) {
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap",
      }}>
        <Btn kind="ghost" onClick={onClick} disabled={buttonDisabled}>
          {icon === "sparkles" && <Icon name="sparkles" size={13}/>} {buttonText}
        </Btn>
        {helper && (
          <span style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
            {helper}
          </span>
        )}
      </div>
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
