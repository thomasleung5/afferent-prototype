import type {
  CapAllocation, DeptCode, EnrichedService, OperatingLine, Position,
  PolicyException, PolicyTarget, Service,
} from "./types";

export interface TopFix extends EnrichedService {
  /** Recommended fee at target recovery, snapped to $5. */
  recommended: number;
  /** Annual revenue lift if recommended fee is adopted. */
  annualUplift: number;
}

export function topFixes(services: Service[], limit = 6): TopFix[] {
  return services
    .map<TopFix>((s) => {
      const recommended = Math.round((s.cost * (s.target || 100)) / 100 / 5) * 5;
      const recovery = s.cost > 0 ? (s.fee / s.cost) * 100 : 0;
      const gap = (s.cost - s.fee) * s.volume;
      const annualUplift = (recommended - s.fee) * s.volume;
      return { ...s, recovery, gap, recommended, annualUplift };
    })
    .filter((s) => s.annualUplift > 0)
    .sort((a, b) => b.annualUplift - a.annualUplift)
    .slice(0, limit);
}

/* ---------- Build Model derivations ----------
 * The four input nodes (Direct Labor, Operating, Cost Allocation, Workload)
 * roll up into per-dept FBHR, which is then applied to each service in
 * Cost of Service. All functions here are pure. */

const FEE_DEPTS: DeptCode[] = ["PLAN", "BLDG", "ENG"];

export interface DeptLabor {
  dept: DeptCode;
  fte: number;
  positions: number;
  /** Total salary + benefits, weighted by FTE. */
  totalComp: number;
  /** Total productive hours/yr (hours × fte) summed over the dept. */
  productiveHours: number;
  /** salary+benefits ÷ productive hrs. */
  directRate: number;
}

export function deptLabor(positions: Position[]): Record<DeptCode, DeptLabor> {
  const out: Record<DeptCode, DeptLabor> = {
    PLAN: { dept: "PLAN", fte: 0, positions: 0, totalComp: 0, productiveHours: 0, directRate: 0 },
    BLDG: { dept: "BLDG", fte: 0, positions: 0, totalComp: 0, productiveHours: 0, directRate: 0 },
    ENG:  { dept: "ENG",  fte: 0, positions: 0, totalComp: 0, productiveHours: 0, directRate: 0 },
  };
  for (const p of positions) {
    const row = out[p.dept];
    // Defensive: imports may carry an unrecognized dept code (e.g. a typo
    // from an AI-accepted row). Skip rather than crash — the row stays in
    // the roster table but doesn't roll up.
    if (!row) continue;
    row.positions += 1;
    row.fte += p.fte;
    row.totalComp += (p.salary + p.benefits) * p.fte;
    row.productiveHours += p.hours * p.fte;
  }
  for (const d of FEE_DEPTS) {
    const r = out[d];
    r.directRate = r.productiveHours > 0 ? r.totalComp / r.productiveHours : 0;
  }
  return out;
}

export interface DeptOperating {
  dept: DeptCode;
  /** Direct (non-shared) included $ for this dept. */
  direct: number;
  /** Shared CDS $ allocated to this dept by productive-hours share. */
  shared: number;
  /** direct + shared. */
  total: number;
  /** total ÷ productive hours. */
  rate: number;
}

export function deptOperating(
  lines: OperatingLine[],
  hoursByDept: Record<DeptCode, number>,
): Record<DeptCode, DeptOperating> {
  const included = lines.filter((l) => l.include);
  const sharedTotal = included
    .filter((l) => l.dept === "SHARED:CDS")
    .reduce((a, l) => a + l.amount, 0);
  const hoursTotal = FEE_DEPTS.reduce((a, d) => a + (hoursByDept[d] || 0), 0);

  const out = {} as Record<DeptCode, DeptOperating>;
  for (const d of FEE_DEPTS) {
    const direct = included
      .filter((l) => l.dept === d)
      .reduce((a, l) => a + l.amount, 0);
    const share = hoursTotal > 0 ? (hoursByDept[d] || 0) / hoursTotal : 0;
    const shared = sharedTotal * share;
    const total = direct + shared;
    const hrs = hoursByDept[d] || 0;
    out[d] = { dept: d, direct, shared, total, rate: hrs > 0 ? total / hrs : 0 };
  }
  return out;
}

export interface FBHR {
  dept: DeptCode;
  directRate: number;
  operatingRate: number;
  capRate: number;
  /** direct + operating + cap, applied to hours when costing services. */
  fbhr: number;
  productiveHours: number;
  directDollars: number;
  operatingDollars: number;
  capDollars: number;
}

export function deptFBHR(
  labor: Record<DeptCode, DeptLabor>,
  operating: Record<DeptCode, DeptOperating>,
  cap: Record<DeptCode, CapAllocation>,
): Record<DeptCode, FBHR> {
  const out = {} as Record<DeptCode, FBHR>;
  for (const d of FEE_DEPTS) {
    const l = labor[d];
    const op = operating[d];
    const c = cap[d];
    const hrs = l.productiveHours;
    const capRate = hrs > 0 ? c.allocated / hrs : 0;
    out[d] = {
      dept: d,
      directRate: l.directRate,
      operatingRate: op.rate,
      capRate,
      fbhr: l.directRate + op.rate + capRate,
      productiveHours: hrs,
      directDollars: l.totalComp,
      operatingDollars: op.total,
      capDollars: c.allocated,
    };
  }
  return out;
}

export interface ServiceCost {
  id: string;
  name: string;
  dept: DeptCode;
  hours: number;
  volume: number;
  fee: number;
  /** hours × FBHR for this service's dept. */
  unitCost: number;
  /** unitCost × volume. */
  annualCost: number;
  /** fee × volume. */
  annualRevenue: number;
}

export function serviceCosts(
  services: Service[],
  fbhr: Record<DeptCode, FBHR>,
): ServiceCost[] {
  return services.map((s) => {
    const rate = fbhr[s.dept]?.fbhr ?? 0;
    const unitCost = s.hours * rate;
    return {
      id: s.id,
      name: s.name,
      dept: s.dept,
      hours: s.hours,
      volume: s.volume,
      fee: s.fee,
      unitCost,
      annualCost: unitCost * s.volume,
      annualRevenue: s.fee * s.volume,
    };
  });
}

/** Recovery target for a service: dept-level policy unless overridden by a
 *  named exception. Match is case-insensitive on the fee name. */
export function targetFor(
  service: Service,
  deptTargets: PolicyTarget[],
  exceptions: PolicyException[],
): number {
  const exc = exceptions.find(
    (e) => e.fee.toLowerCase() === service.name.toLowerCase(),
  );
  if (exc) return exc.target;
  const t = deptTargets.find((p) => p.dept === service.dept);
  return t?.target ?? service.target ?? 100;
}

export interface FeeComparison extends ServiceCost {
  recoveryPct: number;
  target: number;
  /** unitCost × target, snapped to nearest $5. */
  recommended: number;
  /** (recommended − fee) × volume. */
  annualUplift: number;
}

export function feeComparisons(
  services: Service[],
  fbhr: Record<DeptCode, FBHR>,
  deptTargets: PolicyTarget[],
  exceptions: PolicyException[],
): FeeComparison[] {
  return serviceCosts(services, fbhr).map((c) => {
    const svc = services.find((s) => s.id === c.id)!;
    const target = targetFor(svc, deptTargets, exceptions);
    const recommended = Math.round((c.unitCost * target) / 100 / 5) * 5;
    const recoveryPct = c.unitCost > 0 ? (c.fee / c.unitCost) * 100 : 0;
    return {
      ...c,
      recoveryPct,
      target,
      recommended,
      annualUplift: (recommended - c.fee) * c.volume,
    };
  });
}

export interface PolicyImpact {
  totalCost: number;
  intendedRevenue: number;
  currentRevenue: number;
  /** intendedRevenue / totalCost as a percent. */
  overallPct: number;
  /** totalCost − intendedRevenue: the policy-driven subsidy. */
  subsidy: number;
  /** max(0, intendedRevenue − currentRevenue): the closeable gap. */
  recoverableGap: number;
}

export function policyImpact(
  services: Service[],
  fbhr: Record<DeptCode, FBHR>,
  deptTargets: PolicyTarget[],
  exceptions: PolicyException[],
): PolicyImpact {
  const costs = feeComparisons(services, fbhr, deptTargets, exceptions);
  let totalCost = 0, intendedRevenue = 0, currentRevenue = 0;
  for (const c of costs) {
    totalCost += c.annualCost;
    intendedRevenue += c.annualCost * (c.target / 100);
    currentRevenue += c.annualRevenue;
  }
  return {
    totalCost,
    intendedRevenue,
    currentRevenue,
    overallPct: totalCost > 0 ? (intendedRevenue / totalCost) * 100 : 0,
    subsidy: Math.max(0, totalCost - intendedRevenue),
    recoverableGap: Math.max(0, intendedRevenue - currentRevenue),
  };
}
