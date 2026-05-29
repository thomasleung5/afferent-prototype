import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeScheduleTable } from "@/features/build/FeeScheduleTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useFeesImportHandlers } from "@/features/imports/sourceImportHandlers";
import { useBuildState } from "@/lib/store";
import { useExport } from "@/features/build/useExport";

export default function FeeSchedulePage() {
  const { derived } = useBuildState();
  const { downloadExcel, pdfHref } = useExport();
  const [importerOpen, setImporterOpen] = useState(false);
  const importer = useFeesImportHandlers();
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
        title={importer.title}
        helper={importer.helper}
        aiPdfHelper={importer.aiPdfHelper}
        onAiPdfImport={importer.aiPdf}
        pasteExample={importer.pasteExample}
        pasteHelper={importer.pasteHelper}
        pasteSchema={importer.pasteSchema}
        onPasteJson={importer.pasteJson}
      />
    </Page>
  );
}
