import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function CostsPage() {
  return (
    <Page>
      <PageHeader eyebrow="Build model" title="Cost of service"/>
      <ComingSoon legacyFile="screens-cost-of-service.jsx, calc-engine.jsx"/>
    </Page>
  );
}
