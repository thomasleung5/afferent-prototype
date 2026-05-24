
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { useExport } from "@/features/build/useExport";
import { OperatingSummary } from "@/features/build/OperatingSummary";
import { OperatingTable } from "@/features/build/OperatingTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import {
  createJsonImportHandler, createPdfImportHandler,
} from "@/features/imports/importRunners";
import { useBuildActions } from "@/lib/store";
import { aiParseOperatingPdf, operatingToExtractionResult } from "@/lib/ai/parseOperating";

type OperatingRows = Parameters<typeof operatingToExtractionResult>[0];

const OPERATING_SCHEMA = `{
  operating: [
    { code, line, dept, category, amount, include, confidence }
  ]
}`;

/** Build the post-import summary. Rows the dept normalizer can't map to
 *  a fee-bearing dept (or to SHARED:CDS) don't survive into mapped or
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
  const { mergeOperating } = useBuildActions((s) => ({
    mergeOperating: s.mergeOperating,
  }));
  const { downloadExcel, pdfHref } = useExport();
  const [importerOpen, setImporterOpen] = useState(false);

  const apply = (rows: OperatingRows, source: string) => {
    const extraction = operatingToExtractionResult(rows, source);
    const applied = mergeOperating(extraction, source);
    return formatImportSummary(
      extraction.stats.total, applied.mapped, applied.lowConfidence,
    );
  };

  const uploadPdfToClaude = createPdfImportHandler({
    parsePdf: aiParseOperatingPdf,
    apply: (parsed, fileName) => apply(parsed.operating, fileName),
  });

  const pasteJson = createJsonImportHandler({
    rootKey: "operating",
    apply: (rows, source) => apply(rows as OperatingRows, source),
  });

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
            <ExportMenu onDownloadExcel={downloadExcel} pdfHref={pdfHref}/>
          </>
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
