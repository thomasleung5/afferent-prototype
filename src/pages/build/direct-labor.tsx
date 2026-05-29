
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { LaborSummary } from "@/features/build/LaborSummary";
import { LaborLineItemsTable } from "@/features/build/LaborLineItemsTable";
import { ProductiveHoursTable } from "@/features/build/ProductiveHoursTable";

export default function DirectLaborPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="salary"/>}
        title="Direct Labor"
        subtitle="Direct labor rate per department."
        actions={
          <Btn kind="ghost" href="/annual/refresh">
            <Icon name="arrow-up-to-line" size={13}/> Re-import
          </Btn>
        }
      />

      <LaborSummary/>

      <LaborLineItemsTable/>

      <ProductiveHoursTable/>
    </Page>
  );
}
