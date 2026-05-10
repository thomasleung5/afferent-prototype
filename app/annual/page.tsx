import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function AnnualOverviewPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Annual update"
        title="Annual update workflow"
        subtitle="Refresh the inputs that change each year — keep the structure."
      />
      <ComingSoon legacyFile="screens-annual.jsx"/>
    </Page>
  );
}
