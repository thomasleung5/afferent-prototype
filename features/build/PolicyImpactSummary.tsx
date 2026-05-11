
import { fmt } from "@/lib/format";
import { useBuildState } from "@/lib/store";

function Stat({ label, value, sub, divider }: { label: string; value: string; sub: string; divider?: boolean }) {
  return (
    <div style={{
      padding: "20px 22px",
      borderRight: divider ? "1px solid var(--rule)" : "none",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div className="mono" style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em",
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>{label}</div>
      <div className="num display" style={{
        fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)",
        lineHeight: 1.1,
      }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

export function PolicyImpactSummary() {
  const { derived } = useBuildState();
  const impact = derived.impact;
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)",
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
    }}>
      <Stat
        label="Estimated overall recovery"
        value={`${Math.round(impact.overallPct)}%`}
        sub="Weighted across PLAN · BLDG · ENG"
        divider
      />
      <Stat
        label="Estimated annual subsidy"
        value={fmt.dollarsK(impact.subsidy)}
        sub="Cost not recovered through fees"
        divider
      />
      <Stat
        label="Recoverable revenue gap"
        value={fmt.dollarsK(impact.recoverableGap)}
        sub="At current targets vs. today's revenue"
      />
    </div>
  );
}
