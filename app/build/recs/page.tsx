"use client";

import { Page, PageHeader } from "@/components/layout";
import { ExportMenu, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { RecommendationsTable } from "@/features/build/RecommendationsTable";
import { useBuildState } from "@/features/build/BuildContext";
import { useExport } from "@/features/build/useExport";

export default function RecommendationsPage() {
  const { derived } = useBuildState();
  const { downloadExcel, openPdf } = useExport();
  const totalUplift = derived.comparisons.reduce((a, c) => a + Math.max(0, c.annualUplift), 0);
  const highPriority = derived.comparisons.filter((c) => c.annualUplift > 25000).length;
  const lowConfidence = derived.comparisons.filter(
    (c) => c.volume === 0 || c.hours === 0 || c.recoveryPct > 200,
  ).length;
  const ready = derived.comparisons.filter((c) => c.annualUplift > 0).length;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="recs"/>}
        title="Recommendations"
        subtitle="Ranked fee changes. Output of the rate-build-up + policy targets — ready for Council review."
        actions={<ExportMenu onDownloadExcel={downloadExcel} onOpenPdf={openPdf}/>}
      />

      <StatusRow items={[
        `${ready} recommendations`,
        `${highPriority} high priority`,
        { value: `+${fmt.dollarsK(totalUplift)}/yr potential uplift`, tone: "pos" },
        { value: lowConfidence === 0 ? "All defensible" : `${lowConfidence} low confidence`, tone: lowConfidence === 0 ? "pos" : "warn" },
        "FY 2026-27",
      ]}/>

      <RecommendationsTable/>
    </Page>
  );
}
