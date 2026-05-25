import type {
  CapAllocation, DeptCode, OperatingLine,
  PolicyException, PolicyTarget, ProductiveHoursRow, Service,
} from "./types";
import { FEE_DEPTS } from "./data/departments";

/* ---------- Build Model derivations ----------
 * The four input nodes (Direct Labor, Operating, Cost Allocation, Volume)
 * roll up into per-dept FBHR, which is then applied to each service in
 * Cost of Service. All functions here are pure.
 *
 * FEE_DEPTS — the canonical list of fee-bearing departments — lives in
 * lib/data/departments.ts so the registry stays the single source of
 * truth and adding a department doesn't require touching this file. */

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

/** Per-dept labor cost + productive-hours roll-up.
 *
 *  PR-E flipped the cost source from positions to operating-labor rows.
 *  Cost (totalComp) is now `Σ operatingLine.amount where costType="Labor"
 *  && include && dept=D` — the labor row amounts already bake in
 *  salary × fte (per PR-D's buildLaborLinesFromPositions) so no further
 *  weighting is needed.
 *
 *  Hours come from the productiveHours slice: `Σ row.hours × row.fte`
 *  per dept. `fte` and `positions` (role count) are also rolled up from
 *  productiveHours so the DeptLabor shape stays meaningful for display
 *  surfaces that still show roster-style metrics. */
export function deptLabor(
  operatingLines: OperatingLine[],
  productiveHours: ProductiveHoursRow[],
): Record<DeptCode, DeptLabor> {
  const out = {} as Record<DeptCode, DeptLabor>;
  for (const d of FEE_DEPTS) {
    out[d] = { dept: d, fte: 0, positions: 0, totalComp: 0, productiveHours: 0, directRate: 0 };
  }
  // Cost: labor-classified, included rows only.
  for (const line of operatingLines) {
    if (line.costType !== "Labor") continue;
    if (!line.include) continue;
    const row = out[line.dept as DeptCode];
    if (!row) continue;
    row.totalComp += line.amount;
  }
  // Hours: from the productive-hours slice. Defensive on unknown depts.
  for (const ph of productiveHours) {
    const row = out[ph.dept];
    if (!row) continue;
    row.positions += 1;
    row.fte += ph.fte;
    row.productiveHours += ph.hours * ph.fte;
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
  // PR-D: labor-classified rows live in the same OperatingLine[] but
  // feed the labor numerator (deptLabor → directRate), not the
  // operating denominator. Skip them here so FBHR doesn't double-count
  // salaries/benefits.
  const included = lines.filter((l) => l.include && l.costType !== "Labor");
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
function targetFor(
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

/** PR-L3 gate: does this fee row participate in recovery aggregates?
 *
 *  Returns true only for "flat" or "formula" rowKinds in lifecycle
 *  status "existing" / "new" / "renamed" / "moved". Returns false for:
 *    - rowKind "deposit" / "time-and-materials" / "pass-through" /
 *      "statutory" — `fee × volume` doesn't represent realized
 *      revenue for these, so summing them into currentRevenue /
 *      intendedRevenue / recoverableGap produces nonsense.
 *    - status "deleted" / "not-evaluated" — the row exists in the
 *      catalog for audit but shouldn't influence forward-looking
 *      recovery math.
 *
 *  Undefined fields default to the legacy semantics ("flat" + "existing")
 *  so every existing seed row is countable — PR-L3 changes ZERO
 *  numbers for the current LAH / Maplewood baselines.
 *
 *  Non-countable rows still flow through serviceCosts / feeComparisons
 *  so per-row UI (cost, recommended, uplift) keeps rendering for
 *  display + audit. Only the policyImpact / buildDeptRollup totals
 *  filter them out. */
export function isCountableFee(service: Service): boolean {
  const kind = service.rowKind ?? "flat";
  if (kind !== "flat" && kind !== "formula") return false;
  const status = service.status ?? "existing";
  if (status === "deleted" || status === "not-evaluated") return false;
  return true;
}

export interface FeeComparison extends ServiceCost {
  recoveryPct: number;
  target: number;
  /** Full-precision recommended fee = unitCost × (target/100). Use this for
   *  all financial reconciliation math (Target Revenue, Net Adoption Impact,
   *  Recoverable Revenue, totals). Never round before aggregating. */
  calculatedRecommendedFee: number;
  /** calculatedRecommendedFee rounded to nearest $1 for display/export only.
   *  NEVER use for financial math — totals will drift from policy intent. */
  recommended: number;
  /** Net uplift if recommended fee adopted, using full precision:
   *  (calculatedRecommendedFee − fee) × volume. Unclamped — can be negative
   *  when current fee exceeds target. Summing this across all rows reconciles
   *  with Recovery Policy's recoverableGap (same underlying math). */
  annualUplift: number;
  /** PR-L3: derived from isCountableFee(service). When false, this row
   *  is excluded from policyImpact + buildDeptRollup aggregates. Per-row
   *  fields above (annualCost, annualRevenue, recommended, annualUplift)
   *  are still computed so per-row UI keeps working; only aggregates
   *  filter on this flag. */
  countable: boolean;
}

export function feeComparisons(
  costs: ServiceCost[],
  services: Service[],
  deptTargets: PolicyTarget[],
  exceptions: PolicyException[],
): FeeComparison[] {
  const serviceById = new Map(services.map((s) => [s.id, s]));
  return costs.map((c) => {
    const svc = serviceById.get(c.id)!;
    const target = targetFor(svc, deptTargets, exceptions);
    const calculatedRecommendedFee = (c.unitCost * target) / 100;
    const recommended = Math.round(calculatedRecommendedFee);
    const recoveryPct = c.unitCost > 0 ? (c.fee / c.unitCost) * 100 : 0;
    return {
      ...c,
      recoveryPct,
      target,
      calculatedRecommendedFee,
      recommended,
      annualUplift: (calculatedRecommendedFee - c.fee) * c.volume,
      countable: isCountableFee(svc),
    };
  });
}

export interface PolicyImpact {
  totalCost: number;
  intendedRevenue: number;
  currentRevenue: number;
  /** intendedRevenue / totalCost as a percent. */
  overallPct: number;
  /** totalCost − intendedRevenue: the policy-driven subsidy (always ≥ 0
   *  in practice; clamped because over-recovery shouldn't read as negative
   *  subsidy in the UI). */
  subsidy: number;
  /** intendedRevenue − currentRevenue: the closeable gap. UNCLAMPED so it
   *  reconciles exactly with Fee Schedule's Net Adoption Impact. Negative
   *  values mean current revenue already exceeds policy intent. */
  recoverableGap: number;
}

export function policyImpact(comparisons: FeeComparison[]): PolicyImpact {
  // PR-L3: skip non-countable rows (deposit / T&M / pass-through /
  // statutory + deleted / not-evaluated). They flow through the
  // per-row UI but don't pollute the aggregate recovery math.
  let totalCost = 0, intendedRevenue = 0, currentRevenue = 0;
  for (const c of comparisons) {
    if (!c.countable) continue;
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
    recoverableGap: intendedRevenue - currentRevenue,
  };
}
