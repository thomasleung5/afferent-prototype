import type { Signal } from "./types";

/** Under 60% = neg, 60–90% = warn, 90%+ = pos. */
export function signalFor(recoveryPct: number): Signal {
  if (recoveryPct >= 90) return { key: "pos",  label: "On target",      color: "var(--pos)",  tint: "var(--pos-tint)"  };
  if (recoveryPct >= 60) return { key: "warn", label: "Partial",         color: "var(--warn)", tint: "var(--warn-tint)" };
  return                       { key: "neg",  label: "Under-recovery", color: "var(--neg)",  tint: "var(--neg-tint)"  };
}
