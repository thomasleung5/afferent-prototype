"use client";

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
import { ImportReview } from "@/features/build/ImportReview";
import { useBuildState } from "@/features/build/BuildContext";
import { toLastImport, runAiAssistPass } from "@/features/build/runImport";
import { parseFile } from "@/lib/parse";
import { extractCap } from "@/lib/parse/extract";

export default function CapPage() {
  const {
    capAllocation, capPools, mergeCap, pendingReview,
    setAiStatus, addAiSuggestions,
  } = useBuildState();
  const [step, setStep] = useState<CapStep>("centers");

  const totalAllocated =
    capAllocation.PLAN.allocated + capAllocation.BLDG.allocated + capAllocation.ENG.allocated;
  const allocatedPct = CAP_TOTAL > 0 ? Math.round((totalAllocated / CAP_TOTAL) * 100) : 0;
  const reviewCount = capPools.filter((p) => p.review === "Review").length;
  const reviewQueue = pendingReview.cap.length;
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
        ...(reviewQueue > 0 ? [{ value: `${reviewQueue} unmapped`, tone: "warn" as const }] : []),
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
            hint="Drag the most recent Cost Allocation Plan inventory. Centers, pools, and bases in one workbook."
            onImport={async (file) => {
              const doc = await parseFile(file);
              const result = extractCap(doc, capPools);
              const applied = mergeCap(result, file.name);
              void runAiAssistPass({
                domain: "cap",
                doc,
                unmapped: result.unmapped,
                exampleRows: capPools.slice(0, 3) as unknown as Record<string, unknown>[],
                setStatus: (s) => setAiStatus("cap", s),
                addSuggestions: (items) => addAiSuggestions("cap", items),
              });
              return toLastImport(applied);
            }}
          />

          <ImportReview domain="cap"/>

          <CapPoolsTable/>
        </>
      )}

      {step === "drivers" && <AllocationBases/>}

      {step === "matrix" && <AllocationMatrix/>}
    </Page>
  );
}
