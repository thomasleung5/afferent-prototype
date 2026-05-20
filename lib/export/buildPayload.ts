/* Assembles the single payload object that drives both the Excel exporter and
 * the print-friendly Fee Study PDF route. Pulls from the live BuildContext
 * state so the export always reflects the current edits + imports. */

import type {
  DeptCode, OperatingLine, PolicyException, PolicyTarget,
  Position, Service, WorkloadRow, CapPool,
} from "@/lib/types";
import type {
  FeeComparison, PolicyImpact, ServiceCost,
} from "@/lib/calc";
import type { Domain } from "@/lib/store";
import type { SourceLineage, UnmappedRow } from "@/lib/parse";
import { DEPTS } from "@/lib/data/departments";
import { CITY } from "@/lib/data/city";

interface ExportCover {
  cityName: string;
  fiscal: string;
  preparedBy: string;
  peers: string[];
  generatedAt: string;
}

interface ExportSummary {
  services: number;
  positions: number;
  fte: number;
  totalCost: number;
  currentRevenue: number;
  recoveryGap: number;
  recoveryPct: number;
  potentialUplift: number;
  intendedRecoveryPct: number;
  annualSubsidy: number;
}

interface ExportDeptSummary {
  dept: DeptCode;
  deptName: string;
  positions: number;
  fte: number;
  productiveHours: number;
  directRate: number;
  operatingRate: number;
  capRate: number;
  fbhr: number;
  directDollars: number;
  operatingDollars: number;
  capDollars: number;
  totalCost: number;
  currentRevenue: number;
  recoveryPct: number;
  target: number;
}

interface ExportFeeRow {
  id: string;
  name: string;
  dept: DeptCode;
  hours: number;
  volume: number;
  fee: number;
  unitCost: number;
  recommended: number;
  target: number;
  recoveryPct: number;
  uplift: number;
  peerMedian: number;
  /** "high" / "med" / "low" — driven by the same rules as the Fee Schedule screen. */
  confidence: "high" | "med" | "low";
}

interface ExportCostRow {
  id: string;
  name: string;
  dept: DeptCode;
  hours: number;
  fbhr: number;
  unitCost: number;
  volume: number;
  annualCost: number;
  annualRevenue: number;
}

interface ExportRecommendation extends ExportFeeRow {
  priority: "high" | "med" | "low" | "none";
  action: string;
  rationale: string[];
}

interface ExportBenchmarkRow {
  id: string;
  name: string;
  dept: DeptCode;
  fee: number;
  peerMedian: number;
  varianceVsMedian: number;
  varianceVsCost: number;
}

interface ExportReviewFlag {
  domain: Domain;
  label: string;
  count: number;
  unmapped: UnmappedRow[];
}

interface ExportLineageRow {
  domain: Domain;
  id: string;
  label: string;
  lineage: SourceLineage;
}

export interface ExportPayload {
  cover: ExportCover;
  summary: ExportSummary;
  deptSummaries: ExportDeptSummary[];
  feeSchedule: ExportFeeRow[];
  costOfService: ExportCostRow[];
  recommendations: ExportRecommendation[];
  benchmarks: ExportBenchmarkRow[];
  policy: {
    targets: PolicyTarget[];
    exceptions: PolicyException[];
    impact: PolicyImpact;
  };
  reviewFlags: ExportReviewFlag[];
  lineage: ExportLineageRow[];
  methodology: { heading: string; body: string }[];
  assumptions: { label: string; value: string }[];
}

/* The model state slice + derived values needed to build the payload. We
 * accept a plain object instead of useBuildState() so this stays a pure
 * function (callable from anywhere — server, tests, the print route). */
export interface ExportInput {
  positions: Position[];
  operating: OperatingLine[];
  capPools: CapPool[];
  workload: WorkloadRow[];
  services: Service[];
  policyTargets: PolicyTarget[];
  policyExceptions: PolicyException[];
  pendingReview: Record<Domain, UnmappedRow[]>;
  lineage: Record<string, SourceLineage>;
  derived: {
    labor: Record<DeptCode, { fte: number; positions: number; productiveHours: number; totalComp: number; directRate: number }>;
    fbhr: Record<DeptCode, {
      directRate: number; operatingRate: number; capRate: number; fbhr: number;
      productiveHours: number;
      directDollars: number; operatingDollars: number; capDollars: number;
    }>;
    costs: ServiceCost[];
    comparisons: FeeComparison[];
    impact: PolicyImpact;
  };
}

const ORDER: DeptCode[] = ["PLAN", "BLDG", "ENG"];

function priorityFor(impact: number): "high" | "med" | "low" | "none" {
  if (impact > 25000) return "high";
  if (impact >  5000) return "med";
  if (impact > 0)     return "low";
  return "none";
}

function confidenceFor(c: FeeComparison): "high" | "med" | "low" {
  if (c.volume === 0 || c.hours === 0)        return "low";
  if (c.recoveryPct > 200 || c.hours < 0.1)   return "low";
  if (c.volume < 5 || c.unitCost < 50)        return "med";
  return "high";
}

function actionFor(uplift: number): string {
  if (uplift > 25000) return "Raise to recommended";
  if (uplift >  5000) return "Raise to recommended";
  if (uplift >     0) return "Consider raising";
  if (uplift < -1000) return "Lower toward target";
  return "Hold — at target";
}

function rationaleFor(c: FeeComparison): string[] {
  const out: string[] = [];
  if (c.recoveryPct < 50 && c.fee > 0) {
    out.push(`Current fee recovers only ${c.recoveryPct.toFixed(0)}% of cost.`);
  }
  if (c.fee === 0) out.push("No fee currently charged — full subsidy.");
  if (c.target < 100 && c.recoveryPct < c.target * 0.8) {
    out.push(`Recovery is below the ${c.target}% policy target.`);
  }
  if (c.volume > 50 && c.annualUplift > 10000) {
    out.push(`High volume (${c.volume.toLocaleString()}/yr) amplifies the per-unit gap.`);
  }
  if (out.length === 0 && c.annualUplift > 0) {
    out.push(`Service is under target by ${Math.max(0, Math.round(c.target - c.recoveryPct))} points.`);
  }
  return out;
}

const DOMAIN_LABEL: Record<Domain, string> = {
  positions: "Direct Labor",
  operating: "Operating",
  services:  "Services",
  fees:      "Fee Schedule",
  workload:  "Workload",
  cap:       "Overhead Cost Allocation",
};

export function buildExportPayload(input: ExportInput): ExportPayload {
  const { positions, services, derived, policyTargets, policyExceptions, capPools } = input;

  const totalCost = derived.costs.reduce((a, c) => a + c.annualCost, 0);
  const totalRevenue = derived.costs.reduce((a, c) => a + c.annualRevenue, 0);
  const potentialUplift = derived.comparisons.reduce((a, c) => a + Math.max(0, c.annualUplift), 0);
  const fte = positions.reduce((a, p) => a + p.fte, 0);

  const cover: ExportCover = {
    cityName: CITY.name,
    fiscal: CITY.fiscal,
    preparedBy: CITY.preparedBy,
    peers: CITY.peers,
    generatedAt: new Date().toISOString(),
  };

  const summary: ExportSummary = {
    services: services.length,
    positions: positions.length,
    fte,
    totalCost,
    currentRevenue: totalRevenue,
    recoveryGap: Math.max(0, totalCost - totalRevenue),
    recoveryPct: totalCost > 0 ? (totalRevenue / totalCost) * 100 : 0,
    potentialUplift,
    intendedRecoveryPct: derived.impact.overallPct,
    annualSubsidy: derived.impact.subsidy,
  };

  const deptSummaries: ExportDeptSummary[] = ORDER.map((d) => {
    const labor = derived.labor[d];
    const f = derived.fbhr[d];
    const deptCosts = derived.costs.filter((c) => c.dept === d);
    const deptTotalCost = deptCosts.reduce((a, c) => a + c.annualCost, 0);
    const deptRev = deptCosts.reduce((a, c) => a + c.annualRevenue, 0);
    const target = policyTargets.find((t) => t.dept === d)?.target ?? 100;
    return {
      dept: d,
      deptName: DEPTS[d].name.replace(" Administration", ""),
      positions: labor.positions,
      fte: labor.fte,
      productiveHours: labor.productiveHours,
      directRate: f.directRate,
      operatingRate: f.operatingRate,
      capRate: f.capRate,
      fbhr: f.fbhr,
      directDollars: f.directDollars,
      operatingDollars: f.operatingDollars,
      capDollars: f.capDollars,
      totalCost: deptTotalCost,
      currentRevenue: deptRev,
      recoveryPct: deptTotalCost > 0 ? (deptRev / deptTotalCost) * 100 : 0,
      target,
    };
  });

  const compByid = new Map(derived.comparisons.map((c) => [c.id, c]));

  const feeSchedule: ExportFeeRow[] = derived.comparisons.map((c) => {
    const svc = services.find((s) => s.id === c.id);
    return {
      id: c.id,
      name: c.name,
      dept: c.dept,
      hours: c.hours,
      volume: c.volume,
      fee: c.fee,
      unitCost: c.unitCost,
      recommended: c.recommended,
      target: c.target,
      recoveryPct: c.recoveryPct,
      uplift: c.annualUplift,
      peerMedian: svc?.peer ?? 0,
      confidence: confidenceFor(c),
    };
  });

  const costOfService: ExportCostRow[] = derived.costs.map((c) => ({
    id: c.id,
    name: c.name,
    dept: c.dept,
    hours: c.hours,
    fbhr: derived.fbhr[c.dept]?.fbhr ?? 0,
    unitCost: c.unitCost,
    volume: c.volume,
    annualCost: c.annualCost,
    annualRevenue: c.annualRevenue,
  }));

  const recommendations: ExportRecommendation[] = derived.comparisons
    .filter((c) => c.annualUplift !== 0)
    .map((c) => {
      const fee = feeSchedule.find((f) => f.id === c.id)!;
      return {
        ...fee,
        priority: priorityFor(c.annualUplift),
        action: actionFor(c.annualUplift),
        rationale: rationaleFor(c),
      };
    })
    .sort((a, b) => b.uplift - a.uplift);

  const benchmarks: ExportBenchmarkRow[] = services
    .filter((s) => s.peer > 0)
    .map((s) => {
      const c = compByid.get(s.id);
      const cost = c?.unitCost ?? 0;
      return {
        id: s.id,
        name: s.name,
        dept: s.dept,
        fee: s.fee,
        peerMedian: s.peer,
        varianceVsMedian: s.peer > 0 ? ((s.fee - s.peer) / s.peer) * 100 : 0,
        varianceVsCost:   cost > 0   ? ((s.fee - cost)  / cost)   * 100 : 0,
      };
    });

  const reviewFlags: ExportReviewFlag[] = (Object.keys(input.pendingReview) as Domain[])
    .map((domain) => ({
      domain,
      label: DOMAIN_LABEL[domain],
      count: input.pendingReview[domain].length,
      unmapped: input.pendingReview[domain],
    }))
    .filter((f) => f.count > 0);

  const lineage: ExportLineageRow[] = Object.entries(input.lineage).map(([id, l]) => {
    const svc = services.find((s) => s.id === id);
    const pos = positions.find((p) => p.id === id);
    const opLine = input.operating.find((o) => o.id === id);
    const pool = capPools.find((p) => p.id === id);
    const label = svc?.name ?? pos?.title ?? opLine?.line ?? pool?.pool ?? id;
    const domain: Domain =
      svc ? "services" :
      pos ? "positions" :
      opLine ? "operating" :
      pool ? "cap" : "services";
    return { domain, id, label, lineage: l };
  });

  const methodology = [
    {
      heading: "Approach",
      body:
        "Fully Burdened Hourly Rate (FBHR) per department is the sum of three slices: " +
        "direct labor $/hr (salary + benefits ÷ productive hours), operating $/hr (department non-labor spend ÷ productive hours), " +
        "and overhead $/hr (allocated indirect cost ÷ productive hours). " +
        "Each service's unit cost = hours per instance × FBHR; annual cost = unit cost × volume. " +
        "The fee is recommended at unit cost × recovery target, rounded to the nearest $5.",
    },
    {
      heading: "Overhead Cost Allocation",
      body:
        "Indirect departments (Council, City Manager, City Clerk, Finance, City Attorney, Insurance, Committees) are allocated " +
        "to direct fee-generating departments using a step-down method. Allocation bases are pool-specific " +
        "(FTE, square footage, IT seats, payroll transactions, agenda items) and documented in the Cost Allocation Plan inventory.",
    },
    {
      heading: "Recovery Policy",
      body:
        "Department-level recovery targets are set by Council and applied to all fees in that department, " +
        "unless overridden by a fee-specific exception (e.g. ADU permits to support housing policy). " +
        "Targets below 100% are intentionally subsidized by the General Fund.",
    },
    {
      heading: "Peer Comparison",
      body:
        "Peer cities used for comparator pricing: " + CITY.peers.join(", ") +
        ". Peer medians are sourced from publicly adopted fee schedules as of July 1, 2025. " +
        "Peer fees are listed prices and may understate full cost recovery if a peer subsidizes from general fund.",
    },
    {
      heading: "Productive Hours",
      body:
        "Productive hours per FTE per year are paid hours less holiday, leave, and training time. " +
        "The citywide default of 1,720 productive hours is used unless a position has been adjusted explicitly.",
    },
    {
      heading: "Conservation",
      body:
        "Every dollar of indirect cost in the CAP scope flows to either a direct department (recoverable through fees) " +
        "or is excluded by policy (public-benefit pools like Council and Boards & Committees). " +
        "The conservation check on the Cost of Service screen verifies Σ pools = Σ direct allocations.",
    },
  ];

  const assumptions: { label: string; value: string }[] = [
    { label: "Fiscal year",        value: CITY.fiscal },
    { label: "Productive hours/yr (default)", value: "1,720" },
    { label: "Indirect departments", value: "7 step-down centers (Council, City Mgr, Clerk, Finance, Attorney, Insurance, Committees)" },
    { label: "Direct fee depts",   value: ORDER.join(", ") },
    { label: "Recommended rounding", value: "Nearest $5" },
    { label: "Subsidy fund",       value: "General Fund — recovery shortfall is implicitly subsidized when target < 100%" },
    { label: "Peer cities",        value: CITY.peers.join(", ") },
    { label: "Operating shared split", value: "Productive-hours share across PLAN / BLDG / ENG" },
  ];

  return {
    cover, summary, deptSummaries, feeSchedule, costOfService,
    recommendations, benchmarks, reviewFlags, lineage,
    policy: {
      targets: policyTargets,
      exceptions: policyExceptions,
      impact: derived.impact,
    },
    methodology, assumptions,
  };
}
