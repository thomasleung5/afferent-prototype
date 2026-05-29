import { Page, PageHeader } from "@/components/layout";
import { SectionEyebrow } from "@/components/ui";
import { RefreshImportGrid } from "@/features/annual/RefreshImportGrid";
import { StatusRow } from "@/features/_shared/StatusRow";
import { useBuildState } from "@/lib/store";
import { deriveRefreshSummary } from "@/lib/data/annual";

export default function AnnualRefreshPage() {
  const state = useBuildState();
  const summary = deriveRefreshSummary({
    imports: state.imports,
    productiveHours: state.productiveHours,
    operating: state.operating,
    volume: state.volume,
    services: state.services,
    capPools: state.capPools,
    comparisons: state.derived.comparisons,
    impact: state.derived.impact,
  });

  return (
    <Page>
      <PageHeader
        eyebrow={<SectionEyebrow prefix="Annual Update" label="Refresh inputs"/>}
        title="Source Data"
        subtitle="Refresh current-year staffing, operating, volume of activity, fee schedule, and CAP inputs."
      />
      <StatusRow items={[
        {
          label: "Sources connected",
          value: `${summary.inputsRefreshed} of ${summary.totalInputs}`,
          tone: summary.inputsRefreshed === summary.totalInputs ? "pos" : undefined,
        },
        {
          label: "Items needing review",
          value: String(summary.totalReview),
          tone: summary.totalReview > 0 ? "warn" : undefined,
        },
        {
          label: "Last refresh",
          value: summary.lastRefresh,
        },
      ]}/>
      <RefreshImportGrid/>
    </Page>
  );
}
