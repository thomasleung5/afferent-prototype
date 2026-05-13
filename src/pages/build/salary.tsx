
import { useRef, useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { LaborSummary } from "@/features/build/LaborSummary";
import { PositionsTable } from "@/features/build/PositionsTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseSalaryPdf, salaryToExtractionResult } from "@/lib/ai/parseSalary";

export default function DirectLaborPage() {
  const { mergePositions } = useBuildState();
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
      const result = await aiParseSalaryPdf(file);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const extraction = salaryToExtractionResult(result.positions, file.name);
      const applied = mergePositions(extraction, file.name);
      const total = applied.mapped + applied.lowConfidence;
      setPdfStatus({ ok: true, message: `${total} position${total === 1 ? "" : "s"} imported from PDF (${applied.mapped} accepted, ${applied.lowConfidence} for review).` });
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
      const parsed = JSON.parse(jsonMatch[0]) as { positions?: unknown[] };
      if (!Array.isArray(parsed.positions) || parsed.positions.length === 0)
        throw new Error('Expected { "positions": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = salaryToExtractionResult(parsed.positions as any, "clipboard");
      const applied = mergePositions(extraction, "clipboard");
      const total = applied.mapped + applied.lowConfidence;
      setPasteStatus({ ok: true, message: `${total} position${total === 1 ? "" : "s"} imported (${applied.mapped} accepted, ${applied.lowConfidence} for review).` });
    } catch (err) {
      setPasteStatus({ ok: false, message: err instanceof Error ? err.message : "Failed to parse JSON." });
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="salary"/>}
        title="Direct Labor"
        subtitle="Direct labor rate per department."
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
            : "Send a salary roster or personnel budget PDF — Claude extracts title, dept, FTE, salary, and benefits"}
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
          Paste the <code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{"{ positions: [...] }"}</code> output from an LLM
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

      <LaborSummary/>

      <PositionsTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Direct Labor"
        helper="Drag a salary roster or personnel budget. Each position imports as a candidate — accept after review."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf budget exports"
        forceType="salary_roster"
        schema="Position title, dept, FTE, salary, benefits, productive hours."
      />
    </Page>
  );
}
