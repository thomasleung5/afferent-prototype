import { useRef, useState } from "react";
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
import { useBuildState } from "@/lib/store";
import {
  aiParseCapPdf,
  capCentersToExtractionResult,
  capBasesToExtractionResult,
  capPoolsToExtractionResult,
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

/** Compact "3 centers, 4 bases, 15 pools" summary; omits zero sections. */
function bundleCountsMessage(counts: { centers: number; bases: number; pools: number }): string {
  const parts: string[] = [];
  if (counts.centers > 0) parts.push(`${counts.centers} center${counts.centers === 1 ? "" : "s"}`);
  if (counts.bases > 0)   parts.push(`${counts.bases} bas${counts.bases === 1 ? "is" : "es"}`);
  if (counts.pools > 0)   parts.push(`${counts.pools} pool${counts.pools === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "nothing";
}

export default function CapPage() {
  const { mergeCapBundle } = useBuildState();
  const [step, setStep] = useState<CapStep>("centers");
  const [importerOpen, setImporterOpen] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [unmappedBases, setUnmappedBases] = useState<UnmappedRow[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const showImport = SHOW_IMPORT.includes(step);

  function buildStatusMessage(applied: ReturnType<typeof mergeCapBundle>): string {
    const counts = bundleCountsMessage({
      centers: applied.centersImported,
      bases: applied.basesImported,
      pools: applied.poolsImported,
    });
    const review = applied.unmappedBases.length;
    const tail = review > 0
      ? `${applied.mapped} accepted, ${applied.lowConfidence} for review, ${review} bas${review === 1 ? "is" : "es"} need attention`
      : `${applied.mapped} accepted, ${applied.lowConfidence} for review`;
    return `${counts} imported (${tail}).`;
  }

  async function uploadPdfToClaude(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPdfStatus(null);
    setUnmappedBases([]);
    setPdfLoading(true);
    try {
      const result = await aiParseCapPdf(file);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const bundle = {
        centers: capCentersToExtractionResult(result.centers, file.name),
        bases:   capBasesToExtractionResult(result.bases, file.name),
        pools:   capPoolsToExtractionResult(result.pools, file.name),
      };
      const applied = mergeCapBundle(bundle, file.name);
      setUnmappedBases(applied.unmappedBases);
      setPdfStatus({ ok: true, message: buildStatusMessage(applied) });
    } catch (err) {
      setPdfStatus({ ok: false, message: err instanceof Error ? err.message : "PDF parsing failed." });
    } finally {
      setPdfLoading(false);
    }
  }

  async function pasteFromClipboard() {
    setPasteStatus(null);
    setUnmappedBases([]);
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setPasteStatus({ ok: false, message: "Clipboard access denied — try Ctrl+C then paste again." });
      return;
    }
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in clipboard.");
      const parsed = JSON.parse(jsonMatch[0]) as {
        centers?: unknown[]; bases?: unknown[]; pools?: unknown[];
      };
      const centers = Array.isArray(parsed.centers) ? parsed.centers : [];
      const bases   = Array.isArray(parsed.bases)   ? parsed.bases   : [];
      const pools   = Array.isArray(parsed.pools)   ? parsed.pools   : [];
      if (centers.length + bases.length + pools.length === 0) {
        throw new Error('Expected { centers?: [...], bases?: [...], pools?: [...] } with at least one section.');
      }
      const bundle = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        centers: capCentersToExtractionResult(centers as any, "clipboard"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bases:   capBasesToExtractionResult(bases as any,   "clipboard"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pools:   capPoolsToExtractionResult(pools as any,   "clipboard"),
      };
      const applied = mergeCapBundle(bundle, "clipboard");
      setUnmappedBases(applied.unmappedBases);
      setPasteStatus({ ok: true, message: buildStatusMessage(applied) });
    } catch (err) {
      setPasteStatus({ ok: false, message: err instanceof Error ? err.message : "Failed to parse JSON." });
    }
  }

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

      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={uploadPdfToClaude}
      />

      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px",
        background: "var(--paper)", border: "1px solid var(--rule)",
      }}>
        <Btn kind="ghost" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}>
          <Icon name="sparkles" size={13}/> {pdfLoading ? "Sending to Claude…" : "Upload PDF via Claude"}
        </Btn>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {pdfLoading
            ? "Claude is reading the PDF — check the terminal for progress"
            : "Send a Cost Allocation Plan PDF — Claude detects and extracts cost centers, allocation bases, and cost pools in one pass"}
        </span>
        {pdfStatus && (
          <span style={{
            marginLeft: "auto", fontSize: 12,
            color: pdfStatus.ok ? "var(--pos)" : "var(--warn)",
            fontWeight: 500,
          }}>
            {pdfStatus.message}
          </span>
        )}
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px",
        background: "var(--paper)", border: "1px solid var(--rule)",
        borderTop: "none",
      }}>
        <Btn kind="ghost" onClick={pasteFromClipboard}>
          Paste JSON from clipboard
        </Btn>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          Paste the <code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{"{ centers?, bases?, pools? }"}</code> output from an LLM
        </span>
        {pasteStatus && (
          <span style={{
            marginLeft: "auto", fontSize: 12,
            color: pasteStatus.ok ? "var(--pos)" : "var(--warn)",
            fontWeight: 500,
          }}>
            {pasteStatus.message}
          </span>
        )}
      </div>

      {unmappedBases.length > 0 && (
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)",
          borderTop: "none",
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
