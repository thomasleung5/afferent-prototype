import { Page, PageHeader } from "@/components/layout";
import { AnnualEyebrow } from "@/features/annual/AnnualEyebrow";
import { RefreshImportGrid } from "@/features/annual/RefreshImportGrid";
import { StatusRow } from "@/features/_shared/StatusRow";

export default function AnnualRefreshPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<AnnualEyebrow label="Refresh inputs"/>}
        title="Annual Data Refresh"
        subtitle="Refresh current-year staffing, operating, workload, fee schedule, and CAP inputs."
      />
      <StatusRow items={[
        { label: "Rows imported", value: "2,464" },
        { label: "Inputs",        value: "6" },
        { label: "Auto-mapped",   value: "97%",  tone: "pos" },
        { label: "Need review",   value: "58",   tone: "warn" },
        { label: "Confidence",    value: "Medium-High" },
        { label: "Last refresh",  value: "Apr 24, 2026" },
      ]}/>
      <RefreshImportGrid/>
    </Page>
  );
}
