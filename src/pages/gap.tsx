import { Page } from "@/components/layout";
import { Btn, Icon, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { CITYWIDE, DEPT_ROLLUPS } from "@/lib/data/citywide";
import { SERVICES } from "@/lib/data/services";
import { AnswerHeader } from "@/features/revenue-gap/AnswerHeader";
import { DriverBreakdown } from "@/features/revenue-gap/DriverBreakdown";
import { DeptRecoveryChart } from "@/features/revenue-gap/DeptRecoveryChart";
import { TopFixesTable } from "@/features/revenue-gap/TopFixesTable";

export default function RevenueGapPage() {
  const annualGap = Math.max(0, CITYWIDE.eligibleCost - CITYWIDE.currentRevenue);
  const fullGap = Math.max(0, CITYWIDE.fullCostRevenue - CITYWIDE.currentRevenue);
  const recoveryPct = CITYWIDE.recovery;
  const missingVolume = SERVICES.filter((s) => !s.volume).length;
  const missingHours = SERVICES.filter((s) => !s.hours).length;
  const dataCompleteness = Math.round(
    (1 - (missingVolume + missingHours) / Math.max(1, SERVICES.length * 2)) * 100,
  );

  // Driver totals derived from the rollups (rough split mirrors the original calc-engine).
  const totalCost = Object.values(DEPT_ROLLUPS).reduce((a, r) => a + r.totalCost, 0);
  const direct    = totalCost * 0.33;
  const operating = totalCost * 0.25;
  const cap       = totalCost * 0.42;

  return (
    <Page>
      {/* ANSWER */}
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        padding: "28px 32px",
      }}>
        <AnswerHeader
          question="How much revenue is being left on the table?"
          answer={`${fmt.dollarsK(annualGap)}/yr`}
          tone="neg"
          sub="Cost of fee-supported services minus revenue collected. Closing it takes policy decisions, not just rate updates."
          stats={[
            {
              label: "Recovery rate",
              value: `${recoveryPct.toFixed(0)}%`,
              tone: recoveryPct < 60 ? "neg" : recoveryPct < 80 ? "warn" : "pos",
              sub: `${fmt.dollarsK(CITYWIDE.currentRevenue)} of ${fmt.dollarsK(totalCost)}`,
            },
            {
              label: "Uplift at policy",
              value: `${fmt.dollarsK(fullGap)}/yr`,
              tone: "pos",
              sub: "if Council adopts targets",
            },
            {
              label: "Data complete",
              value: `${dataCompleteness}%`,
              tone: dataCompleteness >= 90 ? "pos" : dataCompleteness >= 75 ? "warn" : "neg",
              sub: `${missingVolume + missingHours} cells missing`,
            },
          ]}
          actions={
            <>
              <Btn kind="ghost"><Icon name="download" size={13}/> Export brief</Btn>
              <Btn kind="primary" href="/build/feestudy">
                Open fee schedule <Icon name="arrow-right" size={13}/>
              </Btn>
            </>
          }
        />
      </div>

      {/* DRIVERS + DEPT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)", padding: 22,
        }}>
          <SectionLabel>Where the gap comes from</SectionLabel>
          <DriverBreakdown direct={direct} operating={operating} cap={cap}/>
        </div>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--rule)", padding: 22,
        }}>
          <SectionLabel>Recovery by department</SectionLabel>
          <DeptRecoveryChart/>
        </div>
      </div>

      {/* TOP FIXES */}
      <TopFixesTable/>
    </Page>
  );
}
