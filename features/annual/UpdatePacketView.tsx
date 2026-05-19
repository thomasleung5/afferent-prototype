import { Btn, Icon } from "@/components/ui";
import { fmt } from "@/lib/format";
import { CITY } from "@/lib/data/city";
import { useBuildState } from "@/lib/store";
import { derivePacketSummary } from "@/lib/data/annual";

const PACKET_SECTIONS = [
  "Executive summary",
  "What changed from last year",
  "Section-by-section review log",
  "Assumptions reused",
  "Assumptions modified",
  "Recovery % delta",
  "Recovery drift delta",
  "Top cost drivers",
  "Top fee schedule impacts",
  "Confidence levels",
  "Items requiring legal or Council review",
];

export function UpdatePacketView() {
  const state = useBuildState();
  const summary = derivePacketSummary({
    imports: state.imports,
    positions: state.positions,
    operating: state.operating,
    workload: state.workload,
    services: state.services,
    capPools: state.capPools,
    comparisons: state.derived.comparisons,
    impact: state.derived.impact,
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "flex-start" }}>
      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 22 }}>
        <div className="mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 14 }}>
          Packet sections
        </div>
        {PACKET_SECTIONS.map((s, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "24px 1fr auto",
            gap: 12, padding: "10px 0",
            borderBottom: i < PACKET_SECTIONS.length - 1 ? "1px dashed var(--rule)" : "none",
            alignItems: "center",
          }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div style={{ fontSize: 13 }}>{s}</div>
            <Icon name="check" size={12} color="var(--pos)"/>
          </div>
        ))}
      </div>

      <div style={{ background: "oklch(98% 0.005 75)", border: "1px solid var(--rule)", padding: 28, fontFamily: "Georgia, serif" }}>
        <div className="mono" style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 14,
          fontFamily: "var(--ff-mono)",
        }}>
          Preview · Annual Fee Update
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--ink)" }}>
          {CITY.fiscal} Annual Cost Recovery Update
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6, marginBottom: 18 }}>
          {CITY.name} · {CITY.preparedBy.split(" · ")[0]}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.7 }}>
          {buildNarrative(summary)}
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 8, fontFamily: "var(--ff-ui)" }}>
          <Btn kind="ghost" href="/build/feestudy">Fee schedule</Btn>
          <Btn kind="ghost" href="/gap">Public Q&amp;A</Btn>
          <Btn kind="ghost">Methodology</Btn>
        </div>
      </div>
    </div>
  );
}

function buildNarrative(s: ReturnType<typeof derivePacketSummary>): string {
  const intro = s.totalImports > 0
    ? `The ${CITY.fiscal} update reuses the locked baseline model and incorporates `
      + `${s.totalImports} data import${s.totalImports === 1 ? "" : "s"} across `
      + `${s.domainsRefreshed} of 6 model section${s.domainsRefreshed === 1 ? "" : "s"} `
      + `(last refresh ${s.lastRefresh}). `
    : `The ${CITY.fiscal} update reuses the locked baseline model. No source files have `
      + `been refreshed since the last build — the figures below reflect the seed baseline. `;

  const recovery = `Blended development services cost recovery stands at `
    + `${s.currentRecovery}% against a weighted policy target of ${s.policyTarget}%, `
    + `leaving a closeable recovery gap of ${fmt.dollarsK(s.recoverableGap)}/yr. `
    + `${s.feesBelowTarget} of ${s.totalFees} fee${s.totalFees === 1 ? "" : "s"} are below target. `;

  const drivers = [
    s.topCostDriver
      ? `The largest cost driver is ${s.topCostDriver.name} at ${fmt.dollarsK(s.topCostDriver.cost)}/yr.`
      : "",
    s.topFeeOpportunity
      ? `The largest single fee opportunity is ${s.topFeeOpportunity.name} `
        + `(${fmt.dollarsK(s.topFeeOpportunity.uplift)}/yr in annual uplift if adopted at target).`
      : "",
  ].filter(Boolean).join(" ");

  const close = " Staff recommends Council adopt the recommended fees in Appendix A. "
    + "Fees are calculated at the maximum cost-based amount; Council may adopt a lower fee "
    + "for policy reasons. Costs associated with broad public benefit or policy work have been "
    + "excluded where appropriate.";

  return intro + recovery + drivers + close;
}
