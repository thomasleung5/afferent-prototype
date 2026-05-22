// Revenue Monitoring — derived view of operational health.
//
// Numbers come from the live BuildDerived state (which itself derives from
// seed data + any user imports + manual edits). Nothing in this file is
// hardcoded: change services / fees / pools / policy upstream and the
// monitoring page updates the same turn.

import type { DeptCode, PolicyTarget } from "../types";
import type { FeeComparison, PolicyImpact } from "../calc";
import type { BuildImportLog } from "../store";
import { DEPTS, FEE_DEPTS } from "./departments";

export type Trend = "up" | "down" | "flat";
export type RecoveryStatus = "below" | "watch" | "on-track";
export type AlertSeverity = "high" | "stale" | "below" | "ready";

interface MonitoringSummary {
  citywideRecovery: number;
  policyTarget: number;
  revenueDrift: number;
  subsidyExposure: number;
  feesBelowTarget: number;
  lastModelUpdate: string;
}

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

export interface RecoveryAlert {
  id: string;
  alert: string;
  dept: DeptCode;
  impact: number;
  trigger: string;
  action: string;
  severity: AlertSeverity;
}

interface StaffAction {
  id: string;
  title: string;
  rationale: string;
  fiscalImpact: number;
  nextStep: string;
  nextHref?: string;
}

export interface MonitoringData {
  summary: MonitoringSummary;
  deptHealth: DeptHealth[];
  driftDrivers: DriftDriver[];
  recoveryAlerts: RecoveryAlert[];
  staffActions: StaffAction[];
}

interface MonitoringInput {
  comparisons: FeeComparison[];
  impact: PolicyImpact;
  policyTargets: PolicyTarget[];
  imports: BuildImportLog[];
}

export function deriveMonitoringData(input: MonitoringInput): MonitoringData {
  const summary = deriveSummary(input);
  const deptHealth = deriveDeptHealth(input);
  const recoveryAlerts = deriveRecoveryAlerts(input);
  const driftDrivers = deriveDriftDrivers(input, deptHealth);
  const staffActions = deriveStaffActions(input, deptHealth, recoveryAlerts);
  return { summary, deptHealth, driftDrivers, recoveryAlerts, staffActions };
}

function deriveSummary({ comparisons, impact, imports }: MonitoringInput): MonitoringSummary {
  const citywideRecovery = impact.totalCost > 0
    ? (impact.currentRevenue / impact.totalCost) * 100
    : 0;
  const feesBelowTarget = comparisons.filter((c) => c.recoveryPct < c.target).length;
  // Revenue drift = the closeable gap, expressed as a negative number
  // (under-collecting). Matches the sign convention the page legend used.
  const revenueDrift = -Math.round(Math.max(0, impact.recoverableGap));
  const lastModelUpdate = formatLastImport(imports);
  return {
    citywideRecovery: Math.round(citywideRecovery),
    policyTarget: Math.round(impact.overallPct),
    revenueDrift,
    subsidyExposure: Math.round(impact.subsidy),
    feesBelowTarget,
    lastModelUpdate,
  };
}

function deriveDeptHealth({ comparisons, policyTargets }: MonitoringInput): DeptHealth[] {
  // Only surface fee depts the active jurisdiction actually models. The
  // comparison set is built from state.services, so a dept with at least
  // one service maps directly to a dept the jurisdiction operates.
  // Without this filter, jurisdictions like LAH that only model
  // Planning/Building/Engineering would show empty Parks/PD/Fire rows.
  const modeled = new Set(comparisons.map((c) => c.dept));
  return FEE_DEPTS.filter((d) => modeled.has(d)).map((dept) => {
    const deptRows = comparisons.filter((c) => c.dept === dept);
    const totalCost = deptRows.reduce((a, c) => a + c.annualCost, 0);
    const currentRev = deptRows.reduce((a, c) => a + c.annualRevenue, 0);
    const intendedRev = deptRows.reduce((a, c) => a + c.annualCost * (c.target / 100), 0);
    const current = totalCost > 0 ? Math.round((currentRev / totalCost) * 100) : 0;
    const policyTarget = policyTargets.find((t) => t.dept === dept)?.target
      ?? (totalCost > 0 ? Math.round((intendedRev / totalCost) * 100) : 100);
    const drift = current - policyTarget;
    const subsidy = Math.max(0, intendedRev - currentRev);
    return {
      dept,
      target: policyTarget,
      current,
      drift,
      subsidy: Math.round(subsidy),
      trend: trendFromDrift(drift),
      status: statusFromDrift(drift),
    };
  });
}

function deriveRecoveryAlerts({ comparisons }: MonitoringInput): RecoveryAlert[] {
  // Rank fees by absolute closeable impact (uplift if adopted at target).
  // Surface the top 5 — that's the actionable Recovery Alerts queue.
  return comparisons
    .filter((c) => c.annualUplift > 500) // ignore noise below $500/yr
    .sort((a, b) => b.annualUplift - a.annualUplift)
    .slice(0, 5)
    .map((c, i) => {
      const severity = severityFor(c);
      const { trigger, action } = describeAlert(c);
      return {
        id: `AL-${String(i + 1).padStart(2, "0")}`,
        alert: alertHeadline(c),
        dept: c.dept,
        impact: Math.round(c.annualUplift),
        trigger,
        action,
        severity,
      };
    });
}

function deriveDriftDrivers(
  { comparisons }: MonitoringInput,
  deptHealth: DeptHealth[],
): DriftDriver[] {
  // Drivers = where the citywide gap concentrates. Without time-series we
  // can't truly attribute drift, so we surface the largest per-department
  // contributions to the recoverable gap.
  const drivers: DriftDriver[] = [];
  for (const dh of deptHealth) {
    if (dh.subsidy < 1000) continue;
    const deptName = DEPTS[dh.dept].name.replace(" Administration", "");
    const deptRows = comparisons.filter((c) => c.dept === dh.dept);
    const belowCount = deptRows.filter((c) => c.recoveryPct < c.target).length;
    drivers.push({
      id: `DR-${dh.dept}`,
      driver: `${deptName} cost recovery shortfall`,
      area: deptName,
      annualImpact: dh.subsidy,
      evidence: `${belowCount} fee${belowCount === 1 ? "" : "s"} below target · `
        + `recovery ${dh.current}% vs ${dh.target}% policy`,
      action: "Review fee schedule",
      actionHref: "/build/feestudy",
    });
  }
  // Plus a single "unadopted fees" row capturing services with $0 fee but
  // a calculated cost — that's typically a category-wide adoption lag.
  const unadopted = comparisons.filter((c) => c.fee === 0 && c.unitCost > 0);
  if (unadopted.length > 0) {
    const impact = unadopted.reduce((a, c) => a + c.annualCost, 0);
    drivers.push({
      id: "DR-UNADOPTED",
      driver: "Fee adoption lag",
      area: "All departments",
      annualImpact: Math.round(impact),
      evidence: `${unadopted.length} service${unadopted.length === 1 ? "" : "s"} carry calculated cost but no adopted fee`,
      action: "Move to fee schedule",
      actionHref: "/build/feestudy",
    });
  }
  return drivers
    .sort((a, b) => b.annualImpact - a.annualImpact)
    .slice(0, 5);
}

function deriveStaffActions(
  { comparisons, impact }: MonitoringInput,
  deptHealth: DeptHealth[],
  recoveryAlerts: RecoveryAlert[],
): StaffAction[] {
  const actions: StaffAction[] = [];
  const highAlertCount = recoveryAlerts.filter((a) => a.severity === "high").length;
  const totalUplift = comparisons.reduce((a, c) => a + Math.max(0, c.annualUplift), 0);
  if (highAlertCount > 0 && totalUplift > 0) {
    actions.push({
      id: "SA-FEES",
      title: "Prepare mid-year fee adjustment",
      rationale: `${highAlertCount} high-priority fee${highAlertCount === 1 ? "" : "s"} below policy target`,
      fiscalImpact: Math.round(totalUplift),
      nextStep: "Export council-ready schedule",
      nextHref: "/build/feestudy",
    });
  }
  const worstDept = [...deptHealth].sort((a, b) => a.drift - b.drift)[0];
  if (worstDept && worstDept.subsidy > 1000) {
    const deptName = DEPTS[worstDept.dept].name.replace(" Administration", "");
    actions.push({
      id: `SA-${worstDept.dept}`,
      title: `Re-run overhead cost allocation`,
      rationale: `${deptName} recovery is ${Math.abs(worstDept.drift)} pts below target`,
      fiscalImpact: worstDept.subsidy,
      nextStep: "Open Overhead Cost Allocation",
      nextHref: "/build/cap",
    });
  }
  if (impact.recoverableGap > 0) {
    actions.push({
      id: "SA-ANNUAL",
      title: "Queue annual update",
      rationale: `${recoveryAlerts.length} alerts open · `
        + `${Math.round(Math.max(0, impact.recoverableGap)).toLocaleString()} closeable gap`,
      fiscalImpact: Math.round(Math.max(0, impact.recoverableGap)),
      nextStep: "Start Annual Update",
      nextHref: "/annual",
    });
  }
  return actions
    .sort((a, b) => b.fiscalImpact - a.fiscalImpact);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trendFromDrift(drift: number): Trend {
  if (drift <= -3) return "down";
  if (drift >=  3) return "up";
  return "flat";
}

function statusFromDrift(drift: number): RecoveryStatus {
  if (drift <= -8) return "below";
  if (drift <= -2) return "watch";
  return "on-track";
}

function severityFor(c: FeeComparison): AlertSeverity {
  if (c.fee === 0 && c.unitCost > 0) return "high";
  const driftPts = c.target - c.recoveryPct;
  if (c.annualUplift >= 50_000) return "high";
  if (driftPts >= 20) return "below";
  if (driftPts >= 10) return "stale";
  return "ready";
}

function alertHeadline(c: FeeComparison): string {
  if (c.fee === 0 && c.unitCost > 0) return `${c.name} at $0 current fee`;
  if (c.recoveryPct < c.target * 0.6) return `${c.name} severely under-recovers`;
  return `${c.name} below target`;
}

function describeAlert(c: FeeComparison): { trigger: string; action: string } {
  if (c.fee === 0 && c.unitCost > 0) {
    return {
      trigger: "Cost exists but fee not adopted",
      action: "Add to fee schedule",
    };
  }
  const driftPts = Math.round(c.target - c.recoveryPct);
  return {
    trigger: `Recovery ${Math.round(c.recoveryPct)}% vs ${c.target}% target (${driftPts} pts gap)`,
    action: "Adjust recommended fee",
  };
}

function formatLastImport(imports: BuildImportLog[]): string {
  if (imports.length === 0) return "Seed data";
  const latest = imports.reduce((a, b) => (b.id > a.id ? b : a));
  const d = new Date(latest.at);
  if (Number.isNaN(d.getTime())) return "Seed data";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
