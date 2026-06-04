import type { PolicyException, PolicyTarget } from "../types";

/* Source: screens-recovery-policy.jsx RP_DEPT_DEFAULTS / RP_EXCEPTION_DEFAULTS.
 * Recovery targets are policy inputs — anything below 100% is intentionally
 * subsidized by the General Fund. */

/** LAH baseline only includes the three depts that actually have data
 *  in the seed (Planning, Building, Engineering). Other jurisdictions
 *  bring their own policy targets via their seedFile snapshot — see
 *  public/test-seed.json for City of Maplewood which adds PARKS / PD /
 *  FIRE targets alongside these three. */
export const POLICY_TARGETS: PolicyTarget[] = [
  { id: "policy-plan", dept: "PLAN", target:  70, note: "General Fund subsidy" },
  { id: "policy-bldg", dept: "BLDG", target: 100, note: "Full cost recovery" },
  { id: "policy-eng",  dept: "ENG",  target:  85, note: "Partial subsidy" },
];

/* `serviceId` links each exception to a stable row in lib/data/services.ts
 * so calc / comparison / export paths match by id rather than relying on
 * fee-name string equality. `fee` is kept in sync with the linked
 * service's name for export readability. The legacy "Nonprofit Event
 * Permit" exception was dropped because LAH's small seed only models
 * Planning / Building / Engineering — there's no event-permit service to
 * link to. */
export const POLICY_EXCEPTIONS: PolicyException[] = [
  { id: "exc-adu",   serviceId: "plan-adu",   fee: "Pre-Application — ADU Formal Meeting", target: 50, note: "Housing incentive" },
  { id: "exc-solar", serviceId: "bldg-solar", fee: "Residential Solar / PV Permit",        target: 60, note: "Sustainability policy" },
];
