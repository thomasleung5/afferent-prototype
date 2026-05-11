import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function AnnualChangesPage() {
  return (
    <Page>
      <PageHeader eyebrow="Annual update" title="Review changes"/>
      <ComingSoon legacyFile="screens-annual-changes.jsx"/>
    </Page>
  );
}
