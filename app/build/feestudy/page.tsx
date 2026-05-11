
import { Page, PageHeader } from "@/components/layout";
import { DropZone, ExportMenu, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeScheduleTable } from "@/features/build/FeeScheduleTable";
import { ImportReview } from "@/features/build/ImportReview";
import { useBuildState } from "@/features/build/BuildContext";
import { useExport } from "@/features/build/useExport";
import { toLastImport, runAiAssistPass } from "@/features/build/runImport";
import { parseFile } from "@/lib/parse";
import { extractFeeSchedule } from "@/lib/parse/extract";

export default function FeeSchedulePage() {
  const {
    services, derived, mergeFeeSchedule, pendingReview,
    setAiStatus, addAiSuggestions,
  } = useBuildState();
  const { downloadExcel, openPdf } = useExport();
  const comparisons = derived.comparisons;

  const totalUplift = comparisons.reduce((a, c) => a + Math.max(0, c.annualUplift), 0);
  const underRecovery = comparisons.filter((c) => c.recoveryPct < 100).length;
  const adoptedAt = comparisons.filter((c) => Math.abs(c.recommended - c.fee) < 1).length;
  const revenueNow = comparisons.reduce((a, c) => a + c.annualRevenue, 0);
  const revenueRec = comparisons.reduce((a, c) => a + c.recommended * c.volume, 0);
  const reviewQueue = pendingReview.fees.length;

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
        ...(reviewQueue > 0 ? [{ value: `${reviewQueue} unmapped`, tone: "warn" as const }] : []),
      ]}/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, prior fee study pdf"
        hint="Drag a prior fee study or current schedule workbook. Looking for fee name, dept, and current fee columns."
        onImport={async (file) => {
          const doc = await parseFile(file);
          const result = extractFeeSchedule(doc, services);
          const applied = mergeFeeSchedule(result, file.name);
          const serviceExamples = services.slice(0, 12).map((s) => ({
            name: s.name, dept: s.dept, fee: s.fee,
          }));
          void runAiAssistPass({
            domain: "fees",
            doc,
            unmapped: result.unmapped,
            exampleRows: serviceExamples as unknown as Record<string, unknown>[],
            setStatus: (s) => setAiStatus("fees", s),
            addSuggestions: (items) => addAiSuggestions("fees", items),
          });
          return toLastImport(applied);
        }}
      />

      <ImportReview domain="fees"/>

      <FeeScheduleTable/>
    </Page>
  );
}
