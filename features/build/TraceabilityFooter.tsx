
import { fmt } from "@/lib/format";
import { useBuildState } from "./BuildContext";
import { CAP_TOTAL } from "@/lib/data/cap";

/** Persistent footer on the Cost of Service page. Affirms that every number
 *  is traceable to source inputs and shows the conservation check. */
export function TraceabilityFooter() {
  const { services, derived, capAllocation } = useBuildState();
  const totalAnnual = derived.costs.reduce((a, c) => a + c.annualCost, 0);
  const totalAllocated =
    capAllocation.PLAN.allocated + capAllocation.BLDG.allocated + capAllocation.ENG.allocated;
  const unallocated = CAP_TOTAL - totalAllocated;
  const balanced = Math.abs(unallocated) < 1;

  return (
    <div style={{
      background: "var(--paper-2)", border: "1px solid var(--rule)",
      padding: "16px 20px",
      display: "grid",
      gridTemplateColumns: "minmax(220px, 1fr) repeat(3, auto)",
      gap: 24, alignItems: "center",
    }}>
      <div>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "var(--ink-2)", textTransform: "uppercase",
        }}>
          Every number is traceable to source inputs
        </div>
        <div style={{
          fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.5,
        }}>
          Fee → Service → FBHR → Cost allocation $ → Pools → Drivers → Salary &amp; Budget inputs.
        </div>
      </div>
      <div>
        <div className="mono" style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Services</div>
        <div className="num" style={{
          fontSize: 16, fontWeight: 600, fontFamily: "var(--ff-mono)",
        }}>{services.length}</div>
      </div>
      <div>
        <div className="mono" style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Annualized cost</div>
        <div className="num" style={{
          fontSize: 16, fontWeight: 600, fontFamily: "var(--ff-mono)",
        }}>{fmt.dollarsK(totalAnnual)}</div>
      </div>
      <div>
        <div className="mono" style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em",
          color: "var(--ink-3)", textTransform: "uppercase",
        }}>Cost allocation conservation</div>
        <div className="num" style={{
          fontSize: 13, fontWeight: 600, fontFamily: "var(--ff-mono)",
          color: balanced ? "var(--pos)" : "var(--warn)",
        }}>
          {balanced ? "✓ Balanced" : `Δ ${fmt.dollars(unallocated)}`}
        </div>
      </div>
    </div>
  );
}
