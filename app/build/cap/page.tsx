import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function CapPage() {
  return (
    <Page>
      <PageHeader eyebrow="Build model" title="Cost allocation"/>
      <ComingSoon legacyFile="screens-cap.jsx, cap-engine.jsx, data-cap.jsx"/>
    </Page>
  );
}
