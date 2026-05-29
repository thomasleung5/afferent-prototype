
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { LaborSummary } from "@/features/build/LaborSummary";
import { LaborLineItemsTable } from "@/features/build/LaborLineItemsTable";
import { ProductiveHoursTable } from "@/features/build/ProductiveHoursTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useDirectLaborImportHandlers } from "@/features/imports/sourceImportHandlers";

export default function DirectLaborPage() {
  const [importerOpen, setImporterOpen] = useState(false);
  const importer = useDirectLaborImportHandlers();

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

      <LaborSummary/>

      <LaborLineItemsTable/>

      <ProductiveHoursTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title={importer.title}
        helper={importer.helper}
        aiPdfHelper={importer.aiPdfHelper}
        onAiPdfImport={importer.aiPdf}
        pasteExample={importer.pasteExample}
        pasteHelper={importer.pasteHelper}
        pasteSchema={importer.pasteSchema}
        onPasteJson={importer.pasteJson}
      />
    </Page>
  );
}
