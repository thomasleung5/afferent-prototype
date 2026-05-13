import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { CapKpiRail, StepDownSequence } from "@/features/build/CapKpiRail";
import { CapCentersTable } from "@/features/build/CapCentersTable";
import { CapSummary } from "@/features/build/CapSummary";
import { CapPoolsTable } from "@/features/build/CapPoolsTable";
import { CapStepNav, type CapStep } from "@/features/build/CapStepNav";
import { AllocationBases } from "@/features/build/AllocationBases";
import { AllocationMatrix } from "@/features/build/AllocationMatrix";
import { AllocationMatrixByCenter } from "@/features/build/AllocationMatrixByCenter";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";

const SHOW_IMPORT: CapStep[] = ["centers", "pools"];

export default function CapPage() {
  const [step, setStep] = useState<CapStep>("centers");
  const [importerOpen, setImporterOpen] = useState(false);
  const showImport = SHOW_IMPORT.includes(step);

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="cap"/>}
        title="Cost Allocation"
        subtitle="Citywide indirect, allocated to direct departments."
        actions={
          <>
            {showImport && (
              <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
                <Icon name="arrow-up-to-line" size={13}/> Import
              </Btn>
            )}
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <CapSummary/>

      <CapStepNav current={step} onJump={setStep}/>

      {step === "centers" && (
        <>
          <CapKpiRail/>
          <StepDownSequence/>
          <CapCentersTable/>
        </>
      )}

      {step === "pools" && <CapPoolsTable/>}

      {step === "drivers" && <AllocationBases/>}

      {step === "matrix" && <AllocationMatrix/>}

      {step === "matrixByCenter" && <AllocationMatrixByCenter/>}

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Cost Allocation"
        helper="Drag a Cost Allocation Plan inventory. Pools, bases, percentages, and dollar allocations all import — review before applying."
        accept=".xlsx,.csv"
        formats="xlsx, csv"
        forceType="cost_allocation_plan"
        schema="Center, pool, basis, dollar amount, recoverability."
      />
    </Page>
  );
}
