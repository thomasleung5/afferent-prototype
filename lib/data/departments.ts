import type { DepartmentMap, DeptCode } from "../types";

/** Registry of fee-bearing departments. Source of truth for iteration
 *  order and display names. FBHR values are starting baselines — the
 *  derived FBHR computed in lib/calc.ts overrides per active model. */
export const DEPTS: DepartmentMap = {
  PLAN:  { code: "PLAN",  name: "Planning Administration",         fbhr: 301 },
  BLDG:  { code: "BLDG",  name: "Building Administration",          fbhr: 362 },
  ENG:   { code: "ENG",   name: "Engineering Administration",       fbhr: 359 },
  PARKS: { code: "PARKS", name: "Parks & Recreation Administration", fbhr: 215 },
  PD:    { code: "PD",    name: "Police Services Administration",    fbhr: 285 },
  FIRE:  { code: "FIRE",  name: "Fire Prevention Administration",    fbhr: 268 },
};

/** Canonical iteration order for fee-bearing departments. Use this
 *  everywhere instead of hardcoding ["PLAN","BLDG","ENG"] — keeps the
 *  app honest when departments are added or removed. */
export const FEE_DEPTS: DeptCode[] = Object.keys(DEPTS) as DeptCode[];

/** Short display name (without the " Administration" suffix the registry
 *  uses). Most UI surfaces want the compact form. */
export function deptName(code: DeptCode): string {
  return DEPTS[code].name.replace(" Administration", "");
}
