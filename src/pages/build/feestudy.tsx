import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeScheduleTable } from "@/features/build/FeeScheduleTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { useExport } from "@/features/build/useExport";
import { aiParseFeesPdf, feesToExtractionResult } from "@/lib/ai/parseFees";

export default function FeeSchedulePage() {
  const { derived, services, mergeFeeSchedule } = useBuildState();
  const { downloadExcel, pdfHref } = useExport();
  const [importerOpen, setImporterOpen] = useState(false);
  const comparisons = derived.comparisons;

  // Net adoption impact: full-precision sum (recommended − fee) × volume across
  // every fee row, NOT clamped. Reconciles exactly with Recovery Policy's
  // Recoverable Revenue — both derive from the same calculatedRecommendedFee.
  const netAdoptionImpact = comparisons.reduce((a, c) => a + c.annualUplift, 0);
  const belowTarget = comparisons.filter((c) => c.recoveryPct < c.target).length;
  const atTarget = comparisons.filter((c) => Math.abs(c.recommended - c.fee) < 1).length;
  const revenueNow = comparisons.reduce((a, c) => a + c.annualRevenue, 0);
  // Target Revenue: sum of full-precision recommended × volume. NEVER use
  // c.recommended (rounded for display) — rounding drift breaks reconciliation.
  const targetRevenue = comparisons.reduce((a, c) => a + c.calculatedRecommendedFee * c.volume, 0);

  async function uploadPdfToClaude(file: File): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await aiParseFeesPdf(file);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const extraction = feesToExtractionResult(result.fees, services, file.name);
      const applied = mergeFeeSchedule(extraction, file.name);
      const total = applied.mapped + applied.duplicates + applied.lowConfidence;
      return {
        ok: true,
        message: `${total} fee${total === 1 ? "" : "s"} imported from PDF (${applied.mapped} new, ${applied.duplicates} updated).`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "PDF parsing failed.",
      };
    }
  }

  async function pasteJson(text: string): Promise<{ ok: boolean; message: string }> {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in clipboard.");
      const parsed = JSON.parse(jsonMatch[0]) as { fees?: unknown[] };
      if (!Array.isArray(parsed.fees) || parsed.fees.length === 0)
        throw new Error('Expected { "fees": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = feesToExtractionResult(parsed.fees as any, services, "clipboard");
      const applied = mergeFeeSchedule(extraction, "clipboard");
      const total = applied.mapped + applied.duplicates + applied.lowConfidence;
      return {
        ok: true,
        message: `${total} fee${total === 1 ? "" : "s"} imported (${applied.mapped} new, ${applied.duplicates} updated).`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to parse JSON.",
      };
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
            <ExportMenu onDownloadExcel={downloadExcel} pdfHref={pdfHref}/>
          </>
        }
      />

      <StatusRow items={[
        { label: "Fees",                value: `${comparisons.length}` },
        { label: "At target",           value: `${atTarget}` },
        { label: "Below target",        value: `${belowTarget}` },
        { label: "Current revenue",     value: `${fmt.dollarsK(revenueNow)}/yr` },
        { label: "Target revenue",      value: `${fmt.dollarsK(targetRevenue)}/yr` },
        { label: "Net adoption impact", value: `${netAdoptionImpact >= 0 ? "+" : ""}${fmt.dollarsK(netAdoptionImpact)}/yr`, tone: netAdoptionImpact >= 0 ? "pos" : "neg" },
      ]}/>

      <FeeScheduleTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Fee Schedule"
        helper="Import fees via Claude (PDF) or by pasting LLM JSON output."
        aiPdfHelper="Sends PDF directly to Claude — skips fuzzy matching, returns structured fees"
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ fees: [...] }"
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
