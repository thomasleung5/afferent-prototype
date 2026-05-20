
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { OperatingSummary } from "@/features/build/OperatingSummary";
import { OperatingTable } from "@/features/build/OperatingTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseOperatingPdf, operatingToExtractionResult } from "@/lib/ai/parseOperating";

const OPERATING_SCHEMA = `{
  operating: [
    { code, line, dept, category, amount, include, confidence }
  ]
}`;

/** Build the post-import summary. The extraction's `stats.total` reflects
 *  every row the model returned; rows dropped by the dept normalizer
 *  (non-PLAN/BLDG/ENG/SHARED:CDS) don't survive into mapped or
 *  lowConfidence, so we surface that gap as "skipped". */
function formatImportSummary(
  total: number, mapped: number, lowConfidence: number,
): string {
  const imported = mapped + lowConfidence;
  const skipped = Math.max(0, total - imported);
  const parts: string[] = [`${mapped} accepted`, `${lowConfidence} for review`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `${imported} line${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
}

export default function OperatingPage() {
  const { mergeOperating } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);

  async function uploadPdfToClaude(file: File): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await aiParseOperatingPdf(file);
      if (!result.ok) throw new Error(result.message ?? "PDF extraction failed.");
      const extraction = operatingToExtractionResult(result.operating, file.name);
      const applied = mergeOperating(extraction, file.name);
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
      const parsed = JSON.parse(jsonMatch[0]) as { operating?: unknown[] };
      if (!Array.isArray(parsed.operating) || parsed.operating.length === 0)
        throw new Error('Expected { "operating": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = operatingToExtractionResult(parsed.operating as any, "clipboard");
      const applied = mergeOperating(extraction, "clipboard");
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
        eyebrow={<NodeEyebrow node="operating"/>}
        title="Operating"
        subtitle="Department non-labor spend."
        actions={
          <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
            <Icon name="arrow-up-to-line" size={13}/> Import
          </Btn>
        }
      />

      <OperatingSummary/>

      <OperatingTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Operating"
        helper="Upload a source PDF, or paste structured JSON as a fallback."
        aiPdfHelper="Send a budget book or expenditure detail PDF. We'll extract non-labor line items."
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ operating: [...] }"
        pasteHelper="Paste structured output shaped like { operating: [...] }."
        pasteSchema={OPERATING_SCHEMA}
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
