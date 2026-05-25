
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { ServicesTable } from "@/features/build/ServicesTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import {
  createJsonImportHandler, createPdfImportHandler,
} from "@/features/imports/importRunners";
import { useBuildState } from "@/lib/store";
import { aiParseServicesPdf, servicesToExtractionResult } from "@/lib/ai/parseServices";

type ServiceRows = Parameters<typeof servicesToExtractionResult>[0];

const SERVICES_SCHEMA = `{
  services: [
    { name, dept, hours, volume, fee, target, confidence }
  ]
}`;

/** Compose the post-import summary. The parser drops rows whose dept
 *  isn't in the fee-bearing registry, so we derive a "skipped" count
 *  from the gap between the model's row count and what survived merge. */
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

  const apply = (rows: ServiceRows, source: string) => {
    const extraction = servicesToExtractionResult(rows, services, source);
    const applied = mergeServices(extraction, source);
    return formatImportSummary(
      extraction.stats.total, applied.mapped, applied.lowConfidence, applied.duplicates,
    );
  };

  const uploadPdfToClaude = createPdfImportHandler({
    // Wraps the parser so it can pull the live catalog into the prompt;
    // factory only knows about `(file) => Promise<…>`.
    parsePdf: (file) => aiParseServicesPdf(
      file, services.map((s) => ({ name: s.name, dept: s.dept })),
    ),
    apply: (parsed, fileName) => apply(parsed.services, fileName),
  });

  const pasteJson = createJsonImportHandler({
    rootKey: "services",
    apply: (rows, source) => apply(rows as ServiceRows, source),
  });

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="services"/>}
        title="Services"
        subtitle="Hours per instance, role allocation."
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
