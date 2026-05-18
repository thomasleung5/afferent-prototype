/* CAP receiver registry.
 *
 * Distinct receivers across all imported pools, keyed by glCode. The legacy
 * driver matrix (DRIVERS in capStepDown.ts) buckets receivers by deptCode —
 * that's a ~16-value classification, not an identity, so multiple distinct
 * receivers collapse into one bucket. The registry preserves per-receiver
 * identity by keying on glCode and treating deptCode as a category attribute.
 *
 * Identity rules (from the brief):
 *   - Key on glCode when present, else a normalized dept string
 *   - Namespace the key by role ("receiver" vs "center") because both can
 *     share a glCode (e.g. "City Manager 011-1200" appears in both maps)
 *   - Prefix with cityId + fiscalYear so cross-study models don't collide
 *   - Receivers missing glCode go to the `missing` list for human review,
 *     never silently dropped or collapsed onto an existing row
 *
 * A receiver appearing in N pools (with the same glCode) aggregates its
 * units across pools that share a driverKey — that's the unit count the
 * step-down would use. Per-pool detail is retained on the entry so the
 * UI can show which pools each receiver participates in.
 */

import type {
  AllocationBasis, BasisKey, CapPool, MatrixDeptCode, PoolReceiver,
} from "@/lib/types";
import { basisForPool } from "./capStepDown";
import type { StudyContext } from "./studyContext";

export type ReceiverRole = "receiver" | "center";

/** Build the namespaced row key. Opaque to callers; only stable within one
 *  (cityId, fiscalYear) pair — never use as a cross-study join key. */
export function receiverKey(
  role: ReceiverRole,
  glCodeOrFallback: string,
  ctx: StudyContext,
): string {
  return `${ctx.cityId}:${ctx.fiscalYear}:${role}:${glCodeOrFallback}`;
}

/** Normalize a dept name for use as a fallback identity when glCode is
 *  absent. Lowercase + collapse whitespace + strip diacritics-light. */
function normDeptName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** One distinct receiver, aggregated across every pool that lists it. */
export interface ReceiverEntry {
  /** Namespaced row key — `${cityId}:${fiscalYear}:receiver:${glCode || fallback}`. */
  key: string;
  /** Document's GL/account code. Undefined when the document didn't print one. */
  glCode?: string;
  /** Display name from the source document. */
  dept: string;
  /** Classification (MatrixDeptCode | "OTHER") — for grouping/filtering only. */
  deptCode: MatrixDeptCode | "OTHER";
  /** Per-basis aggregated unit counts. Sum across every pool whose basis
   *  matches and which lists this receiver with a numeric `units` value. */
  values: Partial<Record<BasisKey, number>>;
  /** Pools that contribute to this entry. Useful for the UI breakdown. */
  sources: { poolId: string; basis: BasisKey; units?: number; amount: number }[];
}

/** A receiver the document published without a glCode. Surfaced for human
 *  review — the user can either assign a glCode and re-import, or accept
 *  that this receiver won't participate in the driver matrix. */
export interface MissingReceiverEntry {
  key: string; // synthetic, derived from pool + index
  dept: string;
  deptCode: MatrixDeptCode | "OTHER";
  poolId: string;
  /** The pool's basis at the time this receiver was extracted. */
  basis: BasisKey;
  units?: number;
  amount: number;
}

export interface ReceiverRegistry {
  /** Distinct receivers keyed by glCode (or normalized name fallback). */
  entries: ReceiverEntry[];
  /** Receivers the document published without a glCode — for review. */
  missing: MissingReceiverEntry[];
}

/** Build the registry from the current pool inventory. Pure function; the
 *  store memoizes the result and exposes it on `derived`. */
export function buildReceiverRegistry(
  pools: CapPool[],
  bases: AllocationBasis[],
  ctx: StudyContext,
): ReceiverRegistry {
  const byKey = new Map<string, ReceiverEntry>();
  const missing: MissingReceiverEntry[] = [];

  for (const p of pools) {
    if (!p.receivers || p.receivers.length === 0) continue;
    const { basis: driverKey } = basisForPool(p, bases);
    if (driverKey === "DIRECT") continue;

    p.receivers.forEach((r, i) => {
      // Reject receivers the parse layer let through but the registry can't
      // place — no dept name means no row identity at all.
      if (!r.dept) return;

      const glCode = r.glCode?.trim();
      if (!glCode) {
        // Surface for review rather than silent-collapse onto a sibling row.
        missing.push({
          key: receiverKey("receiver", `noglcode-${p.id}-${i}`, ctx),
          dept: r.dept,
          deptCode: r.deptCode,
          poolId: p.id,
          basis: driverKey,
          units: r.units,
          amount: r.amount,
        });
        return;
      }

      const key = receiverKey("receiver", glCode, ctx);
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          key, glCode,
          dept: r.dept,
          deptCode: r.deptCode,
          values: {},
          sources: [],
        };
        byKey.set(key, entry);
      }
      // Units are a per-receiver attribute: the same receiver shows up in
      // every pool's allocation schedule with the SAME units value. Take
      // first-seen; warn on inconsistency. Summing across pools would
      // multiply the receiver's true unit count by the pool count — the
      // bug that produced 4× EXPEND inflation upstream.
      if (typeof r.units === "number" && Number.isFinite(r.units) && r.units > 0) {
        const existing = entry.values[driverKey];
        if (existing == null) {
          entry.values[driverKey] = r.units;
        } else if (Math.abs(existing - r.units) > 0.001) {
          // eslint-disable-next-line no-console
          console.warn(
            `[buildReceiverRegistry] inconsistent units for ${glCode}/${driverKey}: ${existing} vs ${r.units}; keeping first-seen`,
          );
        }
      }
      entry.sources.push({
        poolId: p.id,
        basis: driverKey,
        units: r.units,
        amount: r.amount,
      });
    });
  }

  // Stable ordering: indirect-classification receivers first, then direct,
  // alphabetical within each. Mirrors the AllocationBases visual grouping.
  const entries = [...byKey.values()].sort((a, b) => {
    const aIndirect = isIndirectCode(a.deptCode);
    const bIndirect = isIndirectCode(b.deptCode);
    if (aIndirect !== bIndirect) return aIndirect ? -1 : 1;
    return a.dept.localeCompare(b.dept);
  });

  return { entries, missing };
}

/** Indirect-class deptCodes; used only for ordering, not identity. */
const INDIRECT_CODES = new Set<MatrixDeptCode | "OTHER">([
  "BLDG_USE", "EQUIP", "COUNCIL", "CMGR", "CLERK", "FAS", "ATTY", "INS", "CMTE",
]);
function isIndirectCode(c: MatrixDeptCode | "OTHER"): boolean {
  return INDIRECT_CODES.has(c);
}

/** Build a `glCode → MatrixDeptCode` lookup from receiver entries. Used by
 *  computeStepDown's center resolver when an imported center carries a
 *  glCode that also appears among receivers (which is the common case for
 *  indirect centers in two-step CAPs). Not the only path — the resolver
 *  also tries the legacy CENTER_NAME_TO_CODE name map. */
export function receiverGlCodeToMatrixCode(
  entries: ReceiverEntry[],
): Record<string, MatrixDeptCode> {
  const out: Record<string, MatrixDeptCode> = {};
  for (const e of entries) {
    if (!e.glCode) continue;
    if (e.deptCode === "OTHER") continue;
    // First-seen wins on conflict — within a single document a glCode
    // points at exactly one budget unit, so conflicts indicate data noise.
    if (!(e.glCode in out)) out[e.glCode] = e.deptCode;
  }
  return out;
}
