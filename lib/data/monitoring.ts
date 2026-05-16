// Revenue Monitoring seed data — operational layer after fee adoption.
// Static for now; deterministic so the page renders the same every refresh.

import type { DeptCode } from "../types";

export type Trend = "up" | "down" | "flat";
export type RecoveryStatus = "below" | "watch" | "on-track";

export interface DeptHealth {
  dept: DeptCode;
  target: number;
  current: number;
  drift: number;
  subsidy: number;
  trend: Trend;
  status: RecoveryStatus;
}

export interface DriftDriver {
  id: string;
  driver: string;
  area: string;
  annualImpact: number;
  evidence: string;
  action: string;
  actionHref?: string;
}

export type AlertSeverity = "high" | "stale" | "below" | "ready";

export interface RecoveryAlert {
  id: string;
  alert: string;
  dept: DeptCode;
  impact: number;
  trigger: string;
  action: string;
  severity: AlertSeverity;
}

export interface StaffAction {
  id: string;
  title: string;
  rationale: string;
  fiscalImpact: number;
  nextStep: string;
  nextHref?: string;
}

export interface QuarterPoint {
  q: string;
  recovery: number;
}

export const MONITORING_SUMMARY = {
  citywideRecovery: 57,
  policyTarget: 85,
  revenueDrift: -412_000,
  subsidyExposure: 333_000,
  feesBelowTarget: 25,
  lastModelUpdate: "Apr 18",
};

export const DEPT_HEALTH: DeptHealth[] = [
  { dept: "PLAN", target: 70,  current: 58, drift: -12, subsidy: 212_000, trend: "down", status: "below" },
  { dept: "BLDG", target: 100, current: 94, drift:  -6, subsidy:  58_000, trend: "down", status: "watch" },
  { dept: "ENG",  target: 85,  current: 73, drift: -12, subsidy:  63_000, trend: "down", status: "below" },
];

export const DRIFT_DRIVERS: DriftDriver[] = [
  {
    id: "DR-01",
    driver: "Salary and benefit growth",
    area: "Planning / Building",
    annualImpact: 148_000,
    evidence: "Labor rates increased 8.6% since study",
    action: "Refresh direct labor",
    actionHref: "/build/salary",
  },
  {
    id: "DR-02",
    driver: "Lower permit volume",
    area: "Building",
    annualImpact: 97_000,
    evidence: "SFR permits down 18% vs prior workload",
    action: "Review workload assumptions",
    actionHref: "/build/workload",
  },
  {
    id: "DR-03",
    driver: "Engineering contract costs",
    area: "Engineering",
    annualImpact: 81_000,
    evidence: "On-call review contract increased",
    action: "Update operating costs",
    actionHref: "/build/operating",
  },
  {
    id: "DR-04",
    driver: "Overhead allocation update",
    area: "Planning",
    annualImpact: 54_000,
    evidence: "Council / legislative support allocation increased",
    action: "Re-run cost allocation",
    actionHref: "/build/cap",
  },
  {
    id: "DR-05",
    driver: "Fee adoption lag",
    area: "All departments",
    annualImpact: 32_000,
    evidence: "14 approved fees not yet adopted",
    action: "Move to fee schedule",
    actionHref: "/build/feestudy",
  },
];

export const RECOVERY_ALERTS: RecoveryAlert[] = [
  {
    id: "AL-01",
    alert: "Site Development Hearing Review below target",
    dept: "PLAN",
    impact: 95_000,
    trigger: "Recovery 32 pts below policy",
    action: "Recalculate and prepare adoption package",
    severity: "high",
  },
  {
    id: "AL-02",
    alert: "Engineering Review of Building Permits at $0 current fee",
    dept: "ENG",
    impact: 116_000,
    trigger: "Cost exists but fee not adopted",
    action: "Add to fee schedule",
    severity: "high",
  },
  {
    id: "AL-03",
    alert: "Building Permit – Major Remodel volume changed",
    dept: "BLDG",
    impact: 41_000,
    trigger: "Volume +10% since prior study",
    action: "Refresh workload",
    severity: "stale",
  },
  {
    id: "AL-04",
    alert: "Encroachment Permit under-recovers",
    dept: "ENG",
    impact: 35_000,
    trigger: "Current recovery 52% vs 85% target",
    action: "Adjust recommended fee",
    severity: "below",
  },
  {
    id: "AL-05",
    alert: "Additional Plan Review fee below peers",
    dept: "BLDG",
    impact: 22_000,
    trigger: "31% below peer median",
    action: "Review benchmark support",
    severity: "ready",
  },
];

export const STAFF_ACTIONS: StaffAction[] = [
  {
    id: "SA-01",
    title: "Prepare mid-year fee adjustment",
    rationale: "9 high-priority fees are below policy target",
    fiscalImpact: 287_000,
    nextStep: "Export council-ready schedule",
    nextHref: "/build/feestudy",
  },
  {
    id: "SA-02",
    title: "Refresh labor rates",
    rationale: "Salary and benefit growth is the largest drift driver",
    fiscalImpact: 148_000,
    nextStep: "Import updated salary roster",
    nextHref: "/build/salary",
  },
  {
    id: "SA-03",
    title: "Re-run cost allocation",
    rationale: "Overhead allocations changed materially for Planning",
    fiscalImpact: 54_000,
    nextStep: "Open Cost Allocation",
    nextHref: "/build/cap",
  },
  {
    id: "SA-04",
    title: "Queue FY 2026–27 annual update",
    rationale: "25 fees below target and 7 stale workload assumptions",
    fiscalImpact: 412_000,
    nextStep: "Start Annual Update",
    nextHref: "/annual",
  },
];

export const RECOVERY_TREND: QuarterPoint[] = [
  { q: "Q1", recovery: 64 },
  { q: "Q2", recovery: 61 },
  { q: "Q3", recovery: 59 },
  { q: "Q4", recovery: 57 },
];
