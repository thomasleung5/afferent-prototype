
import { useRef, useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { ServicesTable } from "@/features/build/ServicesTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseServicesPdf, servicesToExtractionResult } from "@/lib/ai/parseServices";

export default function ServicesPage() {
  const { positions, services, seedUpstream, clearAll, mergeServices } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const missingUpstream = positions.length === 0;

  async function uploadPdfToClaude(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPdfStatus(null);
    setPdfLoading(true);
    try {
      const catalog = services.map((s) => ({ name: s.name, dept: s.dept }));
      const result = await aiParseServicesPdf(file, catalog);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const extraction = servicesToExtractionResult(result.services, services, file.name);
      const applied = mergeServices(extraction, file.name);
      const total = applied.mapped + applied.duplicates + applied.lowConfidence;
      setPdfStatus({ ok: true, message: `${total} service${total === 1 ? "" : "s"} imported from PDF (${applied.mapped} new, ${applied.duplicates} updated).` });
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
      const parsed = JSON.parse(jsonMatch[0]) as { services?: unknown[] };
      if (!Array.isArray(parsed.services) || parsed.services.length === 0)
        throw new Error('Expected { "services": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = servicesToExtractionResult(parsed.services as any, services, "clipboard");
      const applied = mergeServices(extraction, "clipboard");
      const total = applied.mapped + applied.duplicates + applied.lowConfidence;
      setPasteStatus({ ok: true, message: `${total} service${total === 1 ? "" : "s"} imported (${applied.mapped} new, ${applied.duplicates} updated).` });
    } catch (err) {
      setPasteStatus({ ok: false, message: err instanceof Error ? err.message : "Failed to parse JSON." });
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="services"/>}
        title="Services"
        subtitle="Hours per instance, role mix."
        actions={
          <>
            {missingUpstream && (
              <Btn kind="ghost" onClick={seedUpstream} title="Load sample staffing, operating, and CAP data so unit costs are non-zero">
                <Icon name="database" size={13}/> Use sample staffing &amp; costs
              </Btn>
            )}
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
            <Btn kind="ghost" onClick={clearAll} title="Clear all data">
              <Icon name="rotate-ccw" size={13}/> Clear
            </Btn>
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
            : "Send a prior fee study or cost-of-service PDF — Claude extracts service names, hours, volume, and fees"}
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
          Paste the <code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{"{ services: [...] }"}</code> output from an LLM
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

      <ServicesTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Services"
        helper="Drag a prior fee study or service inventory. Services that don't match the catalog import as candidates — accept after review."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, fee study pdf"
        forceType="prior_fee_study"
        schema="Service name, dept, hours per instance, volume, current fee."
      />
    </Page>
  );
}
