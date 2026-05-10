import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function SalaryPage() {
  return (
    <Page>
      <PageHeader eyebrow="Build model" title="Direct labor"/>
      <ComingSoon legacyFile="inputs-shared.jsx (SalaryModelScreen)"/>
    </Page>
  );
}
