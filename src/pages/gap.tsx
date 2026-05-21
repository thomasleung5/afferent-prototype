import { useCallback } from "react";
import { Page } from "@/components/layout";
import { Btn, Icon, SectionLabel } from "@/components/ui";
import { fmt } from "@/lib/format";
import { CITY } from "@/lib/data/city";
import { useBuildState } from "@/lib/store";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { AnswerHeader } from "@/features/revenue-gap/AnswerHeader";
import { DriverBreakdown } from "@/features/revenue-gap/DriverBreakdown";
import { DeptRecoveryChart } from "@/features/revenue-gap/DeptRecoveryChart";
import { TopFixesTable } from "@/features/revenue-gap/TopFixesTable";

export default function RevenueGapPage() {
  const { derived, services } = useBuildState();
  const { impact, fbhr, costs, comparisons } = derived;

  // Primary revenue gap: target (policy-intended) − current revenue. Clamped
  // for the headline tone — a negative gap means current revenue already
  // exceeds policy intent, so there's nothing to close.
  const annualGap = Math.max(0, impact.recoverableGap);
  const totalCost = impact.totalCost;
  const recoveryPct = totalCost > 0 ? (impact.currentRevenue / totalCost) * 100 : 0;

  const missingVolume = services.filter((s) => !s.volume).length;
  const missingHours  = services.filter((s) => !s.hours).length;
  const dataCompleteness = Math.round(
    (1 - (missingVolume + missingHours) / Math.max(1, services.length * 2)) * 100,
  );

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
      ["Headline", "Recovery rate", `${recoveryPct.toFixed(1)}%`],
      ["Headline", "Current revenue", fmt.dollars(impact.currentRevenue)],
      ["Headline", "Total cost", fmt.dollars(totalCost)],
      ["Headline", "Data completeness", `${dataCompleteness}%`],
      ["Headline", "Missing cells", String(missingVolume + missingHours)],
      null,
      ["Drivers", "Direct labor", fmt.dollars(drivers.direct)],
      ["Drivers", "Operating", fmt.dollars(drivers.operating)],
      ["Drivers", "Overhead Cost Allocation", fmt.dollars(drivers.cap)],
      null,
      ["Top fixes", "Service", "Dept · Current → Recommended · Annual uplift"],
      ...topFixes.map((c) => [
        "Top fixes",
        c.name,
        `${c.dept} · ${fmt.dollars(c.fee)} → ${fmt.dollars(c.recommended)} · ${c.annualUplift >= 0 ? "+" : ""}${fmt.dollars(c.annualUplift)}/yr`,
      ]),
    ]);
    const slug = CITY.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    downloadCsv(csv, `${slug}-revenue-gap-brief.csv`);
  }, [annualGap, recoveryPct, impact.currentRevenue, totalCost, dataCompleteness, missingVolume, missingHours, drivers, comparisons]);

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
              sub: `${fmt.dollarsK(impact.currentRevenue)} of ${fmt.dollarsK(totalCost)}`,
            },
            {
              label: "Uplift at policy",
              value: `${fmt.dollarsK(annualGap)}/yr`,
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
