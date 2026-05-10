import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function FeeStudyPage() {
  return (
    <Page>
      <PageHeader eyebrow="Build model" title="Fee schedule"/>
      <ComingSoon legacyFile="screens-fee-schedule-v4.jsx"/>
    </Page>
  );
}
