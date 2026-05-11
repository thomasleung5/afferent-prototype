
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { PolicySection } from "@/features/build/PolicySection";
import { DepartmentTargets } from "@/features/build/DepartmentTargets";
import { PolicyExceptions } from "@/features/build/PolicyExceptions";
import { PolicyImpactSummary } from "@/features/build/PolicyImpactSummary";
import { useBuildState } from "@/lib/store";

export default function RecoveryPolicyPage() {
  const { policyTargets, policyExceptions, derived } = useBuildState();
  const impact = derived.impact;

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="policy"/>}
        title="Recovery Policy"
        subtitle="Recovery targets by department and fee category."
        actions={<Btn kind="ghost"><Icon name="download" size={13}/> Export</Btn>}
      />

      <StatusRow items={[
        `${policyTargets.length} departments`,
        `${policyExceptions.length} fee exception${policyExceptions.length === 1 ? "" : "s"}`,
        { value: `${Math.round(impact.overallPct)}% intended recovery`, tone: impact.overallPct >= 80 ? "pos" : "warn" },
        `${fmt.dollarsK(impact.subsidy)} annual subsidy`,
        "FY 2026-27",
      ]}/>

      <PolicySection
        eyebrow="Section 1"
        title="Department targets"
        description="The intended share of each department's full cost to recover through fees. Anything below 100% is funded by other sources (typically the General Fund)."
      >
        <DepartmentTargets/>
      </PolicySection>

      <PolicySection
        eyebrow="Section 2"
        title="Fee exceptions"
        description="Override department-level targets for specific fees when required by policy. Match the fee name exactly — case-insensitive."
      >
        <PolicyExceptions/>
      </PolicySection>

      <PolicySection
        eyebrow="Section 3"
        title="Policy impact summary"
        description="What these targets imply for the FY 2026-27 budget. Updates as you edit targets above or fees in the Fee Schedule."
      >
        <PolicyImpactSummary/>
      </PolicySection>
    </Page>
  );
}
