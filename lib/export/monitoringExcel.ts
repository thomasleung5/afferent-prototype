/* Excel exporter for the Revenue Monitoring brief.
 *
 * Replaces the original CSV export. The CSV smashed every section
 * into a 3-column Section/Field/Value table — readable for diff
 * purposes but lossy: percentages and dollar amounts were rendered
 * as pre-formatted strings, so the workbook couldn't be sorted /
 * filtered / pivoted by an analyst.
 *
 * The xlsx version splits the same data across five tabs, with
 * numeric cells preserved as numbers + Excel number formats. Each
 * tab has a frozen header row.
 *
 * Sheets:
 *   1. Summary          city / generated stamp + the five KPI tiles
 *   2. Dept Health      per-dept target / current / drift / status
 *   3. Drift Drivers    per-driver area / annual impact / evidence
 *   4. Recovery Alerts  per-alert dept / impact / trigger / severity
 *   5. Staff Actions    per-action title / rationale / next step
 *
 * Mirrors lib/export/excel.ts and lib/export/capExcel.ts. */

import type { MonitoringData } from "@/lib/data/monitoring";
import { buildXlsxBlob, h, n, type Cell, type SheetSpec } from "./xlsx";

export interface MonitoringExportPayload {
  cityName: string;
  generatedAt: string;
  monitoring: MonitoringData;
}

export async function exportMonitoringXlsx(p: MonitoringExportPayload): Promise<Blob> {
  const sheets: SheetSpec[] = [
    { name: "Summary",         rows: buildSummary(p),         columnWidths: [28, 26] },
    { name: "Dept Health",     rows: buildDeptHealth(p),      columnWidths: [10, 10, 10, 14, 14] },
    { name: "Drift Drivers",   rows: buildDriftDrivers(p),    columnWidths: [12, 32, 28, 14, 50, 36] },
    { name: "Recovery Alerts", rows: buildRecoveryAlerts(p),  columnWidths: [14, 36, 10, 14, 32, 40, 10] },
    { name: "Staff Actions",   rows: buildStaffActions(p),    columnWidths: [36, 50, 50, 14] },
  ];
  return buildXlsxBlob(sheets);
}

// ============================================================================
// Sheet builders
// ============================================================================

function buildSummary(p: MonitoringExportPayload): Cell[][] {
  const s = p.monitoring.summary;
  return [
    [h("Revenue Monitoring · Summary")],
    [],
    [h("City"),            p.cityName],
    [h("Generated"),       new Date(p.generatedAt).toLocaleString()],
    [],
    // The percent + currency cells are real numbers so analysts can
    // re-format / chart them. `citywideRecovery` and `policyTarget`
    // come from the model as 0–100 values, so divide by 100 for the
    // Excel "0.0%" format which expects fractions.
    [h("Citywide recovery"),    n(s.citywideRecovery / 100, "0.0%")],
    [h("Policy target"),        n(s.policyTarget / 100, "0.0%")],
    [h("Revenue drift /yr"),    n(s.revenueDrift, "$#,##0;[Red]-$#,##0")],
    [h("Subsidy exposure /yr"), n(s.subsidyExposure, "$#,##0")],
    [h("Fees below target"),    s.feesBelowTarget],
    [h("Last model update"),    s.lastModelUpdate],
  ];
}

function buildDeptHealth(p: MonitoringExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("Dept"), h("Target"), h("Current"), h("Drift (pts)"), h("Status"),
  ]];
  for (const d of p.monitoring.deptHealth) {
    rows.push([
      d.dept,
      n(d.target  / 100, "0%"),
      n(d.current / 100, "0%"),
      // Drift is already in points; +/- formatting + a neutral zero.
      n(d.drift, "+0;-0;0"),
      d.status,
    ]);
  }
  if (p.monitoring.deptHealth.length === 0) {
    rows.push(["No department health data."]);
  }
  return rows;
}

function buildDriftDrivers(p: MonitoringExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("ID"), h("Driver"), h("Area"), h("Annual impact"), h("Evidence"), h("Action"),
  ]];
  for (const r of p.monitoring.driftDrivers) {
    rows.push([
      r.id, r.driver, r.area,
      n(r.annualImpact, "$#,##0"),
      r.evidence,
      r.action,
    ]);
  }
  if (p.monitoring.driftDrivers.length === 0) {
    rows.push(["No drift drivers."]);
  }
  return rows;
}

function buildRecoveryAlerts(p: MonitoringExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("ID"), h("Alert"), h("Dept"), h("Impact"), h("Trigger"), h("Action"), h("Severity"),
  ]];
  for (const a of p.monitoring.recoveryAlerts) {
    rows.push([
      a.id, a.alert, a.dept,
      n(a.impact, "$#,##0"),
      a.trigger,
      a.action,
      a.severity,
    ]);
  }
  if (p.monitoring.recoveryAlerts.length === 0) {
    rows.push(["No recovery alerts."]);
  }
  return rows;
}

function buildStaffActions(p: MonitoringExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("Title"), h("Rationale"), h("Next step"), h("Fiscal impact"),
  ]];
  for (const a of p.monitoring.staffActions) {
    rows.push([
      a.title, a.rationale, a.nextStep,
      n(a.fiscalImpact, "$#,##0;[Red]-$#,##0"),
    ]);
  }
  if (p.monitoring.staffActions.length === 0) {
    rows.push(["No staff actions."]);
  }
  return rows;
}
