
import { Page, PageHeader } from "@/components/layout";
import { NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { RateDerivation } from "@/features/build/RateDerivation";
import { CostOfServiceTable } from "@/features/build/CostOfServiceTable";
import { useBuildState } from "@/lib/store";

export default function CostOfServicePage() {
  const { services, derived } = useBuildState();
  const totalAnnual = derived.costs.reduce((a, c) => a + c.annualCost, 0);
  const totalRevenue = derived.costs.reduce((a, c) => a + c.annualRevenue, 0);
  const recoveryPct = totalAnnual > 0 ? (totalRevenue / totalAnnual) * 100 : 0;
  const gap = Math.max(0, totalAnnual - totalRevenue);

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="costs"/>}
        title="Cost of Service"
        subtitle="Labor + Operating + Overhead Costs applied to hours"
      />

      <StatusRow items={[
        { label: "Services",        value: `${services.length}` },
        { label: "Total cost",      value: `${fmt.dollarsK(totalAnnual)}/yr` },
        { label: "Current revenue", value: `${fmt.dollarsK(totalRevenue)}/yr` },
        { label: "Current recovery", value: `${recoveryPct.toFixed(0)}%`, tone: recoveryPct >= 80 ? "pos" : recoveryPct >= 50 ? "warn" : "neg" },
        { label: "Total gap",       value: `${fmt.dollarsK(gap)}/yr`, tone: "neg" },
      ]}/>

      <RateDerivation/>

      <CostOfServiceTable/>
    </Page>
  );
}
