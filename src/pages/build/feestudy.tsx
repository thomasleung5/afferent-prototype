
import { Page, PageHeader } from "@/components/layout";
import { DropZone, ExportMenu, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeScheduleTable } from "@/features/build/FeeScheduleTable";
import { MappingReview } from "@/features/imports/MappingReview";
import { ImportDebug } from "@/features/imports/ImportDebug";
import { useBuildState } from "@/lib/store";
import { useExport } from "@/features/build/useExport";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { LastImport } from "@/components/ui";

export default function FeeSchedulePage() {
  const { services, derived, currentBatch, setCurrentBatch } = useBuildState();
  const { downloadExcel, openPdf } = useExport();
  const comparisons = derived.comparisons;

  const totalUplift = comparisons.reduce((a, c) => a + Math.max(0, c.annualUplift), 0);
  const underRecovery = comparisons.filter((c) => c.recoveryPct < 100).length;
  const adoptedAt = comparisons.filter((c) => Math.abs(c.recommended - c.fee) < 1).length;
  const revenueNow = comparisons.reduce((a, c) => a + c.annualRevenue, 0);
  const revenueRec = comparisons.reduce((a, c) => a + c.recommended * c.volume, 0);
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="feestudy"/>}
        title="Fee Schedule"
        subtitle="What fees do we adopt? Current fees compared to calculated cost."
        actions={<ExportMenu onDownloadExcel={downloadExcel} onOpenPdf={openPdf}/>}
      />

      <StatusRow items={[
        `${comparisons.length} fees`,
        `${adoptedAt} at recommended`,
        `${underRecovery} under target`,
        `Now ${fmt.dollarsK(revenueNow)} · Rec ${fmt.dollarsK(revenueRec)}`,
        { value: `+${fmt.dollarsK(totalUplift)}/yr uplift`, tone: "pos" },
        ...(reviewing > 0 ? [{ value: `${reviewing} for review`, tone: "warn" as const }] : []),
      ]}/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, prior fee study pdf"
        hint="Drag a fee schedule, prior fee study, or peer-city benchmark. The pipeline extracts fees, deposits, hourly rates, and notes — then proposes mappings into the catalog."
        onImport={async (file): Promise<LastImport> => {
          const batch = await runImportPipeline(file, { services });
          setCurrentBatch(batch);
          const accepted = batch.mappings.filter((m) => m.status === "auto_accepted").length;
          const flagged = batch.mappings.filter((m) => m.status !== "auto_accepted").length;
          return {
            file: file.name,
            rows: batch.mappings.length,
            mapped: accepted,
            review: flagged,
            date: new Date().toLocaleString(undefined, {
              month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit",
            }),
          };
        }}
      />

      <MappingReview/>

      <ImportDebug/>

      <FeeScheduleTable/>
    </Page>
  );
}
