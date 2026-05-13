
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { CapKpiRail, StepDownSequence } from "@/features/build/CapKpiRail";
import { CapCentersTable } from "@/features/build/CapCentersTable";
import { CapSummary } from "@/features/build/CapSummary";
import { CapPoolsTable } from "@/features/build/CapPoolsTable";
import { CapStepNav, type CapStep } from "@/features/build/CapStepNav";
import { AllocationBases } from "@/features/build/AllocationBases";
import { AllocationMatrix } from "@/features/build/AllocationMatrix";
import { MappingReview } from "@/features/imports/MappingReview";
import { ImportDebug } from "@/features/imports/ImportDebug";
import { useBuildState } from "@/lib/store";
import { runImportPipeline } from "@/lib/import/pipeline";
import type { LastImport } from "@/components/ui";

export default function CapPage() {
  const { services, setCurrentBatch } = useBuildState();
  const [step, setStep] = useState<CapStep>("centers");

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="cap"/>}
        title="Cost Allocation"
        subtitle="Citywide indirect, allocated to direct departments."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      {/* Per-dept rollup is the executive summary — always visible above the
          step nav so it stays anchored as the reader pages between steps. */}
      <CapSummary/>

      <CapStepNav current={step} onJump={setStep}/>

      {step === "centers" && (
        <>
          <CapKpiRail/>
          <StepDownSequence/>
          <CapCentersTable/>
        </>
      )}

      {step === "pools" && (
        <>
          <DropZone
            accept=".xlsx,.csv"
            formats="xlsx, csv"
            hint="Drag a Cost Allocation Plan inventory. Pools, bases, percentages, and dollar allocations all import — review before applying."
            onImport={async (file): Promise<LastImport> => {
              const batch = await runImportPipeline(file, { services, forceType: "cost_allocation_plan" });
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

          <CapPoolsTable/>
        </>
      )}

      {step === "drivers" && <AllocationBases/>}

      {step === "matrix" && <AllocationMatrix/>}
    </Page>
  );
}
