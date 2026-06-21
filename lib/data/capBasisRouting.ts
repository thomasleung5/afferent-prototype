/* CAP basis routing — strict, catalog-only.
 *
 * The catalog (BuildState.allocationBases) is the only legitimate source of
 * a pool's allocation basis. `basisForPool` resolves a pool's `basisId`
 * against that catalog and returns a discriminated result:
 *
 *   - resolved     — basis catalog entry found.
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
 * `driverKey` survives on AllocationBasis only as legacy metadata — the
 * engine no longer reads it for routing. Direct allocations are converted
 * into ordinary pool-specific basis schedules via
 * `materializeDirectAsBasisUnits` before the engine runs, so every pool
 * resolves through the same `pool → basisId → BasisUnitRow → receivers`
 * path regardless of whether the original document published it as a
 * direct allocation or as a basis-driven split.
 */

import type {
  AllocationBasis, BasisUnitRow, CapPool, DirectAllocationRow,
} from "../types";

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

/** Synthetic AllocationBasis id minted for each direct allocation. Stable
 *  per pool so engine results don't drift between calls. */
export function syntheticDirectBasisId(poolId: string): string {
  return `synth:direct:${poolId}`;
}

const SYNTHETIC_CREATED_AT = "1970-01-01T00:00:00.000Z";

/** Engine-internal view of CAP state with all direct allocations folded
 *  into per-pool basis schedules. Outputs are working copies — original
 *  pools / bases / basisUnits are never mutated.
 *
 *  For each DirectAllocationRow whose pool is present in `pools`:
 *    - mint a synthetic AllocationBasis (id `synth:direct:<poolId>`,
 *      name "${center} · ${pool} Direct", driverKey "DIRECT" so legacy
 *      UI that still reads driverKey treats it as direct);
 *    - mint a synthetic BasisUnitRow whose receivers carry the direct
 *      allocation's percent values as `units` (normalization in the
 *      engine is identical: `units / Σ units` = `percent / 100`);
 *    - rewrite the pool's `basisId` to point at the synthetic basis.
 *
 *  Pools without a matching DirectAllocationRow pass through unchanged.
 *  After materialization the engine routes every pool through the same
 *  basisUnits path; the original DirectAllocationRow is no longer needed
 *  downstream. */
export function materializeDirectAsBasisUnits(args: {
  pools: CapPool[];
  bases: AllocationBasis[];
  basisUnits: BasisUnitRow[];
  directAllocations: DirectAllocationRow[];
}): {
  pools: CapPool[];
  bases: AllocationBasis[];
  basisUnits: BasisUnitRow[];
} {
  const { pools, bases, basisUnits, directAllocations } = args;
  if (directAllocations.length === 0) {
    return { pools, bases, basisUnits };
  }

  const directByPoolId = new Map(directAllocations.map((da) => [da.poolId, da]));
  const outPools: CapPool[] = [];
  const synthBases: AllocationBasis[] = [];
  const synthBasisUnits: BasisUnitRow[] = [];

  for (const pool of pools) {
    const da = directByPoolId.get(pool.id);
    if (!da) {
      outPools.push(pool);
      continue;
    }
    const synthId = syntheticDirectBasisId(pool.id);
    const synthName = `${pool.center} · ${pool.pool} Direct`;
    synthBases.push({
      id: synthId,
      name: synthName,
      source: "Direct allocation",
      driverKey: "DIRECT",
      createdAt: SYNTHETIC_CREATED_AT,
      validationStatus: "verified",
    });
    synthBasisUnits.push({
      basisId: synthId,
      basis: synthName,
      source: "Direct allocation",
      receivers: da.receivers.map((r) => ({
        glCode: r.glCode,
        dept: r.dept,
        deptCode: r.deptCode,
        units: r.percent,
      })),
    });
    outPools.push({ ...pool, basisId: synthId });
  }

  return {
    pools: outPools,
    bases: synthBases.length > 0 ? [...bases, ...synthBases] : bases,
    basisUnits: synthBasisUnits.length > 0
      ? [...basisUnits, ...synthBasisUnits]
      : basisUnits,
  };
}
