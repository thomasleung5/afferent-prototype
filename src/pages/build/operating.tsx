
import { useRef, useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { OperatingSummary } from "@/features/build/OperatingSummary";
import { OperatingBuckets } from "@/features/build/OperatingBuckets";
import { OperatingTable } from "@/features/build/OperatingTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseOperatingPdf, operatingToExtractionResult } from "@/lib/ai/parseOperating";

export default function OperatingPage() {
  const { mergeOperating } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  async function uploadPdfToClaude(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPdfStatus(null);
    setPdfLoading(true);
    try {
      const result = await aiParseOperatingPdf(file);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const extraction = operatingToExtractionResult(result.items, file.name);
      const applied = mergeOperating(extraction, file.name);
      const total = applied.mapped + applied.lowConfidence;
      setPdfStatus({ ok: true, message: `${total} line${total === 1 ? "" : "s"} imported from PDF (${applied.mapped} accepted, ${applied.lowConfidence} for review).` });
    } catch (err) {
      setPdfStatus({ ok: false, message: err instanceof Error ? err.message : "PDF parsing failed." });
    } finally {
      setPdfLoading(false);
    }
  }

  async function pasteFromClipboard() {
    setPasteStatus(null);
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setPasteStatus({ ok: false, message: "Clipboard access denied — try Ctrl+C then paste again." });
      return;
    }
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in clipboard.");
      const parsed = JSON.parse(jsonMatch[0]) as { items?: unknown[] };
      if (!Array.isArray(parsed.items) || parsed.items.length === 0)
        throw new Error('Expected { "items": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = operatingToExtractionResult(parsed.items as any, "clipboard");
      const applied = mergeOperating(extraction, "clipboard");
      const total = applied.mapped + applied.lowConfidence;
      setPasteStatus({ ok: true, message: `${total} line${total === 1 ? "" : "s"} imported (${applied.mapped} accepted, ${applied.lowConfidence} for review).` });
    } catch (err) {
      setPasteStatus({ ok: false, message: err instanceof Error ? err.message : "Failed to parse JSON." });
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="operating"/>}
        title="Operating"
        subtitle="Department non-labor spend."
        actions={
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={uploadPdfToClaude}
      />

      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px",
        background: "var(--paper)", border: "1px solid var(--rule)",
      }}>
        <Btn kind="ghost" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}>
          <Icon name="sparkles" size={13}/> {pdfLoading ? "Sending to Claude…" : "Upload PDF via Claude"}
        </Btn>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {pdfLoading
            ? "Claude is reading the PDF — check the terminal for progress"
            : "Send a budget book or expenditure detail PDF — Claude extracts non-labor line items for PLAN, BLDG, ENG, and SHARED:CDS"}
        </span>
        {pdfStatus && (
          <span style={{
            marginLeft: "auto", fontSize: 12,
            color: pdfStatus.ok ? "var(--pos)" : "var(--warn)",
            fontWeight: 500,
          }}>
            {pdfStatus.message}
          </span>
        )}
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px",
        background: "var(--paper)", border: "1px solid var(--rule)",
        borderTop: "none",
      }}>
        <Btn kind="ghost" onClick={pasteFromClipboard}>
          Paste JSON from clipboard
        </Btn>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          Paste the <code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{"{ items: [...] }"}</code> output from an LLM
        </span>
        {pasteStatus && (
          <span style={{
            marginLeft: "auto", fontSize: 12,
            color: pasteStatus.ok ? "var(--pos)" : "var(--warn)",
            fontWeight: 500,
          }}>
            {pasteStatus.message}
          </span>
        )}
      </div>

      <OperatingSummary/>

      <OperatingBuckets/>

      <OperatingTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Operating"
        helper="Drag the budget book or a department detail sheet. Account-line and department-total rows both import — review before applying."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, budget book pdf"
        forceType="operating_budget"
        schema="Dept, account, amount, category, include/exclude."
      />
    </Page>
  );
}
