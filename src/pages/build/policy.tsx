
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
  const currentRecoveryPct = impact.totalCost > 0
    ? (impact.currentRevenue / impact.totalCost) * 100
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="policy"/>}
        title="Recovery Policy"
        subtitle="Target cost recovery levels."
      />

      <StatusRow items={[
        { label: "Departments",      value: `${policyTargets.length}` },
        { label: "Fee exceptions",   value: `${policyExceptions.length}` },
        { label: "Current recovery", value: `${Math.round(currentRecoveryPct)}%` },
        { label: "Target recovery",  value: `${Math.round(impact.overallPct)}%` },
        {
          label: "Policy subsidy",
          value: `${fmt.dollarsK(impact.subsidy)}/yr`,
          tooltip: "Annual cost intentionally funded by the General Fund.",
        },
        {
          label: "Revenue at policy",
          value: `${fmt.dollarsK(impact.intendedRevenue)}/yr`,
          tooltip: "Annual revenue generated under current recovery targets.",
        },
      ]}/>

      <DepartmentTargets/>
      <PolicyExceptions/>
    </Page>
  );
}
