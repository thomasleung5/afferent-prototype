
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { LaborSummary } from "@/features/build/LaborSummary";
import { PositionsTable } from "@/features/build/PositionsTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";

export default function DirectLaborPage() {
  const [importerOpen, setImporterOpen] = useState(false);

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
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <LaborSummary/>

      <PositionsTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Direct Labor"
        helper="Drag a salary roster or personnel budget. Each position imports as a candidate — accept after review."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, pdf budget exports"
        forceType="salary_roster"
        schema="Position title, dept, FTE, salary, benefits, productive hours."
      />
    </Page>
  );
}
