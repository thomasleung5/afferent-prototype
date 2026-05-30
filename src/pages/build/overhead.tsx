import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { useOverheadExport } from "@/features/build/useOverheadExport";
import { OverheadCentersTable } from "@/features/build/OverheadCentersTable";
import { OverheadSummary } from "@/features/build/OverheadSummary";
import { OverheadPoolsTable } from "@/features/build/OverheadPoolsTable";
import { OverheadStepNav, type OverheadStep } from "@/features/build/OverheadStepNav";
import { AllocationBases } from "@/features/build/AllocationBases";
import { AllocationDetailReport } from "@/features/build/AllocationDetailReport";
import { AllocationMatrixByCenter } from "@/features/build/AllocationMatrixByCenter";

export default function OverheadCostsPage() {
  const { downloadExcel, pdfHref } = useOverheadExport();
  const [step, setStep] = useState<OverheadStep>("centers");

  return (
    <Page>
      {/* In-app uses "Overhead Costs". The published PDF deliverable
        * uses the formal name "Cost Allocation Plan" — see
        * src/pages/export/cap-allocation.tsx. */}
      <PageHeader
        eyebrow={<NodeEyebrow node="overhead"/>}
        title="Overhead Costs"
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

      <OverheadSummary/>

      <OverheadStepNav current={step} onJump={setStep}/>

      {step === "centers" && <OverheadCentersTable/>}

      {step === "pools" && <OverheadPoolsTable/>}

      {step === "drivers" && <AllocationBases/>}

      {step === "detail" && <AllocationDetailReport/>}

      {step === "matrixByCenter" && <AllocationMatrixByCenter/>}
    </Page>
  );
}
