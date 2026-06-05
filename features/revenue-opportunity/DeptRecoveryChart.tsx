import { DEPTS } from "@/lib/data/departments";
import { RecoveryMeter } from "@/components/ui";
import { fmt } from "@/lib/format";
import { useBuildState } from "@/lib/store";

export function DeptRecoveryChart() {
  const { derived } = useBuildState();
  const rollup = derived.deptRollup;

  // Only render depts modeled in the active jurisdiction — same convention
  // used by every other dept-rollup view.
  const activeDepts = derived.activeFeeDepts.filter((code) => rollup[code].totalCost > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {activeDepts.map((code) => {
        const dept = DEPTS[code];
        const r = rollup[code];
        return (
          <div key={code} style={{
            display: "grid", gridTemplateColumns: "150px 1fr 110px",
            gap: 12, alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: "var(--fs-ui)", fontWeight: 500, color: "var(--ink)" }}>{dept.name.replace(" Administration", "")}</div>
              <div className="mono" style={{ fontSize: "var(--t-l4)", color: "var(--ink-3)" }}>{code}</div>
            </div>
            <RecoveryMeter pct={r.recoveryPct} width={240}/>
            <div className="num" style={{
              fontSize: 12, color: "var(--ink-3)", textAlign: "right",
            }}>
              {fmt.dollarsK(r.currentRev)} / {fmt.dollarsK(r.totalCost)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
