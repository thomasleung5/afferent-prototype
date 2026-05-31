/* Excel exporter for the Fee Study deliverable. Builds a multi-sheet
 * workbook via the shared `buildXlsxBlob` helper (write-excel-file
 * under the hood) and triggers a client-side download via
 * `URL.createObjectURL`.
 *
 * Sheets:
 *   1. Summary           — top-line numbers + cover meta
 *   2. Fee Schedule      — full per-fee table with cost / recommended / uplift
 *   3. Cost of Service   — per-service unit-cost build-up
 *   4. Department Summary— per-dept FBHR composition + recovery
 *   5. Recommendations   — ranked fee changes with action + rationale
 *   6. Recovery Policy   — dept targets + exceptions + impact
 *   7. Benchmarks        — peer-city variance per fee
 *   8. Review Flags      — unmapped/low-confidence rows still pending
 *   9. Methodology       — text content used in the PDF as well
 *
 * Cell formatting:
 *   - First row of every sheet is a bold header in the institutional ink color.
 *   - Numbers get the right format (currency, percent, integer) via Excel format strings.
 *   - Column widths are reasonable defaults; no autofit. */

import { buildXlsxBlob, downloadBlob, h, n, type Cell, type SheetSpec } from "./xlsx";
import type { ExportPayload } from "./buildPayload";

export { downloadBlob };

export async function exportFeeStudyXlsx(payload: ExportPayload): Promise<Blob> {
  const sheets: SheetSpec[] = [
    { name: "Summary",            rows: buildSummary(payload) },
    { name: "Fee Schedule",       rows: buildFeeSchedule(payload),
      columnWidths: [40, 8, 8, 8, 12, 12, 12, 8, 10, 12, 12, 10] },
    { name: "Cost of Service",    rows: buildCostOfService(payload),
      columnWidths: [40, 8, 8, 8, 12, 8, 14, 14] },
    { name: "Department Summary", rows: buildDeptSummary(payload),
      columnWidths: [20, 10, 10, 12, 10, 10, 10, 10, 14, 14, 14, 14, 10, 8] },
    { name: "Recommendations",    rows: buildRecommendations(payload),
      columnWidths: [10, 36, 8, 12, 12, 12, 14, 20, 50] },
    { name: "Recovery Policy",    rows: buildPolicy(payload),
      columnWidths: [20, 12, 32, 32] },
    { name: "Benchmarks",         rows: buildBenchmarks(payload),
      columnWidths: [40, 8, 12, 12, 12, 12] },
    { name: "Review Flags",       rows: buildReviewFlags(payload),
      columnWidths: [20, 8, 50, 32] },
    { name: "Methodology",        rows: buildMethodology(payload),
      columnWidths: [20, 80] },
  ];
  return buildXlsxBlob(sheets);
}

// ============================================================================
// Sheet builders — each returns a 2D array of cells
// ============================================================================

function buildSummary(p: ExportPayload): Cell[][] {
  return [
    [h("Fee Study Summary")],
    [],
    ["City",           p.cover.cityName],
    ["Fiscal year",    p.cover.fiscal],
    ["Prepared by",    p.cover.preparedBy],
    ["Generated",      new Date(p.cover.generatedAt).toLocaleString()],
    ["Peer cities",    p.cover.peers.join(", ")],
    [],
    [h("Top-line numbers")],
    ["Services modeled",       p.summary.services],
    ["Positions in roster",    p.summary.positions],
    ["FTE",                    n(p.summary.fte, "0.00")],
    [],
    ["Total cost of service",  n(p.summary.totalCost, "$#,##0")],
    ["Current fee revenue",    n(p.summary.currentRevenue, "$#,##0")],
    ["Annual recovery gap",    n(p.summary.recoveryGap, "$#,##0")],
    ["Current recovery %",     n(p.summary.recoveryPct, "0.0%")],
    [],
    ["Intended recovery % (policy)", n(p.summary.intendedRecoveryPct, "0.0%")],
    ["Annual subsidy",         n(p.summary.annualSubsidy, "$#,##0")],
    ["Potential uplift if adopted", n(p.summary.potentialUplift, "$#,##0")],
  ];
}

function buildFeeSchedule(p: ExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("Fee item"), h("Dept"), h("Hours"), h("Volume"),
    h("Current fee"), h("Calculated cost"), h("Recommended"),
    h("Target"), h("Recovery"), h("Annual uplift"),
    h("Peer median"), h("Confidence"),
  ]];
  for (const r of p.feeSchedule) {
    rows.push([
      r.name, r.dept,
      n(r.hours, "0.0"), n(r.volume, "#,##0"),
      n(r.fee, "$#,##0"), n(r.unitCost, "$#,##0"),
      n(r.recommended, "$#,##0"),
      n(r.target / 100, "0%"),
      n(r.recoveryPct / 100, "0%"),
      n(r.uplift, "$#,##0;[Red]-$#,##0"),
      r.peerMedian ? n(r.peerMedian, "$#,##0") : "—",
      r.confidence.toUpperCase(),
    ]);
  }
  return rows;
}

function buildCostOfService(p: ExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("Service"), h("Dept"), h("Hours"), h("FBHR"),
    h("Unit cost"), h("Volume"), h("Annual cost"), h("Annual revenue"),
  ]];
  for (const r of p.costOfService) {
    rows.push([
      r.name, r.dept,
      n(r.hours, "0.0"),
      n(r.fbhr, "$#,##0"),
      n(r.unitCost, "$#,##0"),
      n(r.volume, "#,##0"),
      n(r.annualCost, "$#,##0"),
      n(r.annualRevenue, "$#,##0"),
    ]);
  }
  return rows;
}

function buildDeptSummary(p: ExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("Department"), h("Positions"), h("FTE"), h("Prod hrs/yr"),
    h("Direct $/hr"), h("Op $/hr"), h("CAP $/hr"), h("FBHR"),
    h("Direct $"), h("Operating $"), h("CAP $"),
    h("Total cost"), h("Current revenue"), h("Recovery %"), h("Target %"),
  ]];
  for (const d of p.deptSummaries) {
    rows.push([
      d.deptName, d.positions, n(d.fte, "0.00"), n(d.productiveHours, "#,##0"),
      n(d.directRate, "$#,##0"), n(d.operatingRate, "$#,##0"),
      n(d.capRate, "$#,##0"), n(d.fbhr, "$#,##0"),
      n(d.directDollars, "$#,##0"), n(d.operatingDollars, "$#,##0"),
      n(d.capDollars, "$#,##0"),
      n(d.totalCost, "$#,##0"), n(d.currentRevenue, "$#,##0"),
      n(d.recoveryPct / 100, "0%"),
      n(d.target / 100, "0%"),
    ]);
  }
  return rows;
}

function buildRecommendations(p: ExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("Priority"), h("Service"), h("Dept"),
    h("Current"), h("Recommended"), h("Annual uplift"),
    h("Confidence"), h("Action"), h("Rationale"),
  ]];
  for (const r of p.recommendations) {
    rows.push([
      r.priority.toUpperCase(),
      r.name, r.dept,
      n(r.fee, "$#,##0"), n(r.recommended, "$#,##0"),
      n(r.uplift, "$#,##0;[Red]-$#,##0"),
      r.confidence.toUpperCase(),
      r.action,
      r.rationale.join(" "),
    ]);
  }
  return rows;
}

function buildPolicy(p: ExportPayload): Cell[][] {
  const rows: Cell[][] = [
    [h("Recovery policy")],
    [],
    [h("Dept targets")],
    [h("Department"), h("Target"), h("Notes")],
  ];
  for (const t of p.policy.targets) {
    rows.push([t.dept, n(t.target / 100, "0%"), t.note]);
  }
  rows.push([]);
  rows.push([h("Fee exceptions")]);
  rows.push([h("Fee"), h("Target"), h("Notes")]);
  for (const e of p.policy.exceptions) {
    rows.push([e.fee, n(e.target / 100, "0%"), e.note]);
  }
  rows.push([]);
  rows.push([h("Impact summary")]);
  rows.push(["Overall intended recovery", n(p.policy.impact.overallPct / 100, "0.0%")]);
  rows.push(["Annual subsidy at target", n(p.policy.impact.subsidy, "$#,##0")]);
  rows.push(["Recoverable revenue opportunity",  n(p.policy.impact.recoverableGap, "$#,##0")]);
  return rows;
}

function buildBenchmarks(p: ExportPayload): Cell[][] {
  const rows: Cell[][] = [[
    h("Service"), h("Dept"),
    h("Our fee"), h("Peer median"),
    h("Var vs median"), h("Var vs cost"),
  ]];
  for (const b of p.benchmarks) {
    rows.push([
      b.name, b.dept,
      n(b.fee, "$#,##0"),
      n(b.peerMedian, "$#,##0"),
      n(b.varianceVsMedian / 100, "+0%;-0%"),
      n(b.varianceVsCost   / 100, "+0%;-0%"),
    ]);
  }
  if (p.benchmarks.length === 0) {
    rows.push(["No peer data on file for any fee."]);
  }
  return rows;
}

function buildReviewFlags(p: ExportPayload): Cell[][] {
  const rows: Cell[][] = [
    [h("Review queue")],
    [],
    [h("Domain"), h("Count"), h("Description"), h("Source")],
  ];
  for (const f of p.reviewFlags) {
    for (const u of f.unmapped) {
      const src = u.lineage.sheet
        ? `${u.lineage.file} · ${u.lineage.sheet} · row ${u.lineage.row}`
        : u.lineage.page != null
          ? `${u.lineage.file} · p.${u.lineage.page} · line ${u.lineage.row}`
          : u.lineage.file;
      rows.push([
        f.label, 1, `${u.reason} — ${u.raw.filter(Boolean).slice(0, 4).join(" · ")}`, src,
      ]);
    }
  }
  if (rows.length === 3) {
    rows.push(["No outstanding review items — every imported row was auto-mapped."]);
  }
  return rows;
}

function buildMethodology(p: ExportPayload): Cell[][] {
  const rows: Cell[][] = [
    [h("Methodology")],
    [],
  ];
  for (const m of p.methodology) {
    rows.push([h(m.heading)]);
    rows.push([m.body]);
    rows.push([]);
  }
  rows.push([h("Assumptions")]);
  rows.push([h("Item"), h("Value")]);
  for (const a of p.assumptions) {
    rows.push([a.label, a.value]);
  }
  return rows;
}
