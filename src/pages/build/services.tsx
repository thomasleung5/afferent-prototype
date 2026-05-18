
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { ServicesTable } from "@/features/build/ServicesTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseServicesPdf, servicesToExtractionResult } from "@/lib/ai/parseServices";

export default function ServicesPage() {
  const { services, mergeServices } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);

  async function uploadPdfToClaude(file: File): Promise<{ ok: boolean; message: string }> {
    try {
      const catalog = services.map((s) => ({ name: s.name, dept: s.dept }));
      const result = await aiParseServicesPdf(file, catalog);
      if (!result.ok) throw new Error(result.message ?? "AI parsing failed.");
      const extraction = servicesToExtractionResult(result.services, services, file.name);
      const applied = mergeServices(extraction, file.name);
      const total = applied.mapped + applied.duplicates + applied.lowConfidence;
      return {
        ok: true,
        message: `${total} service${total === 1 ? "" : "s"} imported from PDF (${applied.mapped} new, ${applied.duplicates} updated).`,
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
      const parsed = JSON.parse(jsonMatch[0]) as { services?: unknown[] };
      if (!Array.isArray(parsed.services) || parsed.services.length === 0)
        throw new Error('Expected { "services": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = servicesToExtractionResult(parsed.services as any, services, "clipboard");
      const applied = mergeServices(extraction, "clipboard");
      const total = applied.mapped + applied.duplicates + applied.lowConfidence;
      return {
        ok: true,
        message: `${total} service${total === 1 ? "" : "s"} imported (${applied.mapped} new, ${applied.duplicates} updated).`,
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
        eyebrow={<NodeEyebrow node="services"/>}
        title="Services"
        subtitle="Hours per instance, role mix."
        actions={
          <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
            <Icon name="arrow-up-to-line" size={13}/> Import
          </Btn>
        }
      />

      <ServicesTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Services"
        helper="Import services via Claude (PDF) or by pasting LLM JSON output."
        aiPdfHelper="Send a prior fee study or cost-of-service PDF — Claude extracts service names, hours, volume, and fees"
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ services: [...] }"
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
