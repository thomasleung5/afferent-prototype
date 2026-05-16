
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow, SectionLabel } from "@/components/ui";
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
        subtitle="Define subsidy strategy and target cost recovery across departments and fee categories."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        { label: "Departments",         value: `${policyTargets.length}` },
        { label: "Fee exceptions",      value: `${policyExceptions.length}` },
        { label: "Overall recovery",    value: `${Math.round(impact.overallPct)}%` },
        { label: "Annual subsidy",      value: fmt.dollarsK(impact.subsidy) },
        { label: "Recoverable revenue", value: fmt.dollarsK(impact.recoverableGap) },
      ]}/>

      <div style={{ paddingTop: 8 }}>
        <SectionLabel right={`${policyTargets.length} departments`}>
          Department targets
        </SectionLabel>
        <DepartmentTargets/>
      </div>

      <div style={{ paddingTop: 8 }}>
        <SectionLabel right={`${policyExceptions.length} exceptions`}>
          Fee exceptions
        </SectionLabel>
        <PolicyExceptions/>
      </div>
    </Page>
  );
}
