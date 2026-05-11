import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon } from "@/components/ui";
import { AnnualEyebrow } from "@/features/annual/AnnualEyebrow";
import { ChangeReviewTable } from "@/features/annual/ChangeReviewTable";

export default function AnnualChangesPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<AnnualEyebrow role="Reconciliation" label="Review changes"/>}
        title="What changed this update?"
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export log</Btn>}
      />
      <ChangeReviewTable/>
    </Page>
  );
}
