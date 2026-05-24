
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { useExport } from "@/features/build/useExport";
import { LaborSummary } from "@/features/build/LaborSummary";
import { PositionsTable } from "@/features/build/PositionsTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import {
  createJsonImportHandler, createPdfImportHandler,
} from "@/features/imports/importRunners";
import { useBuildActions } from "@/lib/store";
import {
  aiParseDirectLaborPdf,
  directLaborToExtractionResult,
} from "@/lib/ai/parseDirectLabor";

type DirectLaborRows = Parameters<typeof directLaborToExtractionResult>[0];

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
  const { mergePositions } = useBuildActions((s) => ({
    mergePositions: s.mergePositions,
  }));
  const { downloadExcel, pdfHref } = useExport();
  const [importerOpen, setImporterOpen] = useState(false);

  const apply = (rows: DirectLaborRows, source: string) => {
    const extraction = directLaborToExtractionResult(rows, source);
    const applied = mergePositions(extraction, source);
    return formatImportSummary(
      extraction.stats.total, applied.mapped, applied.lowConfidence,
    );
  };

  const uploadPdfToClaude = createPdfImportHandler({
    parsePdf: aiParseDirectLaborPdf,
    apply: (parsed, fileName) => apply(parsed.positions, fileName),
  });

  const pasteJson = createJsonImportHandler({
    rootKey: "positions",
    apply: (rows, source) => apply(rows as DirectLaborRows, source),
  });

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
            <ExportMenu onDownloadExcel={downloadExcel} pdfHref={pdfHref}/>
          </>
        }
      />

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
