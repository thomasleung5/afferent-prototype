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
    positions: state.positions,
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
        title="Annual Data Refresh"
        subtitle="Refresh current-year staffing, operating, volume of activity, fee schedule, and CAP inputs."
      />
      <StatusRow items={[
        {
          label: "Rows imported",
          value: summary.hasImports ? summary.totalRows.toLocaleString() : "—",
        },
        {
          label: "Inputs refreshed",
          value: `${summary.inputsRefreshed} / ${summary.totalInputs}`,
        },
        {
          label: "Auto-mapped",
          value: summary.hasImports ? `${summary.autoPct}%` : "—",
          tone: summary.hasImports && summary.autoPct >= 90 ? "pos" : undefined,
        },
        {
          label: "Need review",
          value: summary.hasImports ? String(summary.totalReview) : "—",
          tone: summary.totalReview > 0 ? "warn" : undefined,
        },
        {
          label: "Confidence",
          value: summary.hasImports ? summary.confidence : "Seed",
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
