/* CAP receiver registry.
 *
 * Distinct receivers across all basis-unit schedules, keyed by glCode.
 * glCode is the receiver's identity for step-down routing; deptCode is
 * classification metadata used for grouping/filtering only.
 *
 * Identity rules:
 *   - Key on glCode (BasisUnitReceiver requires it — receivers without
 *     a glCode are rejected at import).
 *   - Namespace the key by role ("receiver" vs "center") because both can
 *     share a glCode (e.g. "City Manager 011-1200" appears in both maps).
 *   - Prefix with cityId + fiscalYear so cross-study models don't collide.
 *
 * Units are counted ONCE per basis (not per pool): one BasisUnitRow per
 * basis × one receiver row per glCode within it. The same schedule
 * serves every pool whose basisId points at the basis, so no per-pool
 * duplication is possible.
 *
 * Direct allocations are folded into per-pool synthetic basis schedules
 * by `materializeDirectAsBasisUnits` before the registry runs, so this
 * registry only consumes basisUnits — there is no separate direct-
 * allocation branch.
 */

import type { BasisUnitRow, InstDeptCode } from "@/lib/types";
import type { BasisKey, AllocationBasis } from "@/lib/types";
import { INDIRECT_DEPT_CODES } from "./institutionalDepts";
import type { StudyContext } from "./studyContext";

type ReceiverRole = "receiver" | "center";

/** Build the namespaced row key. Opaque to callers; only stable within one
 *  (cityId, fiscalYear) pair — never use as a cross-study join key. */
function receiverKey(
  role: ReceiverRole,
  glCode: string,
  ctx: StudyContext,
): string {
  return `${ctx.cityId}:${ctx.fiscalYear}:${role}:${glCode}`;
}

/** One distinct receiver, aggregated across every basis schedule that
 *  lists it. */
export interface ReceiverEntry {
  /** Namespaced row key — `${cityId}:${fiscalYear}:receiver:${glCode}`. */
  key: string;
  glCode: string;
  /** Display name from the source document (first-seen). */
  dept: string;
  /** Classification (InstDeptCode | "OTHER") — for grouping/filtering. */
  deptCode: InstDeptCode | "OTHER";
  /** Per-basis aggregated unit counts. One BasisUnitRow per basis means
   *  this is just a copy of the per-receiver unit row, keyed by basis. */
  values: Partial<Record<BasisKey, number>>;
  /** Where the unit counts came from — basis ids that listed this receiver. */
  sources: { basisId: string; basisKey: BasisKey; units: number }[];
}

interface ReceiverRegistry {
  entries: ReceiverEntry[];
}

/** Build the registry from the basis-units schedule. Pure function; the
 *  store memoizes the result and exposes it on `derived`. After
 *  `materializeDirectAsBasisUnits` runs upstream, direct-allocation
 *  receivers are present in basisUnits via per-pool synthetic schedules
 *  and surface through the same loop as ordinary basis receivers. */
export function buildReceiverRegistry(
  basisUnits: BasisUnitRow[],
  bases: AllocationBasis[],
  ctx: StudyContext,
): ReceiverRegistry {
  const byKey = new Map<string, ReceiverEntry>();
  const basisById = new Map(bases.map((b) => [b.id, b]));

  const upsert = (
    glCode: string, dept: string, deptCode: InstDeptCode | "OTHER",
  ): ReceiverEntry => {
    const key = receiverKey("receiver", glCode, ctx);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { key, glCode, dept, deptCode, values: {}, sources: [] };
      byKey.set(key, entry);
    }
    return entry;
  };

  // One BasisUnitRow per basis, one row per glCode. driverKey is kept
  // as informational classification on the AllocationBasis but no longer
  // gates registration — synthetic basis schedules minted from direct
  // allocations carry driverKey "DIRECT" and still surface their
  // receivers here.
  for (const bu of basisUnits) {
    const basis = basisById.get(bu.basisId);
    if (!basis) continue;
    for (const r of bu.receivers) {
      if (!r.glCode) continue;
      if (!Number.isFinite(r.units) || r.units <= 0) continue;
      const entry = upsert(r.glCode, r.dept, r.deptCode);
      entry.values[basis.driverKey] = r.units;
      entry.sources.push({
        basisId: bu.basisId, basisKey: basis.driverKey, units: r.units,
      });
    }
  }

  // Stable ordering: indirect-classification receivers first (within
  // those, alphabetical by display name — the pre-existing convention),
  // then direct receivers sorted by glCode ascending. The Allocation
  // Bases matrix groups receivers by classification; analysts read
  // direct rows account-code first because glCode is the routing
  // identity that anchors the trail back to the source budget.
  // localeCompare with numeric: true handles mixed-width segments
  // ("011-1200" vs "11-1200") in natural order. Entries within the
  // registry have unique glCodes, but a defensive dept-name tiebreaker
  // keeps the sort fully deterministic even if that invariant ever
  // loosens.
  const entries = [...byKey.values()].sort((a, b) => {
    const aIndirect = isIndirectCode(a.deptCode);
    const bIndirect = isIndirectCode(b.deptCode);
    if (aIndirect !== bIndirect) return aIndirect ? -1 : 1;
    if (aIndirect) return a.dept.localeCompare(b.dept);
    const cmp = a.glCode.localeCompare(
      b.glCode, undefined, { numeric: true, sensitivity: "base" },
    );
    return cmp !== 0 ? cmp : a.dept.localeCompare(b.dept);
  });

  return { entries };
}

/** True for the indirect-class deptCodes; used only for ordering, not
 *  identity. Reads the registry via INDIRECT_DEPT_CODES so the indirect set
 *  has exactly one source of truth (institutionalDepts.ts). */
function isIndirectCode(c: InstDeptCode | "OTHER"): boolean {
  return c !== "OTHER" && INDIRECT_DEPT_CODES.has(c);
}
