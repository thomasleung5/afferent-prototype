
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { ServicesTable } from "@/features/build/ServicesTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";

export default function ServicesPage() {
  const [importerOpen, setImporterOpen] = useState(false);

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="services"/>}
        title="Services"
        subtitle="Hours per instance, role mix."
        actions={
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <ServicesTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Services"
        helper="Drag a prior fee study or service inventory. Services that don't match the catalog import as candidates — accept after review."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, fee study pdf"
        forceType="prior_fee_study"
        schema="Service name, dept, hours per instance, volume, current fee."
      />
    </Page>
  );
}
