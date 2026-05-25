import type {
  ProductiveHoursRow, RoleAllocation, Service,
} from "./types";

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
