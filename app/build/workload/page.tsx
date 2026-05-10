import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function WorkloadPage() {
  return (
    <Page>
      <PageHeader eyebrow="Build model" title="Workload"/>
      <ComingSoon legacyFile="inputs-pattern.jsx (WorkloadModelScreen)"/>
    </Page>
  );
}
