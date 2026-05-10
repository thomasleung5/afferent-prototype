import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function PolicyPage() {
  return (
    <Page>
      <PageHeader eyebrow="Build model" title="Recovery policy"/>
      <ComingSoon legacyFile="screens-recovery-policy.jsx"/>
    </Page>
  );
}
