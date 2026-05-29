import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { useCapExport } from "@/features/build/useCapExport";
import { CapCentersTable } from "@/features/build/CapCentersTable";
import { CapSummary } from "@/features/build/CapSummary";
import { CapPoolsTable } from "@/features/build/CapPoolsTable";
import { CapStepNav, type CapStep } from "@/features/build/CapStepNav";
import { AllocationBases } from "@/features/build/AllocationBases";
import { AllocationDetailReport } from "@/features/build/AllocationDetailReport";
import { AllocationMatrixByCenter } from "@/features/build/AllocationMatrixByCenter";

export default function CapPage() {
  const { downloadExcel, pdfHref } = useCapExport();
  const [step, setStep] = useState<CapStep>("centers");

  return (
    <Page>
      {/* In-app uses the operational label "Overhead Cost Allocation".
        * The published PDF deliverable uses the formal name "Cost
        * Allocation Plan" — see src/pages/export/cap-allocation.tsx. */}
      <PageHeader
        eyebrow={<NodeEyebrow node="cap"/>}
        title="Overhead Cost Allocation"
        subtitle="Citywide indirect, allocated to direct departments."
        actions={
          <>
            <Btn kind="ghost" href="/source-data#cap">
              <Icon name="arrow-up-to-line" size={13}/> Import Data
            </Btn>
            <ExportMenu
              onDownloadExcel={downloadExcel}
              pdfHref={pdfHref}
              pdfLabel="Cost Allocation Plan (PDF)"
              pdfSub="Council-ready, print-formatted"
              excelLabel="Excel workbook (.xlsx)"
              excelSub="8 sheets — centers, pools, bases, schedules, matrix"
            />
          </>
        }
      />

      <CapSummary/>

      <CapStepNav current={step} onJump={setStep}/>

      {step === "centers" && <CapCentersTable/>}

      {step === "pools" && <CapPoolsTable/>}

      {step === "drivers" && <AllocationBases/>}

      {step === "detail" && <AllocationDetailReport/>}

      {step === "matrixByCenter" && <AllocationMatrixByCenter/>}
    </Page>
  );
}
