import { useCallback } from "react";
import { Page } from "@/components/layout";
import { Btn, Icon, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { useActiveJurisdiction } from "@/lib/active";
import { useBuildState } from "@/lib/store";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { slugCity } from "@/lib/printing";
import { deptName, FEE_DEPTS } from "@/lib/data/departments";
import { AnswerHeader } from "@/features/revenue-gap/AnswerHeader";
import { DriverBreakdown } from "@/features/revenue-gap/DriverBreakdown";
import { DeptRecoveryChart } from "@/features/revenue-gap/DeptRecoveryChart";
import { TopFixesTable } from "@/features/revenue-gap/TopFixesTable";

export default function RevenueGapPage() {
  const { derived, policyTargets } = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const { impact, fbhr, costs, comparisons, deptRollup } = derived;

  // Primary revenue gap: target (policy-intended) − current revenue. Clamped
  // for the headline tone — a negative gap means current revenue already
  // exceeds policy intent, so there's nothing to close.
  const annualGap = Math.max(0, impact.recoverableGap);
  const totalCost = impact.totalCost;

  // Action-oriented headline stats: where is recovery falling short?
  // Filter to recoverable rows so the count is consistent with the
  // headline annualGap math (policyImpact also filters on c.recoverable).
  const recoverableComparisons = comparisons.filter((c) => c.recoverable);
  const feesBelowTarget = recoverableComparisons.filter((c) => c.recoveryPct < c.target).length;
  const totalFees = recoverableComparisons.length;
  const deptsBelowPolicy = FEE_DEPTS.reduce((count, d) => {
    const r = deptRollup[d];
    if (!r || r.totalCost <= 0) return count;
    const target = policyTargets.find((t) => t.dept === d)?.target ?? 100;
    return r.recoveryPct < target ? count + 1 : count;
  }, 0);
  const activeFeeDepts = FEE_DEPTS.filter((d) => (deptRollup[d]?.totalCost ?? 0) > 0).length;
  const topOpportunity = FEE_DEPTS
    .map((d) => ({ dept: d, subsidy: deptRollup[d]?.subsidy ?? 0 }))
    .filter((x) => x.subsidy > 0)
    .sort((a, b) => b.subsidy - a.subsidy)[0];

  // Driver split — decompose each service's annual cost into its three FBHR
  // components (direct labor / operating / CAP) using the per-dept rate
  // parts. Sums to impact.totalCost.
  const drivers = costs.reduce(
    (acc, c) => {
      const r = fbhr[c.dept];
      if (!r) return acc;
      const hrs = c.hours * c.volume;
      acc.direct    += hrs * r.directRate;
      acc.operating += hrs * r.operatingRate;
      acc.cap       += hrs * r.capRate;
      return acc;
    },
    { direct: 0, operating: 0, cap: 0 },
  );

  const exportBrief = useCallback(() => {
    // Top fixes: services where adopting the recommended fee would close
    // the biggest single-row revenue gap. Sort by absolute annual uplift.
    const topFixes = [...comparisons]
      .filter((c) => Math.abs(c.annualUplift) >= 1)
      .sort((a, b) => Math.abs(b.annualUplift) - Math.abs(a.annualUplift))
      .slice(0, 20);
    const csv = buildCsv([
      ["Section", "Metric", "Value"],
      ["Headline", "Annual gap", fmt.dollars(annualGap)],
      ["Headline", "Current revenue", fmt.dollars(impact.currentRevenue)],
      ["Headline", "Total cost", fmt.dollars(totalCost)],
      ["Headline", "Fees below target", `${feesBelowTarget} of ${totalFees}`],
      ["Headline", "Departments below policy", `${deptsBelowPolicy} of ${activeFeeDepts}`],
      ["Headline", "Top opportunity department",
        topOpportunity ? `${deptName(topOpportunity.dept)} · ${fmt.dollars(topOpportunity.subsidy)}/yr` : "—"],
      null,
      ["Drivers", "Direct labor", fmt.dollars(drivers.direct)],
      ["Drivers", "Operating", fmt.dollars(drivers.operating)],
      ["Drivers", "Overhead Cost Allocation", fmt.dollars(drivers.cap)],
      null,
      ["Top fixes", "Fee Item", "Dept · Current → Recommended · Annual uplift"],
      ...topFixes.map((c) => [
        "Top fixes",
        c.name,
        `${c.dept} · ${fmt.dollars(c.fee)} → ${fmt.dollars(c.recommended)} · ${c.annualUplift >= 0 ? "+" : ""}${fmt.dollars(c.annualUplift)}/yr`,
      ]),
    ]);
    downloadCsv(csv, `${slugCity(jurisdiction.name)}-revenue-opportunity-brief.csv`);
  }, [annualGap, impact.currentRevenue, totalCost, feesBelowTarget, totalFees, deptsBelowPolicy, activeFeeDepts, topOpportunity, drivers, comparisons, jurisdiction.name]);

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
              label: "Fees below target",
              value: `${feesBelowTarget}`,
              tone: feesBelowTarget === 0 ? "pos" : "warn",
              sub: `of ${totalFees} fees`,
            },
            {
              label: "Departments below policy",
              value: `${deptsBelowPolicy}`,
              tone: deptsBelowPolicy === 0 ? "pos" : "warn",
              sub: `of ${activeFeeDepts} fee departments`,
            },
            {
              label: "Top opportunity department",
              value: topOpportunity ? deptName(topOpportunity.dept) : "—",
              tone: "info",
              sub: topOpportunity ? `${fmt.dollarsK(topOpportunity.subsidy)}/yr to close` : "no gap to close",
            },
          ]}
          actions={
            <>
              <Btn kind="ghost" onClick={exportBrief}><Icon name="download" size={13}/> Export brief</Btn>
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
          <DriverBreakdown direct={drivers.direct} operating={drivers.operating} cap={drivers.cap}/>
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
