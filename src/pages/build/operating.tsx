
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { OperatingSummary } from "@/features/build/OperatingSummary";
import { OperatingBuckets } from "@/features/build/OperatingBuckets";
import { OperatingTable } from "@/features/build/OperatingTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseOperatingPdf, operatingToExtractionResult } from "@/lib/ai/parseOperating";

export default function OperatingPage() {
  const { mergeOperating } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);

  async function uploadPdfToClaude(file: File): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await aiParseOperatingPdf(file);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const extraction = operatingToExtractionResult(result.operating, file.name);
      const applied = mergeOperating(extraction, file.name);
      const total = applied.mapped + applied.lowConfidence;
      return {
        ok: true,
        message: `${total} line${total === 1 ? "" : "s"} imported from PDF (${applied.mapped} accepted, ${applied.lowConfidence} for review).`,
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
      const parsed = JSON.parse(jsonMatch[0]) as { operating?: unknown[] };
      if (!Array.isArray(parsed.operating) || parsed.operating.length === 0)
        throw new Error('Expected { "operating": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = operatingToExtractionResult(parsed.operating as any, "clipboard");
      const applied = mergeOperating(extraction, "clipboard");
      const total = applied.mapped + applied.lowConfidence;
      return {
        ok: true,
        message: `${total} line${total === 1 ? "" : "s"} imported (${applied.mapped} accepted, ${applied.lowConfidence} for review).`,
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
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <OperatingSummary/>

      <OperatingBuckets/>

      <OperatingTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Operating"
        helper="Import operating lines via Claude (PDF) or by pasting LLM JSON output."
        aiPdfHelper="Send a budget book or expenditure detail PDF — Claude extracts non-labor line items for PLAN, BLDG, ENG, and SHARED:CDS"
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ operating: [...] }"
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
