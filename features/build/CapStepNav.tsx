
export type CapStep = "centers" | "pools" | "drivers" | "matrix" | "matrixByCenter";

export const CAP_STEPS: { id: CapStep; label: string; hint: string }[] = [
  { id: "centers",        label: "Indirect Cost Centers", hint: "Central service providers, ordered for step-down." },
  { id: "pools",          label: "Cost Pools",            hint: "Each center split into functional pools, one basis each." },
  { id: "drivers",        label: "Allocation Bases",      hint: "Department × basis matrix. The denominator for each pool." },
  { id: "matrix",         label: "Pool Allocations",      hint: "Initial placement → step-down → final, every cell traceable." },
  { id: "matrixByCenter", label: "Allocation Matrix",     hint: "Same model rolled up — one row per cost center." },
];

interface Props {
  current: CapStep;
  onJump: (step: CapStep) => void;
}

/** Four-card step navigator at the top of the CAP screen. Active card is
 *  inverted (ink bg, paper text); past steps are slightly dimmed. */
export function CapStepNav({ current, onJump }: Props) {
  const currentIdx = CAP_STEPS.findIndex((s) => s.id === current);
  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      border: "1px solid var(--rule)",
      background: "var(--paper)",
    }}>
      {CAP_STEPS.map((s, i) => {
        const active = s.id === current;
        const past = currentIdx > i;
        return (
          <button
            key={s.id}
            onClick={() => onJump(s.id)}
            style={{
              flex: 1,
              display: "flex", alignItems: "flex-start",
              padding: "14px 16px",
              background: active ? "var(--ink)" : "var(--paper)",
              color: active ? "var(--paper)" : past ? "var(--ink-2)" : "var(--ink-3)",
              borderRight: i < CAP_STEPS.length - 1 ? "1px solid var(--rule)" : "none",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "var(--ff-ui)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>
                {s.label}
              </div>
              <div style={{
                fontSize: 10.5, lineHeight: 1.35,
                color: active ? "rgba(255,255,255,0.65)" : "var(--ink-3)",
              }}>{s.hint}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
