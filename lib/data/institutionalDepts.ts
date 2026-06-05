/* Canonical institutional-dept registry for the CAP step-down.
 *
 * One source of truth for the institutional dept list (9 indirect cost
 * centers + canonical direct receivers), along with the derived projections
 * (set of indirect codes, code list, code→name map) that callers currently
 * spell out by hand in several places.
 *
 * Identity rules — re-stated for the reader:
 *   - glCode is the routing identity inside the CAP engine. InstDeptCode
 *     is classification metadata only.
 *   - DeptCode (lib/types.ts) is the fee-study rollup subset — every
 *     DeptCode is an InstDeptCode of kind "direct" with isFeeDept: true.
 *     Fee-dept codes stay unique even where an indirect center has the
 *     same natural name (for example CLERK indirect vs CLK fee dept).
 *
 * Adding a new dept: append a single entry below — every projection
 * derives from this list, so nothing else needs updating.
 */

/** The canonical institutional dept catalog. Indirect entries
 *  are listed in the same order as the legacy INDIRECT_DEPTS array so
 *  any downstream sort-stable consumers keep their existing ordering.
 *
 *  `as const` is load-bearing: it preserves the literal types of every
 *  `code` and `kind` field, which is what lets the InstDeptCode /
 *  IndirectDeptCode types below derive from this array. Any new entry
 *  appended here flows out to those unions automatically — there is no
 *  longer a separate union to keep in sync. */
export const INST_DEPTS = [
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
  { code: "ADMIN",    name: "Administration",                     kind: "direct",   isFeeDept: true },
  { code: "CLK",      name: "Clerk",                              kind: "direct",   isFeeDept: true },
  { code: "FIN",      name: "Finance",                            kind: "direct",   isFeeDept: true },
  { code: "HR",       name: "Human Resources",                    kind: "direct",   isFeeDept: true },
  { code: "IT",       name: "Information Technology",             kind: "direct",   isFeeDept: true },
  { code: "LEGAL",    name: "Legal",                              kind: "direct",   isFeeDept: true },
  { code: "BLDG",     name: "Building",                           kind: "direct",   isFeeDept: true },
  { code: "PLAN",     name: "Planning",                           kind: "direct",   isFeeDept: true },
  { code: "ENG",      name: "Engineering",                        kind: "direct",   isFeeDept: true },
  { code: "CODE",     name: "Code Enforcement",                   kind: "direct",   isFeeDept: true },
  { code: "FIRE",     name: "Fire",                               kind: "direct",   isFeeDept: true },
  { code: "PW",       name: "Public Works",                       kind: "direct",   isFeeDept: true },
  { code: "TRANS",    name: "Transportation",                     kind: "direct",   isFeeDept: true },
  { code: "ENV",      name: "Environmental Services",             kind: "direct",   isFeeDept: true },
  { code: "UTIL",     name: "Utilities",                          kind: "direct",   isFeeDept: true },
  { code: "PD",       name: "Police",                             kind: "direct",   isFeeDept: true },
  { code: "PARKS",    name: "Parks & Recreation",                 kind: "direct",   isFeeDept: true },
  { code: "LIB",      name: "Library",                            kind: "direct",   isFeeDept: true },
  { code: "ANIMAL",   name: "Animal Services",                    kind: "direct",   isFeeDept: true },
  { code: "HOUSING",  name: "Housing",                            kind: "direct",   isFeeDept: true },
  { code: "ECON",     name: "Economic Development",               kind: "direct",   isFeeDept: true },
  { code: "HEALTH",   name: "Public Health",                      kind: "direct",   isFeeDept: true },
  { code: "COMMUNITY",name: "Community Services",                 kind: "direct",   isFeeDept: true },
  { code: "AIR_HARBOR",name:"Airport / Harbor",                   kind: "direct",   isFeeDept: true },
  { code: "GEN_GOV",  name: "General Government",                 kind: "direct",   isFeeDept: true },
] as const;

/** One row of the catalog. Derived so the field types reflect the
 *  literal values (e.g. `kind: "indirect" | "direct"`). */
type InstDept = (typeof INST_DEPTS)[number];

/** Union of every code in INST_DEPTS. Removing an entry above turns
 *  every reference to that code into a compile error at the use site —
 *  no separately-maintained union to drift. */
export type InstDeptCode = InstDept["code"];


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
