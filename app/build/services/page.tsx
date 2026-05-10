import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function ServicesPage() {
  return (
    <Page>
      <PageHeader eyebrow="Build model" title="Services"/>
      <ComingSoon legacyFile="inputs-services.jsx"/>
    </Page>
  );
}
