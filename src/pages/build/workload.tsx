
import { useRef, useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { WorkloadTable } from "@/features/build/WorkloadTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseWorkloadPdf, workloadToExtractionResult } from "@/lib/ai/parseWorkload";
import type { UnmappedRow } from "@/lib/parse/types";

/** Pull human-readable display fields out of an UnmappedRow's lineage so the
 *  surfaced list can show "name (dept) — prior / current". The shape mirrors
 *  what workloadToExtractionResult writes into `rawCells`. */
function unmappedDetails(u: UnmappedRow): {
  name: string; dept: string; prior: string; current: string; reason: string;
} {
  const cells = u.lineage.rawCells ?? {};
  const fmt = (v: unknown): string => {
    if (v == null || v === "") return "—";
    return String(v);
  };
  return {
    name: fmt(cells.name),
    dept: fmt(cells.dept),
    prior: fmt(cells.prior),
    current: fmt(cells.current),
    reason:
      u.reason === "ambiguous-dept" ? "dept mismatch with catalog"
      : u.reason === "missing-required-field" ? "missing volume"
      : u.reason === "blank" ? "blank row"
      : "no catalog match",
  };
}

export default function WorkloadPage() {
  const { mergeWorkload, services, workload } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [unmapped, setUnmapped] = useState<UnmappedRow[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  function applyExtraction(rows: Parameters<typeof workloadToExtractionResult>[0], fileName: string) {
    const extraction = workloadToExtractionResult(rows, services, fileName, workload);
    const applied = mergeWorkload(extraction, fileName);
    const matched = applied.mapped + applied.duplicates;
    return {
      summary: `${matched} matched, ${applied.lowConfidence} for review, ${extraction.unmapped.length} unmatched.`,
      unmapped: extraction.unmapped,
    };
  }

  async function uploadPdfToClaude(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPdfStatus(null);
    setUnmapped([]);
    setPdfLoading(true);
    try {
      const result = await aiParseWorkloadPdf(file);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const { summary, unmapped: u } = applyExtraction(result.items, file.name);
      setUnmapped(u);
      setPdfStatus({ ok: true, message: summary });
    } catch (err) {
      setPdfStatus({ ok: false, message: err instanceof Error ? err.message : "PDF parsing failed." });
    } finally {
      setPdfLoading(false);
    }
  }

  async function pasteFromClipboard() {
    setPasteStatus(null);
    setUnmapped([]);
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
      const parsed = JSON.parse(jsonMatch[0]) as { items?: unknown[] };
      if (!Array.isArray(parsed.items) || parsed.items.length === 0)
        throw new Error('Expected { "items": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { summary, unmapped: u } = applyExtraction(parsed.items as any, "clipboard");
      setUnmapped(u);
      setPasteStatus({ ok: true, message: summary });
    } catch (err) {
      setPasteStatus({ ok: false, message: err instanceof Error ? err.message : "Failed to parse JSON." });
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="workload"/>}
        title="Workload"
        subtitle="Annual volume per service."
        actions={
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
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
            : "Send an annual report, permit-volume table, or workload appendix — Claude extracts service-level volume counts and matches them to the existing catalog"}
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
          Paste the <code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>{"{ items: [...] }"}</code> output from an LLM
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

      {unmapped.length > 0 && (
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
            }}>Unmatched</span>
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {unmapped.length} row{unmapped.length === 1 ? "" : "s"} could not be matched to the catalog. Add the service to
              {" "}<code style={{ fontFamily: "var(--ff-mono)", fontSize: 11 }}>lib/data/services.ts</code>{" "}
              and re-import, or skip.
            </span>
            <button
              type="button"
              onClick={() => setUnmapped([])}
              style={{
                marginLeft: "auto",
                all: "unset", cursor: "pointer",
                fontSize: 11, color: "var(--ink-3)",
                padding: "2px 8px",
              }}
            >Dismiss all</button>
          </div>
          {unmapped.map((u, i) => {
            const d = unmappedDetails(u);
            return (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 2fr) 64px 80px 80px minmax(140px, 1fr) 60px",
                gap: 12, alignItems: "baseline",
                padding: "8px 16px",
                fontSize: 12.5,
                borderBottom: i < unmapped.length - 1 ? "1px solid var(--rule)" : "none",
              }}>
                <span style={{ color: "var(--ink)" }}>{d.name}</span>
                <span className="mono" style={{
                  fontSize: 10.5, color: "var(--ink-3)",
                  letterSpacing: "0.06em",
                }}>{d.dept}</span>
                <span className="num" style={{
                  textAlign: "right", color: "var(--ink-3)",
                  fontVariantNumeric: "tabular-nums",
                }}>{d.prior}</span>
                <span className="num" style={{
                  textAlign: "right", color: "var(--ink-2)",
                  fontVariantNumeric: "tabular-nums",
                }}>{d.current}</span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{d.reason}</span>
                <button
                  type="button"
                  onClick={() => setUnmapped((prev) => prev.filter((_, j) => j !== i))}
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

      <WorkloadTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Workload Data"
        helper="Drag a permit-system export. Tyler EnerGov, Accela, OpenGov, or any CSV with service + volume columns — service names get fuzzy-matched to the catalog."
        accept=".xlsx,.csv"
        formats="xlsx, csv permit-system exports"
        forceType="workload_export"
        schema="Service name, annual volume, optional unit and notes."
      />
    </Page>
  );
}
