
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { WorkloadTable } from "@/features/build/WorkloadTable";
import { MappingReview } from "@/features/imports/MappingReview";
import { ImportDebug } from "@/features/imports/ImportDebug";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { LastImport } from "@/components/ui";

export default function WorkloadPage() {
  const { services, setCurrentBatch } = useBuildState();

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="workload"/>}
        title="Workload"
        subtitle="Annual volume per service."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <DropZone
        accept=".xlsx,.csv"
        formats="xlsx, csv permit-system exports"
        hint="Drag a permit-system export. Tyler EnerGov, Accela, OpenGov, or any CSV with service + volume columns — service names get fuzzy-matched to the catalog."
        onImport={async (file): Promise<LastImport> => {
          const batch = await runImportPipeline(file, { services, forceType: "workload_export" });
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

      <WorkloadTable/>
    </Page>
  );
}
