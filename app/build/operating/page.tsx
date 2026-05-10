import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function OperatingPage() {
  return (
    <Page>
      <PageHeader eyebrow="Build model" title="Operating costs"/>
      <ComingSoon legacyFile="screens-operating.jsx"/>
    </Page>
  );
}
