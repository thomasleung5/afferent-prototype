"use client";

import { Page, PageHeader } from "@/components/layout";
import { ExportMenu, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { RateDerivation } from "@/features/build/RateDerivation";
import { CostOfServiceTable } from "@/features/build/CostOfServiceTable";
import { TraceabilityFooter } from "@/features/build/TraceabilityFooter";
import { useBuildState } from "@/features/build/BuildContext";
import { useExport } from "@/features/build/useExport";

export default function CostOfServicePage() {
  const { services, derived } = useBuildState();
  const { downloadExcel, openPdf } = useExport();
  const totalAnnual = derived.costs.reduce((a, c) => a + c.annualCost, 0);
  const totalRevenue = derived.costs.reduce((a, c) => a + c.annualRevenue, 0);
  const recoveryPct = totalAnnual > 0 ? (totalRevenue / totalAnnual) * 100 : 0;
  const gap = Math.max(0, totalAnnual - totalRevenue);

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="costs"/>}
        title="Cost of Service"
        subtitle="Direct + Operating + CAP applied to hours × volume. The convergence of every upstream input."
        actions={<ExportMenu onDownloadExcel={downloadExcel} onOpenPdf={openPdf}/>}
      />

      <StatusRow items={[
        `${services.length} services`,
        `Total cost ${fmt.dollarsK(totalAnnual)}/yr`,
        `Current revenue ${fmt.dollarsK(totalRevenue)}/yr`,
        { value: `Recovery ${recoveryPct.toFixed(0)}%`, tone: recoveryPct >= 80 ? "pos" : recoveryPct >= 50 ? "warn" : "neg" },
        { value: `Gap ${fmt.dollarsK(gap)}/yr`, tone: "neg" },
      ]}/>

      <RateDerivation/>

      <CostOfServiceTable/>

      <TraceabilityFooter/>
    </Page>
  );
}
