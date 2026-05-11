"use client";

import { KpiTile } from "@/components/ui";
import { fmt } from "@/lib/format";
import { useBuildState } from "./BuildContext";

const INDIRECT_DEPTS = [
  "City Council",
  "City Manager",
  "City Clerk",
  "Finance & Administrative Services",
  "City Attorney",
  "Insurance",
  "Committees",
];

export function CapKpiRail() {
  const { capAllocation, capPools } = useBuildState();
  const totalAllocated =
    capAllocation.PLAN.allocated + capAllocation.BLDG.allocated + capAllocation.ENG.allocated;
  const reviewCount = capPools.filter((p) => p.review === "Review").length;
  const poolTotal = capPools.reduce((a, p) => a + p.amount, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      <KpiTile
        label="Total CAP scope"
        value={fmt.dollarsK(poolTotal)}
        sub={`${capPools.length} cost pools`}
        source="CAP Allocation Inventory"
      />
      <KpiTile
        label="Indirect departments"
        value={INDIRECT_DEPTS.length}
        sub="Allocate FROM these"
      />
      <KpiTile
        label="Direct departments"
        value={3}
        sub="Allocate TO these"
      />
      <KpiTile
        label="Allocated to fee depts"
        value={fmt.dollarsK(totalAllocated)}
        sub={`${poolTotal > 0 ? Math.round((totalAllocated / poolTotal) * 100) : 0}% of CAP scope`}
        tone={reviewCount === 0 ? "pos" : "warn"}
      />
    </div>
  );
}

/** Step-down sequence panel showing the order indirect centers close out. */
export function StepDownSequence() {
  const sequence = [
    "City Council",
    "City Manager",
    "City Attorney",
    "Insurance",
    "City Clerk",
    "Finance & Administrative Services",
    "Committees",
  ];

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
      <div style={{
        display: "flex", alignItems: "center",
        padding: "12px 18px", borderBottom: "1px solid var(--rule)",
        background: "var(--paper-2)",
      }}>
        <div>
          <div className="display" style={{ fontSize: 13.5, fontWeight: 600 }}>
            Step-down sequence
          </div>
          <div style={{
            fontSize: 11.5, color: "var(--ink-3)", marginTop: 2,
            lineHeight: 1.4, maxWidth: 720,
          }}>
            Order indirect depts close out. When dept N steps down, its current balance is pushed
            to depts N+1…end + all directs. Convention: list broadest-service providers first.
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        {sequence.map((name, i) => (
          <div key={name} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px",
            borderBottom: i < sequence.length - (sequence.length % 3 || 3) ? "1px solid var(--rule)" : "none",
            borderRight: (i + 1) % 3 !== 0 ? "1px solid var(--rule)" : "none",
          }}>
            <div className="mono" style={{
              fontSize: 11, fontWeight: 700,
              padding: "3px 8px", minWidth: 30, textAlign: "center",
              background: "var(--ink)", color: "var(--paper)",
            }}>{(i + 1).toString().padStart(2, "0")}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 500,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
