
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { ServicesTable } from "@/features/build/ServicesTable";
import { MappingReview } from "@/features/imports/MappingReview";
import { ImportDebug } from "@/features/imports/ImportDebug";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { LastImport } from "@/components/ui";

export default function ServicesPage() {
  const { services, currentBatch, setCurrentBatch } = useBuildState();

  const byDept = {
    PLAN: services.filter((s) => s.dept === "PLAN").length,
    BLDG: services.filter((s) => s.dept === "BLDG").length,
    ENG:  services.filter((s) => s.dept === "ENG").length,
  };
  const totalHours = services.reduce((a, s) => a + s.hours, 0);
  const flagged = services.filter((s) => !s.hours || !s.volume).length;
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="services"/>}
        title="Services"
        subtitle="Hours per instance, role mix."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${services.length} services`,
        `${byDept.PLAN} Planning · ${byDept.BLDG} Building · ${byDept.ENG} Engineering`,
        `${Math.round(totalHours).toLocaleString()} hrs / instance`,
        { value: flagged === 0 ? "All scoped" : `${flagged} need review`, tone: flagged === 0 ? "pos" : "warn" },
        ...(reviewing > 0 ? [{ value: `${reviewing} for review`, tone: "warn" as const }] : []),
        "FY 2026-27",
      ]}/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, fee study pdf"
        hint="Drag a prior fee study or service inventory. Services that don't match the catalog import as candidates — accept after review."
        onImport={async (file): Promise<LastImport> => {
          const batch = await runImportPipeline(file, { services, forceType: "prior_fee_study" });
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

      <ServicesTable/>
    </Page>
  );
}
