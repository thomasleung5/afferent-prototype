
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { StatusRow } from "@/features/_shared/StatusRow";
import { LaborSummary } from "@/features/build/LaborSummary";
import { PositionsTable } from "@/features/build/PositionsTable";
import { MappingReview } from "@/features/imports/MappingReview";
import { ImportDebug } from "@/features/imports/ImportDebug";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { LastImport } from "@/components/ui";

export default function DirectLaborPage() {
  const { positions, services, derived, currentBatch, setCurrentBatch } = useBuildState();
  const labor = derived.labor;
  const totalFte = positions.reduce((a, p) => a + p.fte, 0);
  const totalHrs = labor.PLAN.productiveHours + labor.BLDG.productiveHours + labor.ENG.productiveHours;
  const flagged = positions.filter((p) => p.flag).length;
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="salary"/>}
        title="Direct Labor"
        subtitle="Direct labor rate per department."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${positions.length} positions`,
        { value: flagged === 0 ? "Balanced" : `${flagged} need review`, tone: flagged === 0 ? "pos" : "warn" },
        `${Math.round(totalHrs).toLocaleString()} productive hrs`,
        `${totalFte.toFixed(1)} FTE`,
        ...(reviewing > 0 ? [{ value: `${reviewing} for review`, tone: "warn" as const }] : []),
        "FY 2026-27",
      ]}/>

      <LaborSummary/>

      <DropZone
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf budget exports"
        hint="Drag a salary roster or personnel budget. Each position imports as a candidate — accept after review."
        onImport={async (file): Promise<LastImport> => {
          const batch = await runImportPipeline(file, { services, forceType: "salary_roster" });
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

      <PositionsTable/>
    </Page>
  );
}
