import { Page, PageHeader } from "@/components/layout";
import { RefreshImportGrid } from "@/features/annual/RefreshImportGrid";
import { StatusRow } from "@/features/_shared/StatusRow";
import { useBuildState } from "@/lib/store";
import { deriveRefreshSummary } from "@/lib/data/annual";

export default function SourceDataPage() {
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
        title="Source Data"
        subtitle="Upload and manage model inputs."
      />
      <StatusRow items={[
        {
          label: "Sources connected",
          value: `${summary.inputsRefreshed} of ${summary.totalInputs} required`,
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
