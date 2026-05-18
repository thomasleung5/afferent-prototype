
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { ServicesTable } from "@/features/build/ServicesTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useBuildState } from "@/lib/store";
import { aiParseServicesPdf, servicesToExtractionResult } from "@/lib/ai/parseServices";

const SERVICES_SCHEMA = `{
  services: [
    { name, dept, hours, volume, fee, target, confidence }
  ]
}`;

/** Compose the post-import summary. The parser drops rows with a dept
 *  outside PLAN/BLDG/ENG silently, so we derive a "skipped" count from
 *  the gap between the model's row count and what survived merge. */
function formatImportSummary(
  total: number, mapped: number, lowConfidence: number, duplicates: number,
): string {
  const imported = mapped + lowConfidence + duplicates;
  const skipped = Math.max(0, total - imported);
  const parts: string[] = [`${mapped} accepted`];
  if (duplicates > 0)    parts.push(`${duplicates} updated`);
  parts.push(`${lowConfidence} for review`);
  if (skipped > 0)       parts.push(`${skipped} skipped`);
  return `${imported} service${imported === 1 ? "" : "s"} imported (${parts.join(", ")}).`;
}

export default function ServicesPage() {
  const { services, mergeServices } = useBuildState();
  const [importerOpen, setImporterOpen] = useState(false);

  async function uploadPdfToClaude(file: File): Promise<{ ok: boolean; message: string }> {
    try {
      const catalog = services.map((s) => ({ name: s.name, dept: s.dept }));
      const result = await aiParseServicesPdf(file, catalog);
      if (!result.ok) throw new Error(result.message ?? "PDF extraction failed.");
      const extraction = servicesToExtractionResult(result.services, services, file.name);
      const applied = mergeServices(extraction, file.name);
      return {
        ok: true,
        message: formatImportSummary(
          extraction.stats.total, applied.mapped, applied.lowConfidence, applied.duplicates,
        ),
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
      const parsed = JSON.parse(jsonMatch[0]) as { services?: unknown[] };
      if (!Array.isArray(parsed.services) || parsed.services.length === 0)
        throw new Error('Expected { "services": [...] } structure.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraction = servicesToExtractionResult(parsed.services as any, services, "clipboard");
      const applied = mergeServices(extraction, "clipboard");
      return {
        ok: true,
        message: formatImportSummary(
          extraction.stats.total, applied.mapped, applied.lowConfidence, applied.duplicates,
        ),
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
        helper="Upload a source PDF, or paste structured JSON as a fallback."
        aiPdfHelper="Send a prior fee study or cost-of-service PDF. We'll extract service names, hours, volume, and fees."
        onAiPdfImport={uploadPdfToClaude}
        pasteExample="{ services: [...] }"
        pasteHelper="Paste structured output shaped like { services: [...] }."
        pasteSchema={SERVICES_SCHEMA}
        onPasteJson={pasteJson}
      />
    </Page>
  );
}
