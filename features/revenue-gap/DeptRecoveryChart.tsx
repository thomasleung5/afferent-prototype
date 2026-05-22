import type { DeptCode } from "@/lib/types";
import { DEPTS, FEE_DEPTS } from "@/lib/data/departments";
import { RecoveryMeter } from "@/components/ui";
import { fmt } from "@/lib/format";
import { useBuildState } from "@/lib/store";

const ORDER: DeptCode[] = FEE_DEPTS;

interface Rollup {
  totalCost: number;
  currentRev: number;
  recovery: number;
}

export function DeptRecoveryChart() {
  const { derived } = useBuildState();

  // Per-dept rollup over the live cost-vs-revenue comparisons. Recovery is
  // currentRevenue / totalCost — mirrors the headline tile's denominator.
  const rollup = ORDER.reduce<Record<DeptCode, Rollup>>(
    (acc, code) => {
      acc[code] = { totalCost: 0, currentRev: 0, recovery: 0 };
      return acc;
    },
    {} as Record<DeptCode, Rollup>,
  );
  for (const c of derived.comparisons) {
    const row = rollup[c.dept];
    if (!row) continue;
    row.totalCost += c.annualCost;
    row.currentRev += c.annualRevenue;
  }
  for (const code of ORDER) {
    const r = rollup[code];
    r.recovery = r.totalCost > 0 ? (r.currentRev / r.totalCost) * 100 : 0;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {ORDER.filter((code) => rollup[code].totalCost > 0).map((code) => {
        const dept = DEPTS[code];
        const r = rollup[code];
        return (
          <div key={code} style={{
            display: "grid", gridTemplateColumns: "150px 1fr 110px",
            gap: 14, alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{dept.name.replace(" Administration", "")}</div>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{code}</div>
            </div>
            <RecoveryMeter pct={r.recovery} width={240}/>
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
