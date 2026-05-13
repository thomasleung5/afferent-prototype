
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { WorkloadTable } from "@/features/build/WorkloadTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";

export default function WorkloadPage() {
  const [importerOpen, setImporterOpen] = useState(false);

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="workload"/>}
        title="Workload"
        subtitle="Annual volume per service."
        actions={
          <>
            <Btn kind="ghost" onClick={() => setImporterOpen(true)}>
              <Icon name="arrow-up-to-line" size={13}/> Import
            </Btn>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <WorkloadTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Workload Data"
        helper="Drag a permit-system export. Tyler EnerGov, Accela, OpenGov, or any CSV with service + volume columns — service names get fuzzy-matched to the catalog."
        accept=".xlsx,.csv"
        formats="xlsx, csv permit-system exports"
        forceType="workload_export"
        schema="Service name, annual volume, optional unit and notes."
      />
    </Page>
  );
}
