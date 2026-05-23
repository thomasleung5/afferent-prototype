import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { useCapExport } from "@/features/build/useCapExport";
import { CapCentersTable } from "@/features/build/CapCentersTable";
import { CostInputsSubsectionNav } from "@/features/build/CostInputsSubsectionNav";
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
import { useBuildState } from "@/lib/store";
import {
  createJsonImportHandler, createPdfImportHandler,
} from "@/features/imports/importRunners";
import {
  aiParseCapPdf,
  capCentersToExtractionResult,
  capBasesToExtractionResult,
  capBasisUnitsToExtractionResult,
  capPoolsToExtractionResult,
  capDirectAllocationsToExtractionResult,
  unmappedBasisDetails,
} from "@/lib/ai/parseCap";
import type { UnmappedRow } from "@/lib/parse/types";

type CapCenterRows = Parameters<typeof capCentersToExtractionResult>[0];
type CapBaseRows = Parameters<typeof capBasesToExtractionResult>[0];
type CapBasisUnitRows = Parameters<typeof capBasisUnitsToExtractionResult>[0];
type CapPoolRows = Parameters<typeof capPoolsToExtractionResult>[0];
type CapDirectAllocationRows = Parameters<typeof capDirectAllocationsToExtractionResult>[0];

interface CapImportSections {
  centers: CapCenterRows;
  bases: CapBaseRows;
  basisUnits: CapBasisUnitRows;
  pools: CapPoolRows;
  directAllocations: CapDirectAllocationRows;
}

const SHOW_IMPORT: CapStep[] = ["centers", "pools"];

const arrLen = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Compact "3 centers, 4 bases, 2 schedules, 15 pools, 1 direct alloc"
 *  summary; omits zero sections. */
function bundleCountsMessage(counts: {
  centers: number; bases: number; basisUnits: number;
  pools: number; directAllocations: number;
}): string {
  const parts: string[] = [];
  if (counts.centers > 0) parts.push(`${counts.centers} center${counts.centers === 1 ? "" : "s"}`);
  if (counts.bases > 0)   parts.push(`${counts.bases} bas${counts.bases === 1 ? "is" : "es"}`);
  if (counts.basisUnits > 0) parts.push(`${counts.basisUnits} schedule${counts.basisUnits === 1 ? "" : "s"}`);
  if (counts.pools > 0)   parts.push(`${counts.pools} pool${counts.pools === 1 ? "" : "s"}`);
  if (counts.directAllocations > 0) parts.push(`${counts.directAllocations} direct alloc${counts.directAllocations === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "nothing";
}

const CAP_SCHEMA = `{
  centers: [{ name, glCode, totalCost, confidence }],
  bases:   [{ name, source, methodologyNote, driverKey, directTo, confidence }],
  basisUnits: [{ basis, source?, receivers:
    [{ dept, glCode, deptCode?, units, confidence? }] }],
  pools:   [{ center, pool, allocationPercent, amount,
              basis, recoverability, confidence }],
  directAllocations: [{ pool, center?, receivers:
    [{ dept, glCode, deptCode?, percent, confidence? }] }]
}`;

export default function CapPage() {
  const { mergeCapBundle } = useBuildState();
  const { downloadExcel, pdfHref } = useCapExport();
  const [step, setStep] = useState<CapStep>("centers");
  const [importerOpen, setImporterOpen] = useState(false);
  // Bases the model returned with driverKey "OTHER" or otherwise un-bindable.
  // Surfaced inline so users see what didn't bind; populated as a side effect
  // inside the drawer hooks.
  const [unmappedBases, setUnmappedBases] = useState<UnmappedRow[]>([]);
  const [showUnmappedDetails, setShowUnmappedDetails] = useState(false);
  const showImport = SHOW_IMPORT.includes(step);

  function buildStatusMessage(applied: ReturnType<typeof mergeCapBundle>): string {
    const counts = bundleCountsMessage({
      centers: applied.centersImported,
      bases: applied.basesImported,
      basisUnits: applied.basisUnitsImported,
      pools: applied.poolsImported,
      directAllocations: applied.directAllocationsImported,
    });
    const unmatched = applied.unmappedBases.length;
    const parts: string[] = [`${applied.mapped} accepted`, `${applied.lowConfidence} for review`];
    if (unmatched > 0) parts.push(`${unmatched} unmatched bas${unmatched === 1 ? "is" : "es"}`);
    return `${counts} imported (${parts.join(", ")}).`;
  }

  // CAP imports are multi-section: centers / bases / basisUnits / pools /
  // directAllocations. PDF builds all five from one parser result;
  // clipboard JSON treats each section as optional but requires at least
  // one. Both paths share this bundle-building step.
  const applySections = (sections: CapImportSections, source: string) => {
    const pools = capPoolsToExtractionResult(sections.pools, source);
    const bundle = {
      centers: capCentersToExtractionResult(sections.centers, source),
      bases:   capBasesToExtractionResult(sections.bases, source),
      basisUnits: capBasisUnitsToExtractionResult(sections.basisUnits, source),
      pools,
      directAllocations: capDirectAllocationsToExtractionResult(
        sections.directAllocations, pools, source,
      ),
    };
    const applied = mergeCapBundle(bundle, source);
    setUnmappedBases(applied.unmappedBases);
    return buildStatusMessage(applied);
  };

  const resetUnmappedBases = () => setUnmappedBases([]);

  const uploadPdfToClaude = createPdfImportHandler({
    parsePdf: aiParseCapPdf,
    apply: (parsed, fileName) => applySections({
      centers: parsed.centers,
      bases: parsed.bases,
      basisUnits: parsed.basisUnits,
      pools: parsed.pools,
      directAllocations: parsed.directAllocations,
    }, fileName),
    onStart: resetUnmappedBases,
  });

  const pasteJson = createJsonImportHandler({
    onStart: resetUnmappedBases,
    // No single rootKey — every section is optional but at least one
    // must be non-empty.
    validate: (parsed) => {
      const total =
        arrLen(parsed.centers) + arrLen(parsed.bases) + arrLen(parsed.basisUnits)
        + arrLen(parsed.pools) + arrLen(parsed.directAllocations);
      if (total === 0) {
        throw new Error('Expected { centers?, bases?, basisUnits?, pools?, directAllocations? } with at least one section.');
      }
    },
    apply: (payload, source) => {
      const p = payload as Record<string, unknown>;
      return applySections({
        centers: (Array.isArray(p.centers) ? p.centers : []) as CapCenterRows,
        bases:   (Array.isArray(p.bases)   ? p.bases   : []) as CapBaseRows,
        basisUnits: (Array.isArray(p.basisUnits) ? p.basisUnits : []) as CapBasisUnitRows,
        pools:   (Array.isArray(p.pools)   ? p.pools   : []) as CapPoolRows,
        directAllocations: (Array.isArray(p.directAllocations)
          ? p.directAllocations : []) as CapDirectAllocationRows,
      }, source);
    },
  });

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
                  fontSize: 10.5, color: "var(--ink-3)",
                  letterSpacing: "0.06em",
                }}>{d.driverKey}</span>
                <span style={{ color: "var(--ink-2)", fontSize: 11.5 }}>{d.source}</span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{d.reason}</span>
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

      <CostInputsSubsectionNav/>

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
        title="Import Overhead Cost Allocation"
        helper="Imports centers, allocation bases, and cost pools."
        aiPdfHelper="Upload a Cost Allocation Plan PDF."
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ centers?, bases?, pools? }"
        pasteHelper="Paste JSON shaped like { centers?, bases?, pools? }."
        pasteSchema={CAP_SCHEMA}
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
