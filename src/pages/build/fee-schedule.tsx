import { Page, PageHeader } from "@/components/layout";
import { Btn, ExportMenu, Icon, NodeEyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { StatusRow } from "@/features/_shared/StatusRow";
import { FeeScheduleTable } from "@/features/build/FeeScheduleTable";
import { useBuildState } from "@/lib/store";
import { useExport } from "@/features/build/useExport";

export default function FeeSchedulePage() {
  const { derived } = useBuildState();
  const { downloadExcel, pdfHref } = useExport();
  const comparisons = derived.comparisons;

  // Net adoption impact: full-precision sum (recommended − fee) × volume across
  // recoverable fee rows, NOT clamped. Reconciles exactly with Recovery
  // Policy's Recoverable Revenue — both derive from the same
  // calculatedRecommendedFee and skip display-only/non-recoverable rows.
  const recoverableComparisons = comparisons.filter((c) => c.recoverable);
  const netAdoptionImpact = recoverableComparisons.reduce((a, c) => a + c.annualUplift, 0);
  const belowTarget = recoverableComparisons.filter((c) => c.recoveryPct < c.target).length;
  const atTarget = recoverableComparisons.filter((c) => Math.abs(c.recommended - c.fee) < 1).length;
  const revenueNow = recoverableComparisons.reduce((a, c) => a + c.annualRevenue, 0);
  // Target Revenue: sum of full-precision recommended × volume. NEVER use
  // c.recommended (rounded for display) — rounding drift breaks reconciliation.
  const targetRevenue = recoverableComparisons.reduce((a, c) => a + c.calculatedRecommendedFee * c.volume, 0);

  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="feeSchedule"/>}
        title="Fee Schedule"
        subtitle="Current fees versus calculated costs."
        actions={
          <>
            <Btn kind="ghost" href="/source-data#fees">
              <Icon name="arrow-up-to-line" size={13}/> Import Data
            </Btn>
            <ExportMenu onDownloadExcel={downloadExcel} pdfHref={pdfHref}/>
          </>
        }
      />

      <StatusRow items={[
        { label: "Fees",                value: `${comparisons.length}` },
        { label: "At target",           value: `${atTarget}` },
        { label: "Below target",        value: `${belowTarget}` },
        { label: "Current fee revenue",         value: `${fmt.dollarsK(revenueNow)}/yr` },
        { label: "Revenue at recommended fees", value: `${fmt.dollarsK(targetRevenue)}/yr` },
        { label: "Additional annual revenue",   value: `${netAdoptionImpact >= 0 ? "+" : ""}${fmt.dollarsK(netAdoptionImpact)}/yr`, tone: netAdoptionImpact >= 0 ? "pos" : "neg" },
      ]}/>

      <FeeScheduleTable/>
    </Page>
  );
}
