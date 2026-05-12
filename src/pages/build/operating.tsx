
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { OperatingSummary } from "@/features/build/OperatingSummary";
import { OperatingBuckets } from "@/features/build/OperatingBuckets";
import { OperatingTable } from "@/features/build/OperatingTable";
import { MappingReview } from "@/features/imports/MappingReview";
import { ImportDebug } from "@/features/imports/ImportDebug";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { LastImport } from "@/components/ui";

export default function OperatingPage() {
  const { operating, services, currentBatch, setCurrentBatch } = useBuildState();
  const included = operating.filter((l) => l.include);
  const excluded = operating.filter((l) => !l.include);
  const includedTotal = included.reduce((a, l) => a + l.amount, 0);
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="operating"/>}
        title="Operating"
        subtitle="Department non-labor spend."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${operating.length} lines`,
        { value: "Validated", tone: "pos" },
        `${included.length} included · ${excluded.length} excluded`,
        `${fmt.dollarsK(includedTotal)} flowing into $/hr`,
        ...(reviewing > 0 ? [{ value: `${reviewing} for review`, tone: "warn" as const }] : []),
        "FY 2026-27",
      ]}/>

      <OperatingSummary/>

      <OperatingBuckets/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, budget book pdf"
        hint="Drag the budget book or a department detail sheet. Account-line and department-total rows both import — review before applying."
        onImport={async (file): Promise<LastImport> => {
          const batch = await runImportPipeline(file, { services, forceType: "operating_budget" });
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

      <OperatingTable/>
    </Page>
  );
}
