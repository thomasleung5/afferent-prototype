import type { DeptCode } from "@/lib/types";
import { DEPTS } from "@/lib/data/departments";
import { DEPT_ROLLUPS } from "@/lib/data/citywide";
import { RecoveryMeter } from "@/components/ui";
import { fmt } from "@/lib/format";

const ORDER: DeptCode[] = ["PLAN", "BLDG", "ENG"];

export function DeptRecoveryChart() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {ORDER.map((code) => {
        const dept = DEPTS[code];
        const r = DEPT_ROLLUPS[code];
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
