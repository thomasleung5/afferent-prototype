
import { Page, PageHeader } from "@/components/layout";
import { NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { DepartmentTargets } from "@/features/build/DepartmentTargets";
import { PolicyExceptions } from "@/features/build/PolicyExceptions";
import { useBuildState } from "@/lib/store";

export default function RecoveryPolicyPage() {
  const { policyTargets, policyExceptions, derived } = useBuildState();
  const impact = derived.impact;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="policy"/>}
        title="Recovery Policy"
        subtitle="Target cost recovery by department and category."
      />

      <StatusRow items={[
        { label: "Departments",         value: `${policyTargets.length}` },
        { label: "Fee exceptions",      value: `${policyExceptions.length}` },
        { label: "Target recovery",     value: `${Math.round(impact.overallPct)}%` },
        { label: "Policy subsidy",      value: `${fmt.dollarsK(impact.subsidy)}/yr` },
        { label: "Recoverable revenue", value: `${impact.recoverableGap >= 0 ? "" : "−"}${fmt.dollarsK(Math.abs(impact.recoverableGap))}/yr` },
        { label: "Total gap",           value: `${fmt.dollarsK(impact.totalCost - impact.currentRevenue)}/yr`, tone: "neg" },
      ]}/>

      <DepartmentTargets/>
      <PolicyExceptions/>
    </Page>
  );
}
