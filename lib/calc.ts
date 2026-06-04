import type {
  CapAllocation, DeptCode, FeeRowKind, OperatingLine,
  PolicyException, PolicyTarget, ProductiveHoursRow, Service,
} from "./types";
import { FEE_DEPTS } from "./data/departments";

/* ---------- Build Model derivations ----------
 * The four input nodes (Labor, Operating, Cost Allocation, Volume)
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
 *  Cost (totalComp) is `Σ operatingLine.amount where costType="Labor"
 *  && include && dept=D` — the labor row amounts already bake in
 *  salary × fte, so no further weighting is needed.
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
  // Labor-classified rows live in the same OperatingLine[] but feed
  // the labor numerator (deptLabor → directRate), not the operating
  // denominator. Skip them here so FBHR doesn't double-count
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

/** Recovery target for a service: dept-level policy unless overridden by
 *  an exception. Exceptions match by stable `serviceId` first (the way
 *  every new exception is authored after the dropdown lands) and fall
 *  back to a case-insensitive fee-name match for legacy data — saved
 *  studies authored before the field existed only carry `fee`. */
function targetFor(
  service: Service,
  deptTargets: PolicyTarget[],
  exceptions: PolicyException[],
): number {
  // serviceId match wins outright when present and matches this row.
  const byId = exceptions.find((e) => e.serviceId === service.id);
  if (byId) return byId.target;
  // Name match for legacy exceptions only — skip any row that carries
  // a serviceId so an id-backed exception for a *different* service
  // can't accidentally hijack a row that happens to share a name.
  const byName = exceptions.find(
    (e) => !e.serviceId && e.fee.toLowerCase() === service.name.toLowerCase(),
  );
  if (byName) return byName.target;
  const t = deptTargets.find((p) => p.dept === service.dept);
  return t?.target ?? service.target ?? 100;
}

/** Gate: does this fee row participate in recovery aggregates?
 *
 *  Lifecycle gates (apply to every rowKind):
 *    - status "deleted" / "not-evaluated" / "moved" → NOT recoverable.
 *      Deleted and not-evaluated are obvious; "moved" rows are leaving
 *      the source dept this cycle so their forward-looking recovery
 *      math belongs to the destination, not the origin.
 *
 *  RowKind rules (when the lifecycle gate hasn't already excluded):
 *    - "flat"     → recoverable. The legacy default.
 *    - any other  → recoverable only when fee > 0 (a representative
 *      numeric value is "explicitly present"). This is the escape
 *      hatch: a deposit / T&M / pass-through / statutory / formula row
 *      with an analyst-supplied fee value DOES contribute to
 *      currentRevenue (fee × volume) because the value is real money
 *      being collected. Without a numeric fee there's nothing
 *      meaningful to roll up. Formula rows in particular treat their
 *      `fee` as the representative-scenario anchor (e.g., bldg-sfr's
 *      $13,500 typical-case fee at $1.5M valuation).
 *
 *  The structured `formula` field doesn't affect this gate — it
 *  controls rendering only (see summarizeFee in lib/feeDisplay.ts),
 *  never math.
 *
 *  Non-recoverable rows still flow through serviceCosts /
 *  feeComparisons so per-row UI (cost, recommended, uplift) keeps
 *  rendering for display + audit. Only the policyImpact /
 *  buildDeptRollup aggregates filter on this flag. */
export function isRecoverableFeeRow(service: Service): boolean {
  const status = service.status ?? "existing";
  if (status === "deleted" || status === "not-evaluated" || status === "moved") {
    return false;
  }
  const kind = feeRowKind(service);
  if (kind === "flat") return true;
  return service.fee > 0;
}

/** Derive a service's FeeRowKind from its structured formula.
 *
 *  `formula` is the single source of truth. The four structured-formula
 *  kinds (tiered-valuation / percentage / per-unit / expression) collapse
 *  to `"formula"`; the rest pass through 1:1. No formula → `"flat"`. */
export function feeRowKind(service: Service): FeeRowKind {
  const f = service.formula;
  if (!f) return "flat";
  switch (f.kind) {
    case "tiered-valuation":
    case "percentage":
    case "per-unit":
    case "expression":
      return "formula";
    case "deposit":            return "deposit";
    case "time-and-materials": return "time-and-materials";
    case "pass-through":       return "pass-through";
    case "statutory":          return "statutory";
  }
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
  /** Derived from isRecoverableFeeRow(service). When false, this row is
   *  excluded from policyImpact + buildDeptRollup aggregates. Per-row
   *  fields above (annualCost, annualRevenue, recommended, annualUplift)
   *  are still computed so per-row UI keeps working; only aggregates
   *  filter on this flag. */
  recoverable: boolean;
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
      recoverable: isRecoverableFeeRow(svc),
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
  // Skip non-recoverable rows (deposit/T&M/pass-through/statutory/formula
  // without a numeric fee anchor + deleted/not-evaluated/moved). They
  // flow through the per-row UI but don't pollute the aggregate
  // recovery math. See isRecoverableFeeRow for the gate.
  let totalCost = 0, intendedRevenue = 0, currentRevenue = 0;
  for (const c of comparisons) {
    if (!c.recoverable) continue;
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
