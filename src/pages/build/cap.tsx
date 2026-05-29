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
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import {
  ImportReviewAction,
  ImportReviewPanel,
  ImportReviewRow,
} from "@/features/imports/ImportReviewPanel";
import { useCapImportHandlers } from "@/features/imports/sourceImportHandlers";
import { unmappedBasisDetails } from "@/lib/ai/parseCap";

const SHOW_IMPORT: CapStep[] = ["centers", "pools"];

export default function CapPage() {
  const { downloadExcel, pdfHref } = useCapExport();
  const [step, setStep] = useState<CapStep>("centers");
  const [importerOpen, setImporterOpen] = useState(false);
  const importer = useCapImportHandlers();
  const { unmappedBases, setUnmappedBases } = importer;
  const [showUnmappedDetails, setShowUnmappedDetails] = useState(false);
  const showImport = SHOW_IMPORT.includes(step);

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
            {showImport && (
              <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
                <Icon name="arrow-up-to-line" size={13}/> Import
              </Btn>
            )}
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

      {unmappedBases.length > 0 && (
        <ImportReviewPanel
          label="Bases for review"
          summary={`${unmappedBases.length} unbound — pick a driverKey or skip.`}
          actions={(
            <>
              <ImportReviewAction
                tone="default"
                onClick={() => setShowUnmappedDetails((v) => !v)}
              >
                {showUnmappedDetails ? "Hide details" : "Show details"}
              </ImportReviewAction>
              <ImportReviewAction onClick={() => setUnmappedBases([])}>
                Dismiss all
              </ImportReviewAction>
            </>
          )}
        >
          {showUnmappedDetails && unmappedBases.map((u, i) => {
            const d = unmappedBasisDetails(u);
            return (
              <ImportReviewRow
                key={i}
                columns="minmax(220px, 2fr) 120px minmax(140px, 1.4fr) minmax(140px, 1fr) 60px"
                isLast={i === unmappedBases.length - 1}
              >
                <span style={{ color: "var(--ink)" }}>{d.name}</span>
                <span className="mono" style={{
                  fontSize: "var(--t-l4)", color: "var(--ink-3)",
                  letterSpacing: "0.06em",
                }}>{d.driverKey}</span>
                <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{d.source}</span>
                <span style={{ fontSize: "var(--t-l8)", color: "var(--ink-3)" }}>{d.reason}</span>
                <ImportReviewAction
                  align="right"
                  onClick={() => setUnmappedBases((prev) => prev.filter((_, j) => j !== i))}
                >
                  Skip
                </ImportReviewAction>
              </ImportReviewRow>
            );
          })}
        </ImportReviewPanel>
      )}

      <CapSummary/>

      <CapStepNav current={step} onJump={setStep}/>

      {step === "centers" && <CapCentersTable/>}

      {step === "pools" && <CapPoolsTable/>}

      {step === "drivers" && <AllocationBases/>}

      {step === "detail" && <AllocationDetailReport/>}

      {step === "matrixByCenter" && <AllocationMatrixByCenter/>}

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title={importer.title}
        helper={importer.helper}
        aiPdfHelper={importer.aiPdfHelper}
        onAiPdfImport={importer.aiPdf}
        pasteExample={importer.pasteExample}
        pasteHelper={importer.pasteHelper}
        pasteSchema={importer.pasteSchema}
        onPasteJson={importer.pasteJson}
      />
    </Page>
  );
}
