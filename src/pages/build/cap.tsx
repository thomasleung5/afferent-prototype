
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, DropZone, NodeEyebrow } from "@/components/ui";
import { CAP_TOTAL } from "@/lib/data/cap";
import { StatusRow } from "@/features/_shared/StatusRow";
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
  const { capAllocation, capPools, services, currentBatch, setCurrentBatch } = useBuildState();
  const [step, setStep] = useState<CapStep>("centers");

  const totalAllocated =
    capAllocation.PLAN.allocated + capAllocation.BLDG.allocated + capAllocation.ENG.allocated;
  const allocatedPct = CAP_TOTAL > 0 ? Math.round((totalAllocated / CAP_TOTAL) * 100) : 0;
  const reviewCount = capPools.filter((p) => p.review === "Review").length;
  const reviewing = currentBatch
    ? currentBatch.mappings.filter((m) => m.status === "needs_review" || m.status === "unresolved").length
    : 0;
  const centerCount = new Set(capPools.map((p) => p.center)).size;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="cap"/>}
        title="Cost Allocation"
        subtitle="Citywide indirect, allocated to direct departments."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${centerCount} centers`,
        `${capPools.length} pools`,
        `${allocatedPct}% allocated`,
        { value: reviewCount === 0 ? "Balanced" : `${reviewCount} unresolved`, tone: reviewCount === 0 ? "pos" : "warn" },
        ...(reviewing > 0 ? [{ value: `${reviewing} for review`, tone: "warn" as const }] : []),
        "Step-down · FY 2026-27",
      ]}/>

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
