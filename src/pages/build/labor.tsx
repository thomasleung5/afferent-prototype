
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { LaborSummary } from "@/features/build/LaborSummary";
import { LaborLineItemsTable } from "@/features/build/LaborLineItemsTable";
import { ProductiveHoursTable } from "@/features/build/ProductiveHoursTable";

export default function LaborPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="salary"/>}
        title="Labor"
        subtitle="Direct labor rate per department."
        actions={
          <Btn kind="ghost" href="/source-data#positions">
            <Icon name="arrow-up-to-line" size={13}/> Import Data
          </Btn>
        }
      />

      <LaborSummary/>

      <LaborLineItemsTable/>

      <ProductiveHoursTable/>
    </Page>
  );
}
