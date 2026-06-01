/* Excel exporter for the Revenue Opportunity brief.
 *
 * Replaces the original CSV. The CSV flattened every section into a
 * 3-column Section/Metric/Value table with pre-stringified dollar
 * amounts — readable as a diff but un-pivotable in Excel. The xlsx
 * version splits the same data across three tabs and keeps numeric
 * cells numeric so an analyst can sort + filter + chart.
 *
 * Sheets:
 *   1. Summary    headline gap + recovery counts + top dept
 *   2. Drivers    labor / operating / overhead contribution to total cost
 *   3. Top Fixes  per-service current vs recommended fee with annual uplift
 *
 * Mirrors lib/export/monitoringExcel.ts. */

import type { DeptCode } from "@/lib/types";
import type { FeeComparison } from "@/lib/calc";
import { deptName } from "@/lib/data/departments";
import { buildXlsxBlob, h, n, type Cell, type SheetSpec } from "./xlsx";

export interface OpportunityExportPayload {
  cityName: string;
  generatedAt: string;
  /** Citywide policy-recoverable gap (clamped to 0 in the UI for the
   *  headline; here we keep it as-is so a negative gap surfaces too). */
  annualGap: number;
  currentRevenue: number;
  totalCost: number;
  feesBelowTarget: number;
  totalFees: number;
  deptsBelowPolicy: number;
  activeFeeDepts: number;
  topOpportunity: { dept: DeptCode; subsidy: number } | null;
  drivers: { direct: number; operating: number; cap: number };
  /** All fee comparisons; the exporter slices to the top 20 by absolute
   *  annual uplift. Passing the full list (not a pre-trimmed copy) keeps
   *  the caller small and lets us tighten the heuristic here. */
  comparisons: FeeComparison[];
}

const TOP_FIXES_LIMIT = 20;
const UPLIFT_FORMAT = "$#,##0;[Red]-$#,##0";

export async function exportOpportunityXlsx(p: OpportunityExportPayload): Promise<Blob> {
  const sheets: SheetSpec[] = [
    { name: "Summary",   rows: buildSummary(p),   columnWidths: [30, 28] },
    { name: "Drivers",   rows: buildDrivers(p),   columnWidths: [22, 16] },
    { name: "Top Fixes", rows: buildTopFixes(p),  columnWidths: [40, 10, 14, 14, 14] },
  ];
  return buildXlsxBlob(sheets);
}

// ============================================================================
// Sheet builders
// ============================================================================

function buildSummary(p: OpportunityExportPayload): Cell[][] {
  const topOppValue: Cell = p.topOpportunity
    ? `${deptName(p.topOpportunity.dept)} · $${Math.round(p.topOpportunity.subsidy).toLocaleString()}/yr`
    : "—";
  return [
    [h("Revenue Opportunity · Summary")],
    [],
    [h("City"),               p.cityName],
    [h("Generated"),          new Date(p.generatedAt).toLocaleString()],
    [],
    [h("Annual gap /yr"),     n(p.annualGap,         UPLIFT_FORMAT)],
    [h("Current revenue"),    n(p.currentRevenue,    "$#,##0")],
    [h("Total cost"),         n(p.totalCost,         "$#,##0")],
    [],
    [h("Fees below target"),  `${p.feesBelowTarget} of ${p.totalFees}`],
    [h("Departments below policy"), `${p.deptsBelowPolicy} of ${p.activeFeeDepts}`],
    [h("Top opportunity department"), topOppValue],
  ];
}

function buildDrivers(p: OpportunityExportPayload): Cell[][] {
  return [
    [h("Driver"), h("Annual cost")],
    ["Labor",          n(p.drivers.direct,    "$#,##0")],
    ["Operating Costs", n(p.drivers.operating, "$#,##0")],
    ["Overhead Costs", n(p.drivers.cap,       "$#,##0")],
    [h("Total"),       n(p.drivers.direct + p.drivers.operating + p.drivers.cap, "$#,##0")],
  ];
}

function buildTopFixes(p: OpportunityExportPayload): Cell[][] {
  const top = [...p.comparisons]
    .filter((c) => Math.abs(c.annualUplift) >= 1)
    .sort((a, b) => Math.abs(b.annualUplift) - Math.abs(a.annualUplift))
    .slice(0, TOP_FIXES_LIMIT);

  const rows: Cell[][] = [[
    h("Fee item"), h("Dept"),
    h("Current fee"), h("Recommended fee"), h("Annual uplift"),
  ]];
  for (const c of top) {
    rows.push([
      c.name, c.dept,
      n(c.fee,          "$#,##0"),
      n(c.recommended,  "$#,##0"),
      n(c.annualUplift, UPLIFT_FORMAT),
    ]);
  }
  if (top.length === 0) {
    rows.push(["No fees with material uplift."]);
  }
  return rows;
}
