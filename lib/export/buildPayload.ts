/* Assembles the single payload object that drives both the Excel exporter and
 * the print-friendly Fee Study PDF route. Pulls from the live BuildContext
 * state so the export always reflects the current edits + imports. */

import type {
  DeptCode, OperatingLine, OpCategory, PolicyException, PolicyTarget,
  ProductiveHoursRow, Service, VolumeRow, CapPool, FeeScheduleStatus,
} from "@/lib/types";
import type {
  FeeComparison, PolicyImpact, ServiceCost,
} from "@/lib/calc";
import type { Domain } from "@/lib/store";
import type { SourceLineage, UnmappedRow } from "@/lib/parse";
import { DEPTS, FEE_DEPTS } from "@/lib/data/departments";
import { fmt } from "@/lib/format";

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
  /** What full cost recovery (100% of unit cost × volume) would yield —
   *  equal to totalCost. Surfaced as its own field so the summary table
   *  reads naturally without consumers having to remember the equality. */
  fullCostRevenue: number;
  /** currentRevenue − totalCost. Positive = surplus, negative = subsidy. */
  surplusSubsidy: number;
  /** Revenue at the recommended schedule = Σ calculatedRecommendedFee × volume
   *  across recoverable rows in the dept. */
  recommendedRevenue: number;
  /** recommendedRevenue / totalCost. */
  recommendedRecoveryPct: number;
}

/** One functional bucket inside a department — a subcategory grouping
 *  ("Plan Check", "Inspections", "Discretionary Permits", …) used by
 *  the department analysis sections to summarize cost and recovery at
 *  a level coarser than the per-fee table. */
interface ExportFunctionalBucket {
  dept: DeptCode;
  bucket: string;
  serviceCount: number;
  hours: number;
  annualCost: number;
  currentRevenue: number;
  recommendedRevenue: number;
  recoveryPct: number;
}

interface ExportDeptBuckets {
  dept: DeptCode;
  deptName: string;
  buckets: ExportFunctionalBucket[];
}

/** Row identity for the fee-establishment narrative (new / deleted / moved
 *  / restructured fees this cycle). */
interface ExportFeeEstablishmentRow {
  id: string;
  feeNo?: string;
  name: string;
  dept: DeptCode;
  category?: string;
  rationale: string;
  movedToDept?: DeptCode;
}

interface ExportFeeEstablishment {
  added: ExportFeeEstablishmentRow[];
  deleted: ExportFeeEstablishmentRow[];
  moved: ExportFeeEstablishmentRow[];
  restructured: ExportFeeEstablishmentRow[];
}

interface ExportCostRecoveryOutcome {
  dept: DeptCode;
  deptName: string;
  totalCost: number;
  currentRevenue: number;
  currentRecoveryPct: number;
  policyTarget: number;
  recommendedRevenue: number;
  recommendedRecoveryPct: number;
  netChange: number;
  residualSubsidy: number;
}

interface ExportFeeDetailRow {
  id: string;
  feeNo?: string;
  name: string;
  dept: DeptCode;
  category: string;
  subcategory?: string;
  unit?: string;
  status?: FeeScheduleStatus;
  hours: number;
  volume: number;
  fee: number;
  unitCost: number;
  recommended: number;
  target: number;
  recoveryPct: number;
  annualCost: number;
  annualRevenue: number;
  annualRecommendedRevenue: number;
  uplift: number;
}

interface ExportFeeDetailCategory {
  category: string;
  rows: ExportFeeDetailRow[];
  subtotal: {
    annualCost: number;
    annualRevenue: number;
    annualRecommendedRevenue: number;
    uplift: number;
  };
}

interface ExportFeeDetailGroup {
  dept: DeptCode;
  deptName: string;
  categories: ExportFeeDetailCategory[];
  total: {
    annualCost: number;
    annualRevenue: number;
    annualRecommendedRevenue: number;
    uplift: number;
  };
}

interface ExportFbhrBucket {
  label: string;
  dollars: number;
  perHour: number;
}

interface ExportFbhrDeptDetail {
  dept: DeptCode;
  deptName: string;
  positions: number;
  fte: number;
  productiveHoursPerFte: number;
  totalProductiveHours: number;
  buckets: ExportFbhrBucket[];
  totalCost: number;
  fbhr: number;
}

interface ExportPeerSurveyAgencyValue {
  agency: string;
  value: number | null;
  valueText?: string;
  note?: string;
  comparable: boolean;
}

interface ExportPeerSurveyRow {
  id: string;
  feeNo?: string;
  name: string;
  dept: DeptCode;
  category: string;
  unit?: string;
  ourFee: number;
  peerMedian: number;
  peerCount: number;
  varianceVsMedian: number | null;
  values: ExportPeerSurveyAgencyValue[];
  notes: string[];
}

interface ExportPeerSurveyGroup {
  dept: DeptCode;
  deptName: string;
  rows: ExportPeerSurveyRow[];
}

interface ExportDisclaimer {
  heading: string;
  body: string;
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
  deptBuckets: ExportDeptBuckets[];
  feeEstablishment: ExportFeeEstablishment;
  costRecoveryOutcomes: ExportCostRecoveryOutcome[];
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
  feeDetailByDept: ExportFeeDetailGroup[];
  fbhrDetail: ExportFbhrDeptDetail[];
  peerSurveyByDept: ExportPeerSurveyGroup[];
  disclaimers: ExportDisclaimer[];
  methodology: { heading: string; body: string }[];
  assumptions: { label: string; value: string }[];
}

/* The model state slice + derived values needed to build the payload. We
 * accept a plain object instead of useBuildState() so this stays a pure
 * function (callable from anywhere — server, tests, the print route). */
interface ExportInput {
  productiveHours: ProductiveHoursRow[];
  operating: OperatingLine[];
  capPools: CapPool[];
  volume: VolumeRow[];
  services: Service[];
  policyTargets: PolicyTarget[];
  policyExceptions: PolicyException[];
  pendingReview: Record<Domain, UnmappedRow[]>;
  lineage: Record<string, SourceLineage>;
  /** Active jurisdiction context — populated by the caller from
   *  useActiveJurisdiction() / useActiveFiscalYear(). Pure function;
   *  doesn't touch the React tree or the store directly. */
  jurisdiction: {
    name: string;
    fiscal: string;
    preparedBy: string;
    peers: string[];
  };
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

const ORDER: DeptCode[] = FEE_DEPTS;

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
  volume:    "Volume of Activity",
  cap:       "Overhead Cost Allocation",
};

export function buildExportPayload(input: ExportInput): ExportPayload {
  const { productiveHours, services, derived, policyTargets, policyExceptions, capPools } = input;

  const recoverableComparisons = derived.comparisons.filter((c) => c.recoverable);
  const totalCost = derived.impact.totalCost;
  const totalRevenue = derived.impact.currentRevenue;
  const potentialUplift = recoverableComparisons.reduce((a, c) => a + Math.max(0, c.annualUplift), 0);
  const fte = productiveHours.reduce((a, p) => a + p.fte, 0);

  const cover: ExportCover = {
    cityName: input.jurisdiction.name,
    fiscal: input.jurisdiction.fiscal,
    preparedBy: input.jurisdiction.preparedBy,
    peers: input.jurisdiction.peers,
    generatedAt: new Date().toISOString(),
  };

  const summary: ExportSummary = {
    services: services.length,
    positions: productiveHours.length,
    fte,
    totalCost,
    currentRevenue: totalRevenue,
    recoveryGap: Math.max(0, derived.impact.recoverableGap),
    recoveryPct: totalCost > 0 ? (totalRevenue / totalCost) * 100 : 0,
    potentialUplift,
    intendedRecoveryPct: derived.impact.overallPct,
    annualSubsidy: derived.impact.subsidy,
  };

  // Only emit a section for depts the active jurisdiction actually
  // models — LAH ships only Planning / Building / Engineering, so the
  // Parks / PD / Fire entries that exist in the dept registry would
  // print as empty sections.
  const activeDepts = ORDER.filter((d) => {
    const labor = derived.labor[d];
    return labor.positions > 0 || derived.costs.some((c) => c.dept === d);
  });

  const deptSummaries: ExportDeptSummary[] = activeDepts.map((d) => {
    const labor = derived.labor[d];
    const f = derived.fbhr[d];
    const deptComparisons = recoverableComparisons.filter((c) => c.dept === d);
    const deptTotalCost = deptComparisons.reduce((a, c) => a + c.annualCost, 0);
    const deptRev = deptComparisons.reduce((a, c) => a + c.annualRevenue, 0);
    const recommendedRev = deptComparisons
      .reduce((a, c) => a + c.calculatedRecommendedFee * c.volume, 0);
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
      fullCostRevenue: deptTotalCost,
      surplusSubsidy: deptRev - deptTotalCost,
      recommendedRevenue: recommendedRev,
      recommendedRecoveryPct: deptTotalCost > 0 ? (recommendedRev / deptTotalCost) * 100 : 0,
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
    .filter((c) => c.recoverable && c.annualUplift !== 0)
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
    const pos = productiveHours.find((p) => p.id === id);
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

  // ── Functional buckets per department ─────────────────────────────────
  // Groups each dept's fees by `subcategory` (Plan Check, Inspections,
  // Discretionary Permits, …) so the department analysis section can
  // narrate at a level coarser than the per-fee table. Falls back to
  // "Other" when a fee row carries no subcategory.
  const deptBuckets: ExportDeptBuckets[] = activeDepts.map((d) => {
    const buckets = new Map<string, ExportFunctionalBucket>();
    for (const c of recoverableComparisons.filter((c) => c.dept === d)) {
      const svc = services.find((s) => s.id === c.id);
      const label = svc?.subcategory ?? svc?.category ?? "Other";
      const b = buckets.get(label) ?? {
        dept: d, bucket: label,
        serviceCount: 0, hours: 0,
        annualCost: 0, currentRevenue: 0, recommendedRevenue: 0,
        recoveryPct: 0,
      };
      b.serviceCount += 1;
      b.hours += c.hours * c.volume;
      b.annualCost += c.annualCost;
      b.currentRevenue += c.annualRevenue;
      if (c.recoverable) {
        b.recommendedRevenue += c.calculatedRecommendedFee * c.volume;
      } else {
        b.recommendedRevenue += c.annualRevenue;
      }
      buckets.set(label, b);
    }
    const arr = Array.from(buckets.values()).map((b) => ({
      ...b,
      recoveryPct: b.annualCost > 0 ? (b.currentRevenue / b.annualCost) * 100 : 0,
    }));
    arr.sort((a, b) => b.annualCost - a.annualCost);
    return {
      dept: d,
      deptName: DEPTS[d].name.replace(" Administration", ""),
      buckets: arr,
    };
  });

  // ── Fee establishment narrative ────────────────────────────────────────
  // Buckets services by lifecycle status. "Restructured" picks up rows
  // that aren't flat-pricing (formula / deposit / T&M / pass-through /
  // statutory) without being lifecycle-flagged — those rows reshape
  // how the fee is billed even when they carry the existing status.
  const feeEstablishment: ExportFeeEstablishment = (() => {
    const added: ExportFeeEstablishmentRow[] = [];
    const deleted: ExportFeeEstablishmentRow[] = [];
    const moved: ExportFeeEstablishmentRow[] = [];
    const restructured: ExportFeeEstablishmentRow[] = [];
    for (const s of services) {
      const base: ExportFeeEstablishmentRow = {
        id: s.id,
        ...(s.feeNo ? { feeNo: s.feeNo } : {}),
        name: s.name,
        dept: s.dept,
        ...(s.category ? { category: s.category } : {}),
        rationale: "",
        ...(s.movedToDept ? { movedToDept: s.movedToDept } : {}),
      };
      const status = s.status ?? "existing";
      if (status === "new") {
        added.push({ ...base, rationale: lifecycleRationale("new", s) });
      } else if (status === "deleted") {
        deleted.push({ ...base, rationale: lifecycleRationale("deleted", s) });
      } else if (status === "moved") {
        moved.push({ ...base, rationale: lifecycleRationale("moved", s) });
      } else if (status === "renamed") {
        restructured.push({ ...base, rationale: lifecycleRationale("renamed", s) });
      } else {
        const kind = s.rowKind ?? "flat";
        if (kind !== "flat") {
          restructured.push({ ...base, rationale: rowKindRationale(s) });
        }
      }
    }
    return { added, deleted, moved, restructured };
  })();

  // ── Cost recovery outcomes by department ───────────────────────────────
  const costRecoveryOutcomes: ExportCostRecoveryOutcome[] = deptSummaries.map((d) => ({
    dept: d.dept,
    deptName: d.deptName,
    totalCost: d.totalCost,
    currentRevenue: d.currentRevenue,
    currentRecoveryPct: d.recoveryPct,
    policyTarget: d.target,
    recommendedRevenue: d.recommendedRevenue,
    recommendedRecoveryPct: d.recommendedRecoveryPct,
    netChange: d.recommendedRevenue - d.currentRevenue,
    residualSubsidy: Math.max(0, d.totalCost - d.recommendedRevenue),
  }));

  // ── Appendix A — full fee detail grouped by dept / category ────────────
  const feeDetailByDept: ExportFeeDetailGroup[] = activeDepts.map((d) => {
    const deptComparisons = derived.comparisons.filter((c) => c.dept === d);
    const grouped = new Map<string, ExportFeeDetailRow[]>();
    for (const c of deptComparisons) {
      const svc = services.find((s) => s.id === c.id);
      const cat = svc?.category ?? "Uncategorized";
      const annualRecRev = c.recoverable
        ? c.calculatedRecommendedFee * c.volume
        : c.annualRevenue;
      const uplift = annualRecRev - c.annualRevenue;
      const row: ExportFeeDetailRow = {
        id: c.id,
        ...(svc?.feeNo ? { feeNo: svc.feeNo } : {}),
        name: c.name,
        dept: c.dept,
        category: cat,
        ...(svc?.subcategory ? { subcategory: svc.subcategory } : {}),
        ...(svc?.unit ? { unit: svc.unit } : {}),
        ...(svc?.status ? { status: svc.status } : {}),
        hours: c.hours,
        volume: c.volume,
        fee: c.fee,
        unitCost: c.unitCost,
        recommended: c.recommended,
        target: c.target,
        recoveryPct: c.recoveryPct,
        annualCost: c.annualCost,
        annualRevenue: c.annualRevenue,
        annualRecommendedRevenue: annualRecRev,
        uplift,
      };
      const arr = grouped.get(cat) ?? [];
      arr.push(row);
      grouped.set(cat, arr);
    }
    const categories: ExportFeeDetailCategory[] = Array.from(grouped.entries())
      .map(([category, rows]) => {
        const subtotal = rows.reduce(
          (a, r) => ({
            annualCost: a.annualCost + r.annualCost,
            annualRevenue: a.annualRevenue + r.annualRevenue,
            annualRecommendedRevenue: a.annualRecommendedRevenue + r.annualRecommendedRevenue,
            uplift: a.uplift + r.uplift,
          }),
          { annualCost: 0, annualRevenue: 0, annualRecommendedRevenue: 0, uplift: 0 },
        );
        const sorted = [...rows].sort((a, b) => {
          if (a.feeNo && b.feeNo) return a.feeNo.localeCompare(b.feeNo, undefined, { numeric: true });
          return a.name.localeCompare(b.name);
        });
        return { category, rows: sorted, subtotal };
      })
      .sort((a, b) => b.subtotal.annualCost - a.subtotal.annualCost);
    const total = categories.reduce(
      (a, c) => ({
        annualCost: a.annualCost + c.subtotal.annualCost,
        annualRevenue: a.annualRevenue + c.subtotal.annualRevenue,
        annualRecommendedRevenue: a.annualRecommendedRevenue + c.subtotal.annualRecommendedRevenue,
        uplift: a.uplift + c.subtotal.uplift,
      }),
      { annualCost: 0, annualRevenue: 0, annualRecommendedRevenue: 0, uplift: 0 },
    );
    return {
      dept: d,
      deptName: DEPTS[d].name.replace(" Administration", ""),
      categories,
      total,
    };
  });

  // ── Appendix B — Fully Burdened Hourly Rate detail by functional bucket
  // Breaks each dept's annualized cost stack into the buckets that compose
  // FBHR: direct labor (salary + benefits), departmental operating expense
  // (broken out by operating category where data is present), and
  // allocated indirect overhead.
  const fbhrDetail: ExportFbhrDeptDetail[] = activeDepts.map((d) => {
    const labor = derived.labor[d];
    const f = derived.fbhr[d];
    const totalHours = f.productiveHours;

    // Operating by category for this dept — pulled from the raw operating
    // lines so the appendix shows the makeup of the bucket, not just the
    // aggregate $/hr that's already on the dept summary.
    const opByCategory = new Map<OpCategory, number>();
    for (const o of input.operating) {
      if (!o.include) continue;
      if (o.dept === d) {
        opByCategory.set(o.category, (opByCategory.get(o.category) ?? 0) + o.amount);
      }
    }
    // Shared operating (SHARED:CDS) is allocated by productive-hours share;
    // surface it as a single line so the appendix reconciles to the
    // dept-level operating total.
    const sharedTotal = input.operating
      .filter((o) => o.include && o.dept === "SHARED:CDS")
      .reduce((a, o) => a + o.amount, 0);
    const shareDenom = activeDepts.reduce(
      (a, code) => a + derived.fbhr[code].productiveHours, 0,
    );
    const sharedShare = shareDenom > 0 ? sharedTotal * (totalHours / shareDenom) : 0;

    const operatingBuckets: ExportFbhrBucket[] = Array.from(opByCategory.entries())
      .map(([cat, dollars]) => ({
        label: `Operating — ${cat}`,
        dollars,
        perHour: totalHours > 0 ? dollars / totalHours : 0,
      }))
      .sort((a, b) => b.dollars - a.dollars);

    if (sharedShare > 0) {
      operatingBuckets.push({
        label: "Operating — Shared dept services (allocated)",
        dollars: sharedShare,
        perHour: totalHours > 0 ? sharedShare / totalHours : 0,
      });
    }

    const buckets: ExportFbhrBucket[] = [
      {
        label: "Direct labor — salaries + benefits",
        dollars: f.directDollars,
        perHour: f.directRate,
      },
      ...operatingBuckets,
      {
        label: "Allocated indirect overhead (CAP)",
        dollars: f.capDollars,
        perHour: f.capRate,
      },
    ];

    return {
      dept: d,
      deptName: DEPTS[d].name.replace(" Administration", ""),
      positions: labor.positions,
      fte: labor.fte,
      productiveHoursPerFte: labor.fte > 0 ? labor.productiveHours / labor.fte : 0,
      totalProductiveHours: totalHours,
      buckets,
      totalCost: f.directDollars + f.operatingDollars + f.capDollars,
      fbhr: f.fbhr,
    };
  });

  // ── Appendix C — Peer survey rows with per-agency values ───────────────
  // For each fee where a peer median is on file, emit a per-agency row.
  // When a service carries the full `peerSurvey` array, use it verbatim;
  // otherwise fall back to a single synthetic row showing the median so
  // the table is still populated.
  const peerSurveyByDept: ExportPeerSurveyGroup[] = activeDepts
    .map((d) => {
      const rows: ExportPeerSurveyRow[] = services
        .filter((s) => s.dept === d && s.peer > 0)
        .map((s) => {
          const detail = s.peerSurvey ?? [];
          const values: ExportPeerSurveyAgencyValue[] = detail.length > 0
            ? detail.map((v) => ({
                agency: v.agency,
                value: v.valueNumber ?? null,
                ...(v.valueText ? { valueText: v.valueText } : {}),
                ...(v.sourceNote ? { note: v.sourceNote } : {}),
                comparable: v.comparable,
              }))
            : input.jurisdiction.peers.map((agency) => ({
                agency,
                value: null,
                note: `Surveyed median: ${fmt.dollars(s.peer)} (per-agency detail not loaded)`,
                comparable: true,
              }));
          const comparableCount = values.filter(
            (v) => v.comparable && v.value != null,
          ).length;
          const variance = s.peer > 0 ? ((s.fee - s.peer) / s.peer) * 100 : null;
          return {
            id: s.id,
            ...(s.feeNo ? { feeNo: s.feeNo } : {}),
            name: s.name,
            dept: s.dept,
            category: s.category ?? "Uncategorized",
            ...(s.unit ? { unit: s.unit } : {}),
            ourFee: s.fee,
            peerMedian: s.peer,
            peerCount: comparableCount > 0 ? comparableCount : (detail.length || input.jurisdiction.peers.length),
            varianceVsMedian: variance,
            values,
            notes: s.notes ?? [],
          };
        })
        .sort((a, b) => {
          if (a.feeNo && b.feeNo) return a.feeNo.localeCompare(b.feeNo, undefined, { numeric: true });
          return a.name.localeCompare(b.name);
        });
      return {
        dept: d,
        deptName: DEPTS[d].name.replace(" Administration", ""),
        rows,
      };
    })
    .filter((g) => g.rows.length > 0);

  // ── Disclaimers / data-source language ────────────────────────────────
  const disclaimers: ExportDisclaimer[] = [
    {
      heading: "Reliance on adopted City records",
      body:
        "The cost results in this report are derived from the City's adopted budget, payroll records, " +
        "Cost Allocation Plan, published fee schedule, and operational workload records for the fiscal year analyzed. " +
        "The reasonableness of the results depends on the accuracy of those underlying records. " +
        "Material changes in compensation, staffing structure, contracted services, or overhead allocation methodology " +
        "subsequent to the study period will affect calculated rates.",
    },
    {
      heading: "Average-cost methodology",
      body:
        "Recommended fees are calculated at the estimated reasonable average cost of providing each service. " +
        "Effort required for an individual project may vary from the modeled average; the methodology is intended " +
        "to produce defensible average-cost estimates suitable for use in establishing a published fee schedule, " +
        "not a project-specific cost determination.",
    },
    {
      heading: "Peer survey limitations",
      body:
        "Peer fees presented in this report reflect listed prices adopted by comparator jurisdictions. " +
        "Peer fees may understate the comparator's full cost of service where the comparator subsidizes service costs from " +
        "its general fund. Peer information is offered for context only and is not a substitute for cost-of-service analysis.",
    },
    {
      heading: "Policy determinations reserved",
      body:
        "Cost recovery targets, fee-specific exceptions, and the timing of fee adoption are policy determinations of the " +
        "City Council. The figures in this report calculate the cost of service and translate adopted recovery targets " +
        "into recommended fees; they do not set or alter those targets.",
    },
    {
      heading: "Statutorily capped fees",
      body:
        "Certain fees evaluated in this study are subject to statutory caps (for example, residential photovoltaic " +
        "permits under California Health & Safety Code §17951). Where the calculated full cost of service exceeds the " +
        "statutory cap, the recommended fee is presented at the statutory cap and the residual cost is reported as subsidy.",
    },
  ];

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
        "Peer cities used for comparator pricing: " + input.jurisdiction.peers.join(", ") +
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
    { label: "Fiscal year",        value: input.jurisdiction.fiscal },
    { label: "Productive hours/yr (default)", value: "1,720" },
    { label: "Indirect departments", value: "7 step-down centers (Council, City Mgr, Clerk, Finance, Attorney, Insurance, Committees)" },
    { label: "Direct fee depts",   value: activeDepts.join(", ") },
    { label: "Recommended rounding", value: "Nearest $5" },
    { label: "Subsidy fund",       value: "General Fund — recovery shortfall is implicitly subsidized when target < 100%" },
    { label: "Peer cities",        value: input.jurisdiction.peers.join(", ") },
    { label: "Operating shared split", value: `Productive-hours share across ${activeDepts.join(" / ")}` },
  ];

  return {
    cover, summary, deptSummaries, deptBuckets,
    feeEstablishment, costRecoveryOutcomes,
    feeSchedule, costOfService,
    recommendations, benchmarks, reviewFlags, lineage,
    feeDetailByDept, fbhrDetail, peerSurveyByDept, disclaimers,
    policy: {
      targets: policyTargets,
      exceptions: policyExceptions,
      impact: derived.impact,
    },
    methodology, assumptions,
  };
}

function lifecycleRationale(
  status: "new" | "deleted" | "moved" | "renamed",
  s: Service,
): string {
  const cat = s.category ? ` (${s.category})` : "";
  switch (status) {
    case "new":
      return s.rowKind && s.rowKind !== "flat"
        ? `New fee${cat}, billed as ${rowKindLabel(s.rowKind)}.`
        : `New fee${cat} introduced this cycle to recover an existing service cost.`;
    case "deleted":
      return s.notes?.[0]
        ? `Removed this cycle: ${s.notes[0]}`
        : `Removed this cycle — fee no longer charged.`;
    case "moved":
      return s.movedToDept
        ? `Moved to ${s.movedToDept} this cycle; forward-looking recovery accrues to the destination department.`
        : `Moved to another department this cycle.`;
    case "renamed":
      return `Renamed this cycle; legal authority and underlying cost basis carried forward.`;
  }
}

function rowKindRationale(s: Service): string {
  const cat = s.category ? ` in ${s.category}` : "";
  return `Pricing restructured${cat}: billed as ${rowKindLabel(s.rowKind ?? "flat")}.`;
}

function rowKindLabel(kind: NonNullable<Service["rowKind"]>): string {
  switch (kind) {
    case "flat":              return "a flat fee";
    case "formula":           return "a formula (tiered / percentage / per-unit)";
    case "deposit":           return "a deposit, with balance billed at actual cost";
    case "time-and-materials":return "time-and-materials at the published hourly rate";
    case "pass-through":      return "a pass-through of third-party cost";
    case "statutory":         return "a statutorily-capped fee";
  }
}
