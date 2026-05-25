/* Canonical institutional-dept registry for the CAP step-down.
 *
 * One source of truth for the 16-member institutional dept list (9 indirect
 * cost centers + 7 direct receivers), along with the derived projections
 * (set of indirect codes, code list, code→name map) that callers currently
 * spell out by hand in several places.
 *
 * Identity rules — re-stated for the reader:
 *   - glCode is the routing identity inside the CAP engine. InstDeptCode
 *     is classification metadata only.
 *   - DeptCode (lib/types.ts) is the fee-study rollup subset — every
 *     DeptCode is an InstDeptCode of kind "direct" with isFeeDept: true.
 *     The only direct InstDept that is NOT a DeptCode is "PW" (Public
 *     Works isn't fee-modeled today).
 *
 * Adding a new dept: append a single entry below — every projection
 * derives from this list, so nothing else needs updating.
 */

import type { DeptCode, MatrixDeptCode } from "../types";

/** Alias of MatrixDeptCode under a name that better reflects what the type
 *  actually represents (the institutional dept registry, not a matrix). The
 *  rename to InstDeptCode across call sites is a later, isolated PR. */
export type InstDeptCode = MatrixDeptCode;

export type IndirectDeptCode =
  | "BLDG_USE" | "EQUIP" | "COUNCIL" | "CMGR" | "CLERK" | "FAS"
  | "ATTY" | "INS" | "CMTE";

/** Direct receivers. Every DeptCode lives here; "PW" is the one direct
 *  InstDept that isn't fee-modeled (isFeeDept: false). */
export type DirectDeptCode = DeptCode | "PW";

export interface InstDept {
  code: InstDeptCode;
  /** Display name; matches the name used as the lookup key in
   *  capCenterTotals / pool.center for indirect entries. */
  name: string;
  kind: "indirect" | "direct";
  /** True when the dept is one of the FBHR/fee-modeled depts (i.e. a
   *  DeptCode). Always false for indirect entries. */
  isFeeDept: boolean;
}

/** The canonical 16-entry institutional dept catalog. Indirect entries
 *  are listed in the same order as the legacy INDIRECT_DEPTS array so
 *  any downstream sort-stable consumers keep their existing ordering. */
export const INST_DEPTS: readonly InstDept[] = [
  // Indirect cost centers
  { code: "BLDG_USE", name: "Building Use",                       kind: "indirect", isFeeDept: false },
  { code: "EQUIP",    name: "Equipment Use",                      kind: "indirect", isFeeDept: false },
  { code: "COUNCIL",  name: "City Council",                       kind: "indirect", isFeeDept: false },
  { code: "CMGR",     name: "City Manager",                       kind: "indirect", isFeeDept: false },
  { code: "CLERK",    name: "City Clerk",                         kind: "indirect", isFeeDept: false },
  { code: "FAS",      name: "Finance & Administrative Services",  kind: "indirect", isFeeDept: false },
  { code: "ATTY",     name: "City Attorney",                      kind: "indirect", isFeeDept: false },
  { code: "INS",      name: "Insurance",                          kind: "indirect", isFeeDept: false },
  { code: "CMTE",     name: "Committees",                         kind: "indirect", isFeeDept: false },
  // Direct receivers — DeptCodes are fee-modeled; "PW" is direct but not.
  { code: "PLAN",     name: "Planning",                           kind: "direct",   isFeeDept: true },
  { code: "BLDG",     name: "Building",                           kind: "direct",   isFeeDept: true },
  { code: "ENG",      name: "Engineering",                        kind: "direct",   isFeeDept: true },
  { code: "PW",       name: "Public Works",                       kind: "direct",   isFeeDept: false },
  { code: "PARKS",    name: "Parks & Recreation",                 kind: "direct",   isFeeDept: true },
  { code: "PD",       name: "Police Services",                    kind: "direct",   isFeeDept: true },
  { code: "FIRE",     name: "Fire Prevention",                    kind: "direct",   isFeeDept: true },
];

// ---------------------------------------------------------------------------
// Derived projections — every map / set below is computed from INST_DEPTS so
// the registry has exactly one place to edit. Callers should prefer these
// over re-deriving the same shapes inline.
// ---------------------------------------------------------------------------

/** Set of indirect codes for fast `has()` checks (e.g. sort-ordering in the
 *  receiver registry). */
export const INDIRECT_DEPT_CODES: ReadonlySet<InstDeptCode> = new Set(
  INST_DEPTS.filter((d) => d.kind === "indirect").map((d) => d.code),
);

/** All InstDeptCodes as an array — for runtime validators that need to
 *  iterate the union (e.g. import-time string-to-code coercion). */
export const INST_DEPT_CODE_LIST: readonly InstDeptCode[] =
  INST_DEPTS.map((d) => d.code);

/** code → display name. */
export const NAME_BY_DEPT_CODE: ReadonlyMap<InstDeptCode, string> = new Map(
  INST_DEPTS.map((d) => [d.code, d.name]),
);

/** name → code for indirect entries only (the legacy CENTER_NAME_TO_CODE
 *  use case — center names from the store map back to an InstDeptCode for
 *  the classification metadata stamp). */
export const INDIRECT_CODE_BY_NAME: ReadonlyMap<string, InstDeptCode> = new Map(
  INST_DEPTS.filter((d) => d.kind === "indirect").map((d) => [d.name, d.code]),
);
