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
import { useBuildState } from "@/lib/store";
import {
  aiParseCapPdf,
  capCentersToExtractionResult,
  capBasesToExtractionResult,
  capBasisUnitsToExtractionResult,
  capPoolsToExtractionResult,
  capDirectAllocationsToExtractionResult,
} from "@/lib/ai/parseCap";
import type { UnmappedRow } from "@/lib/parse/types";

const SHOW_IMPORT: CapStep[] = ["centers", "pools"];

/** Pull display fields out of an unmapped CAP-basis lineage. The rawCells
 *  shape mirrors what capBasesToExtractionResult writes for OTHER /
 *  unrecognized-driver rows. */
function unmappedBasisDetails(u: UnmappedRow): {
  name: string; driverKey: string; source: string; reason: string;
} {
  const cells = u.lineage.rawCells ?? {};
  const fmt = (v: unknown): string => (v == null || v === "" ? "—" : String(v));
  return {
    name: fmt(cells.name),
    driverKey: fmt(cells.driverKey),
    source: fmt(cells.source),
    reason:
      u.reason === "missing-required-field" ? "DIRECT without target"
      : "driver outside named keys",
  };
}

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
  const { downloadExcel, openPdf } = useCapExport();
  const [step, setStep] = useState<CapStep>("centers");
  const [importerOpen, setImporterOpen] = useState(false);
  // Bases the model returned with driverKey "OTHER" or otherwise un-bindable.
  // Surfaced inline so users see what didn't bind; populated as a side effect
  // inside the drawer hooks.
  const [unmappedBases, setUnmappedBases] = useState<UnmappedRow[]>([]);
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

  async function uploadPdfToClaude(file: File): Promise<{ ok: boolean; message: string }> {
    setUnmappedBases([]);
    try {
      const result = await aiParseCapPdf(file);
      if (!result.ok) throw new Error(result.message ?? "PDF extraction failed.");
      const pools = capPoolsToExtractionResult(result.pools, file.name);
      const bundle = {
        centers: capCentersToExtractionResult(result.centers, file.name),
        bases:   capBasesToExtractionResult(result.bases, file.name),
        basisUnits: capBasisUnitsToExtractionResult(result.basisUnits, file.name),
        pools,
        directAllocations: capDirectAllocationsToExtractionResult(
          result.directAllocations, pools, file.name,
        ),
      };
      const applied = mergeCapBundle(bundle, file.name);
      setUnmappedBases(applied.unmappedBases);
      return { ok: true, message: buildStatusMessage(applied) };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "PDF import failed.",
      };
    }
  }

  async function pasteJson(text: string): Promise<{ ok: boolean; message: string }> {
    setUnmappedBases([]);
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in clipboard.");
      const parsed = JSON.parse(jsonMatch[0]) as {
        centers?: unknown[]; bases?: unknown[]; basisUnits?: unknown[];
        pools?: unknown[]; directAllocations?: unknown[];
      };
      const centers = Array.isArray(parsed.centers) ? parsed.centers : [];
      const bases   = Array.isArray(parsed.bases)   ? parsed.bases   : [];
      const basisUnits = Array.isArray(parsed.basisUnits) ? parsed.basisUnits : [];
      const pools   = Array.isArray(parsed.pools)   ? parsed.pools   : [];
      const directAllocations = Array.isArray(parsed.directAllocations)
        ? parsed.directAllocations : [];
      const total = centers.length + bases.length + basisUnits.length
        + pools.length + directAllocations.length;
      if (total === 0) {
        throw new Error('Expected { centers?, bases?, basisUnits?, pools?, directAllocations? } with at least one section.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poolsResult = capPoolsToExtractionResult(pools as any, "clipboard");
      const bundle = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        centers: capCentersToExtractionResult(centers as any, "clipboard"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bases:   capBasesToExtractionResult(bases as any,   "clipboard"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        basisUnits: capBasisUnitsToExtractionResult(basisUnits as any, "clipboard"),
        pools: poolsResult,
        directAllocations: capDirectAllocationsToExtractionResult(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          directAllocations as any, poolsResult, "clipboard",
        ),
      };
      const applied = mergeCapBundle(bundle, "clipboard");
      setUnmappedBases(applied.unmappedBases);
      return { ok: true, message: buildStatusMessage(applied) };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to parse JSON.",
      };
    }
  }

  return (
    <Page>
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
              onOpenPdf={openPdf}
              pdfLabel="Cost Allocation Plan (PDF)"
              pdfSub="Council-ready, print-formatted"
              excelLabel="Excel workbook (.xlsx)"
              excelSub="8 sheets — centers, pools, bases, schedules, matrix"
            />
          </>
        }
      />

      {unmappedBases.length > 0 && (
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
        }}>
          <div style={{
            padding: "10px 16px",
            background: "var(--paper-2)",
            borderBottom: "1px solid var(--rule)",
            display: "flex", alignItems: "baseline", gap: 10,
          }}>
            <span className="mono" style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              color: "var(--ink-3)", textTransform: "uppercase",
            }}>Bases for review</span>
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {unmappedBases.length} bas{unmappedBases.length === 1 ? "is" : "es"} could not be bound to a step-down driver. Pick a real
              driverKey for them in the bases catalog, or skip.
            </span>
            <button
              type="button"
              onClick={() => setUnmappedBases([])}
              style={{
                marginLeft: "auto",
                all: "unset", cursor: "pointer",
                fontSize: 11, color: "var(--ink-3)",
                padding: "2px 8px",
              }}
            >Dismiss all</button>
          </div>
          {unmappedBases.map((u, i) => {
            const d = unmappedBasisDetails(u);
            return (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 2fr) 120px minmax(140px, 1.4fr) minmax(140px, 1fr) 60px",
                gap: 12, alignItems: "baseline",
                padding: "8px 16px",
                fontSize: 12.5,
                borderBottom: i < unmappedBases.length - 1 ? "1px solid var(--rule)" : "none",
              }}>
                <span style={{ color: "var(--ink)" }}>{d.name}</span>
                <span className="mono" style={{
                  fontSize: 10.5, color: "var(--ink-3)",
                  letterSpacing: "0.06em",
                }}>{d.driverKey}</span>
                <span style={{ color: "var(--ink-2)", fontSize: 11.5 }}>{d.source}</span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{d.reason}</span>
                <button
                  type="button"
                  onClick={() => setUnmappedBases((prev) => prev.filter((_, j) => j !== i))}
                  style={{
                    all: "unset", cursor: "pointer",
                    fontSize: 11, color: "var(--ink-3)",
                    textAlign: "right",
                  }}
                >Skip</button>
              </div>
            );
          })}
        </div>
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
        title="Import Overhead Cost Allocation"
        helper="Upload a source PDF, or paste structured JSON as a fallback. Imports the full bundle: cost centers, allocation bases, and cost pools."
        aiPdfHelper="Send a Cost Allocation Plan PDF. We'll extract cost centers, allocation bases, and cost pools."
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ centers?, bases?, pools? }"
        pasteHelper="Paste structured output shaped like { centers?, bases?, pools? }."
        pasteSchema={CAP_SCHEMA}
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
