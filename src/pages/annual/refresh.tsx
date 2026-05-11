import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function AnnualRefreshPage() {
  return (
    <Page>
      <PageHeader eyebrow="Annual update" title="Refresh inputs"/>
      <ComingSoon legacyFile="screens-annual.jsx (AnnualRefreshScreen)"/>
    </Page>
  );
}
