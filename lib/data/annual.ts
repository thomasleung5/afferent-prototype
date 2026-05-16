// Annual Update data — cross-model change list and recovery deltas.
// Sourced from the FY 2026-27 annual refresh cycle (Los Altos Hills).

export type ConfLevel = "High" | "Medium" | "Medium-High" | "Low";

export interface AnnualChange {
  id: string;
  change: string;
  prior: string;
  current: string;
  impact: string;
  affected: string;
  confidence: ConfLevel;
  action: string;
  badge: string;
}

export const ANNUAL_CHANGES: AnnualChange[] = [
  { id: "c1",  change: "Planning salary & benefits increased 8.5%",
    prior: "$2.31M", current: "$2.51M", impact: "+$180K cost",
    affected: "Planning Review, Conditional Use Permit", confidence: "High",
    action: "Confirm salary mapping", badge: "Confirm" },
  { id: "c2",  change: "Building permit workload decreased 6%",
    prior: "577 permits", current: "542 permits", impact: "+$120K cost / unit",
    affected: "Building Plan Check, Building Inspection", confidence: "Medium",
    action: "Validate workload export", badge: "Needs review" },
  { id: "c3",  change: "City Attorney CAP allocation increased 10%",
    prior: "$180K", current: "$198K", impact: "+$18K across direct services",
    affected: "Planning, Building, Engineering", confidence: "Medium",
    action: "Legal review of recoverability", badge: "Legal review" },
  { id: "c4",  change: "Finance overhead allocation increased 5%",
    prior: "$485K", current: "$509K", impact: "+$24K",
    affected: "All direct service depts", confidence: "High",
    action: "Confirm allocation basis (accounting txns)", badge: "Confirm" },
  { id: "c5",  change: "Adopted fees unchanged since prior study",
    prior: "FY 25-26 schedule", current: "FY 25-26 schedule", impact: "Recovery drift +$420K",
    affected: "All fee items", confidence: "High",
    action: "Consider fee update for FY 26-27", badge: "High impact" },
  { id: "c6",  change: "Building fees unchanged",
    prior: "91% recovery", current: "83% recovery", impact: "−8 pts recovery",
    affected: "Building Plan Check, Inspection", confidence: "High",
    action: "Consider fee update", badge: "High impact" },
  { id: "c7",  change: "Fire inspection fee mapping changed",
    prior: "4 fees mapped", current: "3 fees mapped", impact: "Re-allocate 1 fee",
    affected: "Fire Prevention", confidence: "Low",
    action: "Review fee mapping", badge: "Low confidence" },
  { id: "c8",  change: "Productive hours assumption reused",
    prior: "1,720 hrs/yr", current: "1,720 hrs/yr", impact: "No change",
    affected: "All positions", confidence: "High",
    action: "Reused from baseline", badge: "Confirm" },
  { id: "c9",  change: "Planning Technician title changed",
    prior: "Planning Technician", current: "Planning Specialist", impact: "Mapping update only",
    affected: "3 services", confidence: "High",
    action: "Confirm title remap", badge: "Confirm" },
  { id: "c10", change: "Long-range planning excluded from recoverable base",
    prior: "Excluded", current: "Excluded", impact: "No change",
    affected: "Planning Admin", confidence: "High",
    action: "Reused exclusion", badge: "Confirm" },
  { id: "c11", change: "Encroachment permit volume +12%",
    prior: "151/yr", current: "169/yr", impact: "−$13K cost / unit",
    affected: "Encroachment Permit", confidence: "High",
    action: "Confirm permit system export", badge: "Confirm" },
  { id: "c12", change: "Insurance allocation reused",
    prior: "$400K", current: "$400K", impact: "No change",
    affected: "All direct service depts", confidence: "High",
    action: "Reused from baseline", badge: "Confirm" },
];

export const RECOVERY_DELTAS = {
  priorBlended:   72,
  currentBlended: 64,
  deltaPts:       -8,
};
