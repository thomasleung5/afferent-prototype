/* CAP basis routing + seed driver denominators.
 *
 * Not an allocation engine — these are the lookup helpers and seed
 * constants the engine (./capStepDownEngine.ts) reads:
 *   - basisForPool / inferBasis — resolves a pool's basis key + directTo.
 *   - DRIVERS — per-InstDeptCode seed driver values used as fallback
 *     when no imports cover a given node.
 *
 * The institutional dept catalog lives in ./institutionalDepts.ts.
 */

import type { AllocationBasis, BasisKey, CapPool, InstDeptCode } from "../types";
import { BASIS_DRIVERS } from "./allocationBases";

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

/** Return the non-direct allocation bases referenced by the current pool
 * inventory. The study catalog is intentionally additive so prior/manual
 * bases remain available in the picker, but the Allocation Bases matrix
 * should only show denominators that participate in the active plan. */
export function allocationBasesUsedByPools(
  pools: CapPool[],
  bases: AllocationBasis[],
): AllocationBasis[] {
  const usedIds = new Set(pools.map((pool) => pool.basisId).filter(Boolean));
  const usedNames = new Set(pools.map((pool) => pool.basis.trim().toLowerCase()));
  return bases.filter((basis) =>
    basis.driverKey !== "DIRECT"
    && (usedIds.has(basis.id) || usedNames.has(basis.name.trim().toLowerCase())),
  );
}

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
): { basis: BasisKey; directTo?: InstDeptCode } {
  const cat = p.basisId ? bases.find((b) => b.id === p.basisId) : undefined;
  if (cat) return { basis: cat.driverKey, directTo: cat.directTo };
  return { basis: inferBasis(p) };
}

// ---------------------------------------------------------------------------
// Drivers (department × basis denominators)
// ---------------------------------------------------------------------------

type DriverMatrix = Record<InstDeptCode, Partial<Record<BasisKey, number>>>;

/** Seed driver values per department × basis — derived from the Allocation
 *  Bases matrix (lib/data/allocationBases.ts) so the Allocation Bases tab
 *  and the step-down engine share one source of truth when no basisUnits
 *  have been imported for a basis.
 *
 *  Indirect rows are receivers too — a pool sitting on Finance can be
 *  stepped down to City Attorney if Attorney comes later in the sequence. */
export const DRIVERS: DriverMatrix = (() => {
  const out: DriverMatrix = {} as DriverMatrix;
  for (const [code, values] of Object.entries(BASIS_DRIVERS) as [InstDeptCode, Partial<Record<BasisKey, number>>][]) {
    const cell: Partial<Record<BasisKey, number>> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v != null) cell[k as BasisKey] = v as number;
    }
    out[code] = cell;
  }
  return out;
})();
