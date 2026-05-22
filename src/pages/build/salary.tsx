
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { CostInputsSubsectionNav } from "@/features/build/CostInputsSubsectionNav";
import { LaborSummary } from "@/features/build/LaborSummary";
import { PositionsTable } from "@/features/build/PositionsTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseSalaryPdf, salaryToExtractionResult } from "@/lib/ai/parseSalary";

const POSITIONS_SCHEMA = `{
  positions: [
    { title, dept, fte, salary, benefits, hours, confidence }
  ]
}`;

/** Compose the post-import summary. The parser drops rows whose dept
 *  isn't in the fee-bearing registry, so we derive a "skipped" count
 *  from the gap between the model's row count and what survived merge. */
function formatImportSummary(
  total: number, mapped: number, lowConfidence: number,
): string {
  const imported = mapped + lowConfidence;
  const skipped = Math.max(0, total - imported);
  const parts: string[] = [`${mapped} accepted`, `${lowConfidence} for review`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `${imported} position${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
}

export default function DirectLaborPage() {
  const { mergePositions } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);

  async function uploadPdfToClaude(file: File): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await aiParseSalaryPdf(file);
      if (!result.ok) throw new Error(result.message ?? "PDF extraction failed.");
      const extraction = salaryToExtractionResult(result.positions, file.name);
      const applied = mergePositions(extraction, file.name);
      return {
        ok: true,
        message: formatImportSummary(extraction.stats.total, applied.mapped, applied.lowConfidence),
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "PDF import failed.",
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
      return {
        ok: true,
        message: formatImportSummary(extraction.stats.total, applied.mapped, applied.lowConfidence),
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
          <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
            <Icon name="arrow-up-to-line" size={13}/> Import
          </Btn>
        }
      />

      <CostInputsSubsectionNav/>

      <LaborSummary/>

      <PositionsTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Direct Labor"
        helper="Upload a source PDF, or paste structured JSON as a fallback."
        aiPdfHelper="Send a personnel budget or salary and benefits report PDF. We'll extract position, department, FTE, salary, benefits, and hours."
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ positions: [...] }"
        pasteHelper="Paste structured output shaped like { positions: [...] }."
        pasteSchema={POSITIONS_SCHEMA}
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
