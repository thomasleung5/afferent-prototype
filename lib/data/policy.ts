import type { PolicyException, PolicyTarget } from "../types";

/* Source: screens-recovery-policy.jsx RP_DEPT_DEFAULTS / RP_EXCEPTION_DEFAULTS.
 * Recovery targets are policy inputs — anything below 100% is intentionally
 * subsidized by the General Fund. */

export const POLICY_TARGETS: PolicyTarget[] = [
  { id: "policy-plan", dept: "PLAN", target:  70, note: "General Fund subsidy" },
  { id: "policy-bldg", dept: "BLDG", target: 100, note: "Full cost recovery" },
  { id: "policy-eng",  dept: "ENG",  target:  85, note: "Partial subsidy" },
];

export const POLICY_EXCEPTIONS: PolicyException[] = [
  { id: "exc-adu",       fee: "ADU Permit",              target: 50, note: "Housing incentive" },
  { id: "exc-nonprofit", fee: "Nonprofit Event Permit",  target: 25, note: "Community subsidy" },
  { id: "exc-solar",     fee: "Small Solar Permit",      target: 60, note: "Sustainability policy" },
];
