"use client";

import Link from "next/link";
import { fmt } from "@/lib/format";
import { useBuildState } from "./BuildContext";

/** Three buckets shown on the Operating screen: dollars flowing into $/hr,
 *  excluded lines kept for audit, and a reminder that citywide indirect
 *  belongs in CAP — not here. */
export function OperatingBuckets() {
  const { operating } = useBuildState();
  const included = operating.filter((l) => l.include);
  const excluded = operating.filter((l) => !l.include);
  const includedTotal = included.reduce((a, l) => a + l.amount, 0);
  const excludedTotal = excluded.reduce((a, l) => a + l.amount, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      {/* Included */}
      <div style={{
        background: "var(--paper)", border: "1px solid var(--rule)",
        borderTop: "3px solid var(--pos)",
        padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 10, height: 10, background: "var(--pos)" }}/>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            color: "var(--ink-2)", textTransform: "uppercase",
          }}>Included in $/hr</div>
        </div>
        <div className="num" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>
          {fmt.dollarsK(includedTotal)}
          <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>
            · {included.length} lines
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Department-direct non-labor — software licenses, contracts, training, supplies, vehicles.
          Flows into Operating $/hr.
        </div>
      </div>

      {/* Excluded */}
      <div style={{
        background: "var(--paper-2)", border: "1px solid var(--rule)",
        borderTop: "3px solid var(--ink-3)",
        padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 10, height: 10, border: "1px dashed var(--ink-3)" }}/>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            color: "var(--ink-2)", textTransform: "uppercase",
          }}>Excluded (audit)</div>
        </div>
        <div className="num" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink-3)" }}>
          {fmt.dollarsK(excludedTotal)}
          <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>
            · {excluded.length} lines
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Visible for audit but not in the rate — one-time items, capital outlay, pass-throughs, or items intentionally subsidized.
        </div>
      </div>

      {/* Belongs in CAP */}
      <div style={{
        background: "var(--paper)", border: "1px dashed var(--rule-strong)",
        padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 10, height: 10, border: "1px dashed var(--ink-4)" }}/>
          <div className="mono" style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            color: "var(--ink-3)", textTransform: "uppercase",
          }}>Belongs in CAP — not here</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
          IT, HR, Finance, Town Manager, Council, City Attorney, GIS, Building Maintenance.
          Citywide or shared services that benefit multiple departments. Enter these as cost pools in the CAP node.
        </div>
        <Link
          href="/build/cap"
          style={{
            alignSelf: "flex-start", marginTop: 2,
            fontSize: 11.5, color: "var(--accent)", fontWeight: 500,
            textDecoration: "none",
          }}
        >Open Cost Allocation →</Link>
      </div>
    </div>
  );
}
