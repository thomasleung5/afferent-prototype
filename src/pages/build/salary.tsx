
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { LaborSummary } from "@/features/build/LaborSummary";
import { PositionsTable } from "@/features/build/PositionsTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseSalaryPdf, salaryToExtractionResult } from "@/lib/ai/parseSalary";

export default function DirectLaborPage() {
  const { mergePositions } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);

  async function uploadPdfToClaude(file: File): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await aiParseSalaryPdf(file);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const extraction = salaryToExtractionResult(result.positions, file.name);
      const applied = mergePositions(extraction, file.name);
      const total = applied.mapped + applied.lowConfidence;
      return {
        ok: true,
        message: `${total} position${total === 1 ? "" : "s"} imported from PDF (${applied.mapped} accepted, ${applied.lowConfidence} for review).`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "PDF parsing failed.",
      };
    }
  }

  async function pasteJson(text: string): Promise<{ ok: boolean; message: string }> {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in clipboard.");
      const parsed = JSON.parse(jsonMatch[0]) as { positions?: unknown[] };
      if (!Array.isArray(parsed.positions) || parsed.positions.length === 0)
        throw new Error('Expected { "positions": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = salaryToExtractionResult(parsed.positions as any, "clipboard");
      const applied = mergePositions(extraction, "clipboard");
      const total = applied.mapped + applied.lowConfidence;
      return {
        ok: true,
        message: `${total} position${total === 1 ? "" : "s"} imported (${applied.mapped} accepted, ${applied.lowConfidence} for review).`,
      };
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
        eyebrow={<NodeEyebrow node="salary"/>}
        title="Direct Labor"
        subtitle="Direct labor rate per department."
        actions={
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <LaborSummary/>

      <PositionsTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Direct Labor"
        helper="Drag a salary roster or personnel budget. Each position imports as a candidate — accept after review."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf budget exports"
        forceType="salary_roster"
        schema="Position title, dept, FTE, salary, benefits, productive hours."
        aiPdfHelper="Send a salary roster or personnel budget PDF — Claude extracts title, dept, FTE, salary, and benefits"
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ positions: [...] }"
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
