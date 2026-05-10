import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function BuildOverviewPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Build model"
        title="Model architecture"
        subtitle="Inputs → Analysis → Policy → Output. Deterministic recomputation."
      />
      <ComingSoon legacyFile="screens-build.jsx, screens-home.jsx (BuildModelOverview)"/>
    </Page>
  );
}
