import { Page, PageHeader } from "@/components/layout";
import { AnnualEyebrow } from "@/features/annual/AnnualEyebrow";
import { RefreshImportGrid } from "@/features/annual/RefreshImportGrid";
import { StatusRow } from "@/features/_shared/StatusRow";

export default function AnnualRefreshPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<AnnualEyebrow role="Import node" label="Refresh inputs"/>}
        title="Annual Data Refresh"
        subtitle="Refresh current-year staffing, operating, workload, fee schedule, and CAP inputs."
      />
      <StatusRow items={[
        "2,464 rows imported",
        "6 inputs",
        { value: "97% auto-mapped", tone: "pos" },
        { value: "58 need review",  tone: "warn" },
        "Confidence · Medium-High",
        "Refreshed Apr 24, 2026",
      ]}/>
      <RefreshImportGrid/>
    </Page>
  );
}
