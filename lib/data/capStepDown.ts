/* CAP step-down — shared types, seed DRIVERS, and basis routing.
 *
 * The engine itself lives in capStepDownGl.ts (glCode-native). This file
 * exposes the constants and helpers that engine uses:
 *   - INDIRECT_DEPTS — indirect MatrixDept catalog used by the graph
 *     builder when seeding driver values onto synth seed:center:* nodes.
 *   - CENTER_NAME_TO_CODE — receiver-fallback classification map for the
 *     legacy LAH center names.
 *   - basisForPool / inferBasis — resolves a pool's basis key + directTo.
 *   - DRIVERS — per-MatrixDeptCode seed driver values used as fallback
 *     when no imports cover a given node.
 */

import type { AllocationBasis, BasisKey, CapPool, MatrixDeptCode } from "../types";
import { ALLOCATION_BASIS_ROWS } from "./allocationBases";

// Re-export for backwards compat — these types now live in lib/types.ts so
// AllocationBasis (also in types.ts) can reference them without a cycle.
export type { BasisKey, MatrixDeptCode };

// ---------------------------------------------------------------------------
// Departments (matrix-only)
// ---------------------------------------------------------------------------

export interface MatrixDept {
  code: MatrixDeptCode;
  name: string;
  kind: "indirect" | "direct";
}

/** Step-down order is set by the user via the StepDownSequence card (see
 *  BuildContext.capCenterOrder). The names below are the human-readable
 *  center names that order references; the codes are the matrix dept IDs. */
export const INDIRECT_DEPTS: MatrixDept[] = [
  { code: "BLDG_USE", name: "Building Use",                       kind: "indirect" },
  { code: "EQUIP",    name: "Equipment Use",                      kind: "indirect" },
  { code: "COUNCIL",  name: "City Council",                       kind: "indirect" },
  { code: "CMGR",     name: "City Manager",                       kind: "indirect" },
  { code: "CLERK",    name: "City Clerk",                         kind: "indirect" },
  { code: "FAS",      name: "Finance & Administrative Services",  kind: "indirect" },
  { code: "ATTY",     name: "City Attorney",                      kind: "indirect" },
  { code: "INS",      name: "Insurance",                          kind: "indirect" },
  { code: "CMTE",     name: "Committees",                         kind: "indirect" },
];

/** Center-name → indirect-dept code (matches CAP_POOLS.center text). */
export const CENTER_NAME_TO_CODE: Record<string, MatrixDeptCode> = {
  "Building Use":                      "BLDG_USE",
  "Equipment Use":                     "EQUIP",
  "City Council":                      "COUNCIL",
  "City Manager":                      "CMGR",
  "City Clerk":                        "CLERK",
  "Finance & Administrative Services": "FAS",
  "City Attorney":                     "ATTY",
  "Insurance":                         "INS",
  "Committees":                        "CMTE",
};

// ---------------------------------------------------------------------------
// Bases
//
// A pool's basis is resolved by looking up pool.basisId in the AllocationBasis
// catalog (state.allocationBases). The catalog entry's driverKey is what
// selects the DRIVERS column for the step-down split — i.e. changing a pool's
// basis from "Agenda item count" to "Budgeted FTE" actually changes the
// allocation distribution because driverKey switches from AGENDA to FTE.
//
// inferBasis is the legacy text-matching fallback for pools whose basisId is
// empty or orphaned (AI-imported rows, hand-crafted pools without catalog
// reference). It guesses from the descriptive pool.basis text. Once every
// pool has a valid basisId, inferBasis stops firing.
// ---------------------------------------------------------------------------

function inferBasis(p: CapPool): BasisKey {
  const t = p.basis.toLowerCase();
  if (t.includes("fte"))             return "FTE";
  if (t.includes("agenda"))          return "AGENDA";
  if (t.includes("payroll"))         return "PAYROLL";
  if (t.includes("accounting"))      return "ACCT";
  if (t.includes("pra") || t.includes("records request")) return "PRA";
  if (t.includes("contract") || t.includes("procurement")) return "CONTRACT";
  if (t.includes("sq ft") || t.includes("square") || t.includes("occupying town hall")) return "SQFT";
  if (t.includes("vehicle") || t.includes("equipment depreciation")) return "VEHICLE";
  if (t.includes("committee"))       return "COMMITS";
  if (t.includes("excl. planning") || t.includes("excluding development")) return "EXPEND_X";
  if (t.includes("pw departments only") || t.includes("public works only") || t.includes("pw only")) return "EXPEND_PW";
  if (t.includes("budgeted expend")) return "EXPEND";
  if (t.includes("direct"))          return "DIRECT";
  return "EXPEND";
}

export function basisForPool(
  p: CapPool,
  bases: AllocationBasis[],
): { basis: BasisKey; directTo?: MatrixDeptCode } {
  const cat = p.basisId ? bases.find((b) => b.id === p.basisId) : undefined;
  if (cat) return { basis: cat.driverKey, directTo: cat.directTo };
  return { basis: inferBasis(p) };
}

// ---------------------------------------------------------------------------
// Drivers (department × basis denominators)
// ---------------------------------------------------------------------------

export type DriverMatrix = Record<MatrixDeptCode, Partial<Record<BasisKey, number>>>;

/** Seed driver values per department × basis — derived from the Allocation
 *  Bases matrix (lib/data/allocationBases.ts) so the Allocation Bases tab
 *  and the step-down engine share one source of truth when no basisUnits
 *  have been imported for a basis.
 *
 *  Indirect rows are receivers too — a pool sitting on Finance can be
 *  stepped down to City Attorney if Attorney comes later in the sequence. */
export const DRIVERS: DriverMatrix = (() => {
  const out: DriverMatrix = {} as DriverMatrix;
  for (const row of ALLOCATION_BASIS_ROWS) {
    const code = row.code as MatrixDeptCode;
    const cell: Partial<Record<BasisKey, number>> = {};
    for (const [k, v] of Object.entries(row.values)) {
      if (v != null) cell[k as BasisKey] = v as number;
    }
    out[code] = cell;
  }
  return out;
})();

