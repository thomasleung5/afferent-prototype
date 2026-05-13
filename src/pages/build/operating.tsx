
import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { OperatingSummary } from "@/features/build/OperatingSummary";
import { OperatingBuckets } from "@/features/build/OperatingBuckets";
import { OperatingTable } from "@/features/build/OperatingTable";
import { PageImportDrawer } from "@/features/imports/PageImportDrawer";

export default function OperatingPage() {
  const [importerOpen, setImporterOpen] = useState(false);

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
            <Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>
          </>
        }
      />

      <OperatingSummary/>

      <OperatingBuckets/>

      <OperatingTable/>

      <PageImportDrawer
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        title="Import Operating"
        helper="Drag the budget book or a department detail sheet. Account-line and department-total rows both import — review before applying."
        accept=".xlsx,.csv,.pdf"
        formats="xlsx, csv, budget book pdf"
        forceType="operating_budget"
        schema="Dept, account, amount, category, include/exclude."
      />
    </Page>
  );
}
