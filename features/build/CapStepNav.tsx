
export type CapStep =
  | "centers" | "pools" | "drivers"
  | "detail" | "matrixByCenter";

const CAP_STEPS: { id: CapStep; label: string }[] = [
  { id: "centers",        label: "Indirect Cost Centers" },
  { id: "pools",          label: "Cost Pools" },
  { id: "drivers",        label: "Allocation Bases" },
  { id: "detail",         label: "Allocation Detail" },
  { id: "matrixByCenter", label: "Allocation Matrix" },
];

interface Props {
  current: CapStep;
  onJump: (step: CapStep) => void;
}

/** Sub-tab row for the CAP page. Visual mirrors the main Build Model tab row
 *  (components/layout/SubNav) — underline on the active tab — but is driven
 *  by local state instead of routing. */
export function CapStepNav({ current, onJump }: Props) {
  return (
    <div style={{
      borderBottom: "1px solid var(--rule)",
      background: "var(--paper)",
      display: "flex", gap: 0, alignItems: "stretch",
    }}>
      {CAP_STEPS.map((s, i) => {
        const on = s.id === current;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s.id)}
            style={{
              padding: "10px 14px",
              display: "inline-flex", alignItems: "center",
              fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
              fontFamily: "var(--ff-ui)",
              color: on ? "var(--ink)" : "var(--ink-3)",
              background: on ? "var(--paper-2)" : "transparent",
              borderTop: "none", borderLeft: "none",
              borderRight: i < CAP_STEPS.length - 1 ? "1px solid var(--rule)" : "none",
              borderBottom: on ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
