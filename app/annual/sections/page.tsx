import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function AnnualSectionsPage() {
  return (
    <Page>
      <PageHeader eyebrow="Annual update" title="Review queue"/>
      <ComingSoon legacyFile="screens-annual-sections.jsx"/>
    </Page>
  );
}
