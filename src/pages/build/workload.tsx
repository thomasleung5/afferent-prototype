
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { WorkloadTable } from "@/features/build/WorkloadTable";
import { MappingReview } from "@/features/imports/MappingReview";
import { ImportDebug } from "@/features/imports/ImportDebug";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { LastImport } from "@/components/ui";

export default function WorkloadPage() {
  const { workload, services, currentBatch, setCurrentBatch } = useBuildState();
  const totalVol = workload.reduce((a, r) => a + (r.current ?? 0), 0);
  const missing  = workload.filter((r) => r.current == null).length;
  const carry    = workload.filter((r) => r.source === "carry-forward").length;
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="workload"/>}
        title="Workload"
        subtitle="Annual volume per service."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${services.length} services`,
        `${totalVol.toLocaleString()} workload rows`,
        { value: missing === 0 ? "All captured" : `${missing} missing`, tone: missing === 0 ? "pos" : "warn" },
        carry > 0 ? `${carry} carry-forward` : "No carry-forward",
        ...(reviewing > 0 ? [{ value: `${reviewing} for review`, tone: "warn" as const }] : []),
        "FY 2026-27",
      ]}/>

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
