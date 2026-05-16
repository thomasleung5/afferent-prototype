import { useRef, useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeScheduleTable } from "@/features/build/FeeScheduleTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseFeesPdf, feesToExtractionResult } from "@/lib/ai/parseFees";

export default function FeeSchedulePage() {
  const { derived, currentBatch, services, mergeFeeSchedule } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pdfStatus, setPdfStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const comparisons = derived.comparisons;

  const totalUplift = comparisons.reduce((a, c) => a + Math.max(0, c.annualUplift), 0);
  const underRecovery = comparisons.filter((c) => c.recoveryPct < 100).length;
  const adoptedAt = comparisons.filter((c) => Math.abs(c.recommended - c.fee) < 1).length;
  const revenueNow = comparisons.reduce((a, c) => a + c.annualRevenue, 0);
  const revenueRec = comparisons.reduce((a, c) => a + c.recommended * c.volume, 0);
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;

  async function uploadPdfToClaude(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPdfStatus(null);
    setPdfLoading(true);
    try {
      const result = await aiParseFeesPdf(file);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const extraction = feesToExtractionResult(result.fees, services, file.name);
      const applied = mergeFeeSchedule(extraction, file.name);
      const total = applied.mapped + applied.duplicates + applied.lowConfidence;
      setPdfStatus({ ok: true, message: `${total} fee${total === 1 ? "" : "s"} imported from PDF (${applied.mapped} new, ${applied.duplicates} updated).` });
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
      const parsed = JSON.parse(jsonMatch[0]) as { fees?: unknown[] };
      if (!Array.isArray(parsed.fees) || parsed.fees.length === 0) throw new Error('Expected { "fees": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = feesToExtractionResult(parsed.fees as any, services, "clipboard");
      const applied = mergeFeeSchedule(extraction, "clipboard");
      const total = applied.mapped + applied.duplicates + applied.lowConfidence;
      setPasteStatus({ ok: true, message: `${total} fee${total === 1 ? "" : "s"} imported (${applied.mapped} new, ${applied.duplicates} updated).` });
    } catch (err) {
      setPasteStatus({ ok: false, message: err instanceof Error ? err.message : "Failed to parse JSON." });
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="feestudy"/>}
        title="Fee Schedule"
        subtitle="What fees do we adopt? Current fees compared to calculated cost."
        actions={
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <StatusRow items={[
        { label: "Fees",              value: `${comparisons.length}` },
        { label: "At recommended",    value: `${adoptedAt}` },
        { label: "Under target",      value: `${underRecovery}` },
        { label: "Current revenue",   value: fmt.dollarsK(revenueNow) },
        { label: "Recommended revenue", value: fmt.dollarsK(revenueRec) },
        { label: "Annual uplift",     value: `+${fmt.dollarsK(totalUplift)}/yr`, tone: "pos" },
        ...(reviewing > 0
          ? [{ label: "For review", value: `${reviewing}`, tone: "warn" as const }]
          : []),
      ]}/>

      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px",
        background: "var(--paper)", border: "1px solid var(--rule)",
      }}>
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={uploadPdfToClaude}
        />
        <Btn kind="ghost" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}>
          <Icon name="sparkles" size={13}/> {pdfLoading ? "Sending to Claude…" : "Upload PDF via Claude"}
        </Btn>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {pdfLoading ? "Claude is reading the PDF — check the terminal for progress" : "Sends PDF directly to Claude — skips fuzzy matching, returns structured fees"}
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
          Paste the <code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{"{ fees: [...] }"}</code> output from an LLM
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

      <FeeScheduleTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Fee Schedule"
        helper="Drag a fee schedule, prior fee study, or peer-city benchmark. The pipeline extracts fees, deposits, hourly rates, and notes — then proposes mappings into the catalog."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, prior fee study pdf"
        schema="Service name, fee, deposit, hourly rate, notes."
      />
    </Page>
  );
}
