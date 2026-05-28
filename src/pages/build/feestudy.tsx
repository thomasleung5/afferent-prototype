import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeScheduleTable } from "@/features/build/FeeScheduleTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import {
  createJsonImportHandler, createPdfImportHandler,
} from "@/features/imports/importRunners";
import { useBuildState } from "@/lib/store";
import { useExport } from "@/features/build/useExport";
import { aiParseFeesPdf, feesToExtractionResult } from "@/lib/ai/parseFees";

type FeeRows = Parameters<typeof feesToExtractionResult>[0];

export default function FeeSchedulePage() {
  const { derived, services, mergeFeeSchedule } = useBuildState();
  const { downloadExcel, pdfHref } = useExport();
  const [importerOpen, setImporterOpen] = useState(false);
  const comparisons = derived.comparisons;

  // Net adoption impact: full-precision sum (recommended − fee) × volume across
  // recoverable fee rows, NOT clamped. Reconciles exactly with Recovery
  // Policy's Recoverable Revenue — both derive from the same
  // calculatedRecommendedFee and skip display-only/non-recoverable rows.
  const recoverableComparisons = comparisons.filter((c) => c.recoverable);
  const netAdoptionImpact = recoverableComparisons.reduce((a, c) => a + c.annualUplift, 0);
  const belowTarget = recoverableComparisons.filter((c) => c.recoveryPct < c.target).length;
  const atTarget = recoverableComparisons.filter((c) => Math.abs(c.recommended - c.fee) < 1).length;
  const revenueNow = recoverableComparisons.reduce((a, c) => a + c.annualRevenue, 0);
  // Target Revenue: sum of full-precision recommended × volume. NEVER use
  // c.recommended (rounded for display) — rounding drift breaks reconciliation.
  const targetRevenue = recoverableComparisons.reduce((a, c) => a + c.calculatedRecommendedFee * c.volume, 0);

  // Fee Schedule's two summaries differ subtly: PDF includes "from PDF"
  // in its sentence; clipboard does not. Each handler owns that
  // formatting so the existing copy is preserved verbatim.
  const apply = (rows: FeeRows, source: string, fromPdf: boolean) => {
    const extraction = feesToExtractionResult(rows, services, source);
    const applied = mergeFeeSchedule(extraction, source);
    const total = applied.mapped + applied.duplicates + applied.lowConfidence;
    const noun = `fee${total === 1 ? "" : "s"}`;
    const suffix = fromPdf ? " from PDF" : "";
    return `${total} ${noun} imported${suffix} (${applied.mapped} new, ${applied.duplicates} updated).`;
  };

  const uploadPdfToClaude = createPdfImportHandler({
    parsePdf: aiParseFeesPdf,
    apply: (parsed, fileName) => apply(parsed.fees, fileName, true),
    parseFailureMessage: "AI parsing failed.",
    importFailureMessage: "PDF parsing failed.",
  });

  const pasteJson = createJsonImportHandler({
    rootKey: "fees",
    apply: (rows, source) => apply(rows as FeeRows, source, false),
  });

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
