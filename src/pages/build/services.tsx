
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { ServicesTable } from "@/features/build/ServicesTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";
import { useServicesImportHandlers } from "@/features/imports/sourceImportHandlers";

export default function ServicesPage() {
  const [importerOpen, setImporterOpen] = useState(false);
  const importer = useServicesImportHandlers();

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
