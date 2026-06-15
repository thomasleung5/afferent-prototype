/* CAP basis routing — strict, catalog-only.
 *
 * The catalog (BuildState.allocationBases) is the only legitimate source of
 * a pool's allocation basis. `basisForPool` resolves a pool's `basisId`
 * against that catalog and returns a discriminated result:
 *
 *   - resolved     — basis catalog entry found; driverKey + directTo
 *                    available for the engine's DIRECT branch.
 *   - missing-basisId   — pool.basisId is empty/whitespace. Engine MUST
 *                    treat the pool's net allocable $ as leakage and
 *                    record a diagnostic.
 *   - orphaned-basisId  — pool.basisId is set but no catalog entry has
 *                    that id (basis was deleted, re-imported under a
 *                    different id, etc.). Same handling as missing.
 *
 * There is no text-match fallback. Earlier versions inferred a BasisKey
 * from pool.basis (the denormalized display string) and routed via a
 * seed DRIVERS matrix. That path masked stale or unmapped pools — the
 * report looked authoritative when the engine was guessing. It is gone.
 *
 * `driverKey` survives ONLY as basis classification + DIRECT detection.
 * It is never used to recover a pool whose basisId failed to resolve.
 */

import type { AllocationBasis, BasisUnitRow, CapPool } from "../types";

/** Outcome of resolving a pool's `basisId` against the current catalog.
 *  Engine and UI both consume this discriminant. */
export type BasisResolution =
  | { status: "resolved"; basis: AllocationBasis }
  | { status: "missing-basisId" }
  | { status: "orphaned-basisId"; basisId: string };

/** Resolve a pool's current `basisId` against the catalog. Does NOT fall
 *  back to text matching or seed drivers. Empty / whitespace `basisId`
 *  returns `missing-basisId`; a `basisId` that doesn't exist in the
 *  supplied catalog returns `orphaned-basisId`. */
export function basisForPool(
  pool: CapPool,
  bases: AllocationBasis[],
): BasisResolution {
  const id = pool.basisId?.trim();
  if (!id) return { status: "missing-basisId" };
  const basis = bases.find((b) => b.id === id);
  if (!basis) return { status: "orphaned-basisId", basisId: id };
  return { status: "resolved", basis };
}

/** Look up the imported `BasisUnitRow` for a basisId. Returns null when
 *  no schedule has been imported for the basis — callers must treat that
 *  as a routing failure (leakage + diagnostic), not silently fall back to
 *  a seed denominator. */
export function basisUnitRowForBasis(
  basisId: string,
  basisUnits: BasisUnitRow[],
): BasisUnitRow | null {
  return basisUnits.find((bu) => bu.basisId === basisId) ?? null;
}

/** Return the non-direct allocation bases referenced by the current pool
 *  inventory. The study catalog is intentionally additive so prior/manual
 *  bases remain available in the picker, but the Allocation Bases matrix
 *  should only show denominators that participate in the active plan. */
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
