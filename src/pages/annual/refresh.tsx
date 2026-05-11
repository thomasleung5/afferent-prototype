import { Page, PageHeader } from "@/components/layout";
import { AnnualEyebrow } from "@/features/annual/AnnualEyebrow";
import { RefreshImportGrid } from "@/features/annual/RefreshImportGrid";
import { StatusRow } from "@/features/_shared/StatusRow";

export default function AnnualRefreshPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<AnnualEyebrow role="Import node" label="Refresh inputs"/>}
        title="Refresh annual inputs"
        subtitle="Six inputs change each year. Imported, auto-mapped, and routed to section reviews."
      />
      <StatusRow items={[
        "2,464 rows imported",
        "6 inputs",
        { value: "97% auto-mapped", tone: "pos" },
        { value: "58 need review",  tone: "warn" },
        "Confidence · Medium-High",
        "Imported Apr 24, 2026",
      ]}/>
      <RefreshImportGrid/>
    </Page>
  );
}
