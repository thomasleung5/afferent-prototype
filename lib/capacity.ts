import type {
  DeptCode, ProductiveHoursRow, RoleAllocation, Service,
} from "./types";
import { FEE_DEPTS } from "./data/departments";

/* Capacity reconciliation layer — answers "can each department deliver the
 * modeled annual service workload with its current staffing?"
 *
 * PR-K1 introduces the foundation: a deterministic default-allocation
 * helper so role allocations are derived from the actual position roster
 * (productiveHours) rather than hardcoded labels. Later PRs add the
 * allocatedHoursByDept / utilizationByDept derivations and the
 * RateDerivation UI surface. */

/** Resolve a service's role allocations: the persisted override when
 *  present, otherwise the FTE-weighted default derived from same-dept
 *  productiveHours rows. */
export function effectiveRoleAllocations(
  service: Service,
  productiveHours: ProductiveHoursRow[],
  overrides: Record<string, RoleAllocation[]>,
): RoleAllocation[] {
  const override = overrides[service.id];
  if (override && override.length > 0) return override;
  return defaultRoleAllocationsForService(service, productiveHours);
}

/** FTE-weighted default allocation: pick the top 2 same-dept positions
 *  (by FTE desc, then id asc for determinism), split 100% across them
 *  by FTE proportions, residual to first. Returns [] when no same-dept
 *  positions exist. Pure / idempotent. */
export function defaultRoleAllocationsForService(
  service: Service,
  productiveHours: ProductiveHoursRow[],
): RoleAllocation[] {
  const sameDept = productiveHours.filter((p) => p.dept === service.dept);
  if (sameDept.length === 0) return [];

  // Deterministic ordering — FTE desc, then id asc on ties. The top-2
  // cut mirrors the original ROLE_MIX_BY_DEPT shape (one "primary" and
  // one "secondary" role) which keeps the drilldown ergonomic without
  // forcing the user to manage 4+ rows on every service.
  const ordered = [...sameDept].sort((a, b) => {
    if (b.fte !== a.fte) return b.fte - a.fte;
    return a.id.localeCompare(b.id);
  });
  const top = ordered.slice(0, 2);

  const sumFte = top.reduce((a, p) => a + p.fte, 0);
  if (sumFte <= 0) {
    // All top positions have 0 FTE — equal split as a safe fallback.
    const share = Math.floor(100 / top.length);
    const out = top.map((p) => ({ productiveHoursId: p.id, pct: share }));
    out[0].pct += 100 - share * top.length;
    return out;
  }

  const pcts = top.map((p) => Math.round((p.fte / sumFte) * 100));
  const residual = 100 - pcts.reduce((a, n) => a + n, 0);
  pcts[0] += residual;
  return top.map((p, i) => ({ productiveHoursId: p.id, pct: pcts[i] }));
}

/** Hours one allocation slice draws annually from its role's dept.
 *  Formula: volume × hours-per-instance × pct/100. Pure. */
export function allocatedRoleHours(
  service: Pick<Service, "volume" | "hours">,
  allocation: Pick<RoleAllocation, "pct">,
): number {
  return service.volume * service.hours * (allocation.pct / 100);
}

/** Roll up annual service demand into hours-per-dept, routed by the
 *  role's dept (looked up via productiveHours[productiveHoursId].dept)
 *  rather than the service's owning dept.
 *
 *  This routing is the entire point of the capacity layer — a BLDG
 *  service that's actually delivered 30% by a PLAN planner shows up
 *  as 30% PLAN demand, not 100% BLDG demand. Pure / deterministic.
 *
 *  Allocations referencing a productiveHoursId that no longer exists
 *  in the roster are silently dropped (the position was deleted); the
 *  PR-K4 warning surface will flag those rows for cleanup. */
export function allocatedHoursByDept(
  services: Service[],
  overrides: Record<string, RoleAllocation[]>,
  productiveHours: ProductiveHoursRow[],
): Record<DeptCode, number> {
  const phById = new Map<string, ProductiveHoursRow>();
  for (const p of productiveHours) phById.set(p.id, p);

  const out = {} as Record<DeptCode, number>;
  for (const d of FEE_DEPTS) out[d] = 0;

  for (const svc of services) {
    const mix = effectiveRoleAllocations(svc, productiveHours, overrides);
    for (const alloc of mix) {
      const pos = phById.get(alloc.productiveHoursId);
      if (!pos) continue; // dangling reference — see doc above
      const hrs = allocatedRoleHours(svc, alloc);
      out[pos.dept] = (out[pos.dept] ?? 0) + hrs;
    }
  }
  return out;
}

/** Per-dept capacity reconciliation row. `pct` is 0–N (utilization can
 *  exceed 100 when demand outruns capacity). `productive` of 0 yields
 *  pct=0 so the UI doesn't display NaN%; callers can use the missing-
 *  hours warning surface to flag those depts. */
export interface DeptUtilization {
  allocated: number;
  productive: number;
  pct: number;
}

/** Combine the demand side (allocated hours by dept) with the supply
 *  side (productive hours by dept) into the per-dept utilization
 *  reconciliation that drives the Cost of Service FBHR table's two
 *  new columns. */
export function utilizationByDept(
  allocated: Record<DeptCode, number>,
  productive: Record<DeptCode, number>,
): Record<DeptCode, DeptUtilization> {
  const out = {} as Record<DeptCode, DeptUtilization>;
  for (const d of FEE_DEPTS) {
    const a = allocated[d] ?? 0;
    const p = productive[d] ?? 0;
    out[d] = { allocated: a, productive: p, pct: p > 0 ? (a / p) * 100 : 0 };
  }
  return out;
}
