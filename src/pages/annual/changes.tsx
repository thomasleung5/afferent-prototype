import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, SectionEyebrow } from "@/components/ui";
import { ChangeReviewTable } from "@/features/annual/ChangeReviewTable";

export default function AnnualChangesPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<SectionEyebrow prefix="Annual Update" label="Review changes"/>}
        title="What changed this update?"
        subtitle="Review updates before generating the adoption packet."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export log</Btn>}
      />
      <ChangeReviewTable/>
    </Page>
  );
}
