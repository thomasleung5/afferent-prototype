import { Btn, Icon } from "@/components/ui";

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
          FY 2026-27 Annual Cost Recovery Update
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6, marginBottom: 18 }}>
          Town of Los Altos Hills · Finance Department
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.7 }}>
          The FY 2026-27 update reuses the locked FY 2025-26 baseline model. Annual inputs were refreshed
          for budget, salary, FTE, CAP allocations, workload, and the current fee schedule. Across seven
          section reviews, 29 items were resolved and confirmed. Blended development services cost recovery
          declined from 72% to 64%, primarily driven by an 8.5% increase in Planning salary and benefits
          and a 6% decline in Building permit volume.
          <br/><br/>
          Staff recommends Council adopt the recommended fees in Appendix A. Fees are calculated at the
          maximum cost-based amount; Council may adopt a lower fee for policy reasons. Costs associated
          with broad public benefit or policy work have been excluded where appropriate.
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 8, fontFamily: "var(--ff-ui)" }}>
          <Btn kind="ghost">Fee schedule</Btn>
          <Btn kind="ghost">Public Q&A</Btn>
          <Btn kind="ghost">Methodology</Btn>
        </div>
      </div>
    </div>
  );
}
