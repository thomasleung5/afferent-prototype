import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon } from "@/components/ui";
import { AnnualEyebrow } from "@/features/annual/AnnualEyebrow";
import { WorkflowMap } from "@/features/build/WorkflowMap";

export default function AnnualOverviewPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<AnnualEyebrow role="Overview" label="FY 2026-27"/>}
        title="Annual refresh"
        subtitle="Prior model carried forward. Confirm this year's inputs."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Methodology</Btn>}
      />
      <WorkflowMap/>
    </Page>
  );
}
