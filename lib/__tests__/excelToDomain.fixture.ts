/* Excel domain converters fixture.
 *
 * Run with: npm run test:excel-to-domain
 *
 * Pins the per-domain converters used by the Source Data Excel
 * import surface — same shape contract as excelToFeeExtraction, but
 * for Services / Volume / Labor / Operating. */

import assert from "node:assert/strict";
import type { Service } from "../types";
import type { PreviewSheet } from "../import/excelPreview";
import {
  autoMapServices, excelToServicesExtraction, validateServicesMapping,
} from "../import/excelToServices";
import {
  autoMapVolume, excelToVolumeExtraction, validateVolumeMapping,
} from "../import/excelToVolume";
import {
  autoMapLabor, excelToLaborExtraction,
} from "../import/excelToLabor";
import {
  autoMapOperating, excelToOperatingExtraction, validateOperatingMapping,
} from "../import/excelToOperating";
import { operatingToExtractionResult } from "../ai/parseOperating";

function sheet(name: string, rows: (string | number | null)[][]): PreviewSheet {
  const columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return { name, rowCount: rows.length, columnCount, rows };
}

// ─── Services ──────────────────────────────────────────────────────────

// autoMap picks up canonical Services headers in any order.
{
  const s = sheet("Services", [
    ["name", "dept", "hours", "volume", "fee"],
    ["Plan check", "PLAN", 4, 100, 500],
  ]);
  const auto = autoMapServices(s);
  assert.equal(auto.cols.name, 0);
  assert.equal(auto.cols.dept, 1);
  assert.equal(auto.cols.hours, 2);
  assert.equal(auto.cols.volume, 3);
  assert.equal(auto.cols.fee, 4);
  assert.equal(auto.detected.name, true);
  console.log("  ✓ autoMapServices: canonical headers");
}

// Happy path → ExtractionResult with Service entities + Excel lineage.
{
  const s = sheet("Catalog", [
    ["Service", "Dept", "Staff Hours", "Volume"],
    ["Plan check", "Planning", 4, 100],
    ["Inspection", "BLDG", "2.5", 50],
  ]);
  const r = excelToServicesExtraction("svc.xlsx", s, {
    headerRowIndex: 0,
    cols: { name: 0, dept: 1, hours: 2, volume: 3 },
  }, []);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.importedRowCount, 2);
  const first = r.extraction.mapped[0];
  assert.equal(first.entity.name, "Plan check");
  assert.equal(first.entity.dept, "PLAN");
  assert.equal(first.entity.hours, 4);
  assert.equal(first.entity.volume, 100);
  assert.equal(first.lineage.sheet, "Catalog");
  assert.equal(first.lineage.row, 2);
  console.log("  ✓ excelToServicesExtraction: happy path");
}

// validateServicesMapping requires name/dept/hours.
{
  const s = sheet("X", [["Service", "Dept", "Hours"], ["P", "PLAN", 1]]);
  const errors = validateServicesMapping(s, {
    headerRowIndex: 0,
    cols: { name: 0, dept: 1, hours: -1 },
  });
  assert.ok(errors.some((e) => /hours/i.test(e)));
  console.log("  ✓ validateServicesMapping: missing required hours flagged");
}

// ─── Volume ────────────────────────────────────────────────────────────

// autoMapVolume picks up name / dept / current / prior.
{
  const s = sheet("Volume", [
    ["Service Name", "Department", "Prior", "Current"],
    ["Plan check", "PLAN", 80, 100],
  ]);
  const auto = autoMapVolume(s);
  assert.equal(auto.cols.name, 0);
  assert.equal(auto.cols.dept, 1);
  assert.equal(auto.cols.prior, 2);
  assert.equal(auto.cols.current, 3);
  console.log("  ✓ autoMapVolume: canonical headers");
}

// Happy path: known-service rows produce VolumeRow keyed by service.id;
// unknown rows route to extraction.unmapped.
{
  const existingServices: Service[] = [{
    id: "svc-plan-check", name: "Plan check", dept: "PLAN",
    volume: 0, hours: 0, cost: 0, fee: 0, peer: 0, target: 100, source: "seed",
  }];
  const s = sheet("Vol", [
    ["Service", "Dept", "Prior", "Current"],
    ["Plan check", "PLAN", 80, 100],
    ["Unknown thing", "PLAN", 5, 10],
  ]);
  const r = excelToVolumeExtraction("vol.xlsx", s, {
    headerRowIndex: 0,
    cols: { name: 0, dept: 1, prior: 2, current: 3 },
  }, existingServices, []);
  assert.equal(r.extraction.mapped.length, 1);
  assert.equal(r.extraction.mapped[0].entity.id, "svc-plan-check");
  assert.equal(r.extraction.mapped[0].entity.current, 100);
  assert.equal(r.extraction.unmapped.length, 1, "unknown service routes to unmapped");
  assert.equal(r.extraction.unmapped[0].reason, "schema-mismatch");
  console.log("  ✓ excelToVolumeExtraction: known matches map, unknowns route to unmapped");
}

// validateVolumeMapping: prior + current both required only when neither given.
{
  const s = sheet("X", [["Service", "Dept", "Current"], ["A", "PLAN", 1]]);
  const errors = validateVolumeMapping(s, {
    headerRowIndex: 0, cols: { name: 0, dept: 1 },
  });
  assert.ok(errors.some((e) => /prior or current/i.test(e)));
  console.log("  ✓ validateVolumeMapping: requires prior or current");
}

// ─── Labor ─────────────────────────────────────────────────────────────

// autoMapLabor: title / dept / fte / hours synonyms.
{
  const s = sheet("Labor", [
    ["Position", "Dept", "FTEs", "Productive Hours"],
    ["Planner II", "PLAN", 1, 1720],
  ]);
  const auto = autoMapLabor(s);
  assert.equal(auto.cols.title, 0);
  assert.equal(auto.cols.dept, 1);
  assert.equal(auto.cols.fte, 2);
  assert.equal(auto.cols.hours, 3);
  console.log("  ✓ autoMapLabor: canonical headers + synonyms");
}

// Happy path: rows → Position entities with salary/benefits = 0.
{
  const s = sheet("Roster", [
    ["Title", "Dept", "FTE", "Hours"],
    ["Planner II", "Planning", 1.0, 1720],
    ["Inspector", "Building", "0.5", 860],
  ]);
  const r = excelToLaborExtraction("labor.xlsx", s, {
    headerRowIndex: 0, cols: { title: 0, dept: 1, fte: 2, hours: 3 },
  });
  assert.equal(r.importedRowCount, 2);
  const p0 = r.extraction.mapped[0].entity;
  assert.equal(p0.title, "Planner II");
  assert.equal(p0.dept, "PLAN");
  assert.equal(p0.fte, 1);
  assert.equal(p0.hours, 1720);
  assert.equal(p0.salary, 0, "salary stays 0 — owned by Operating");
  assert.equal(p0.benefits, 0);
  assert.equal(r.extraction.mapped[1].entity.fte, 0.5);
  console.log("  ✓ excelToLaborExtraction: happy path");
}

// Missing FTE → row routes to unmapped (schema-mismatch).
{
  const s = sheet("R", [
    ["Title", "Dept", "FTE", "Hours"],
    ["Planner", "PLAN", "", 1720],
  ]);
  const r = excelToLaborExtraction("x.xlsx", s, {
    headerRowIndex: 0, cols: { title: 0, dept: 1, fte: 2, hours: 3 },
  });
  assert.equal(r.extraction.mapped.length, 0);
  assert.equal(r.extraction.unmapped.length, 1);
  assert.equal(r.extraction.unmapped[0].reason, "schema-mismatch");
  console.log("  ✓ excelToLaborExtraction: missing FTE routes to unmapped");
}

// ─── Operating ─────────────────────────────────────────────────────────

// autoMapOperating: line / dept / amount synonyms.
{
  const s = sheet("Budget", [
    ["Account Code", "Department", "Category", "Description", "Adopted Budget"],
    ["6101", "PLAN", "Software & subscriptions", "GIS license", 12000],
  ]);
  const auto = autoMapOperating(s);
  assert.equal(auto.cols.code, 0);
  assert.equal(auto.cols.dept, 1);
  assert.equal(auto.cols.category, 2);
  assert.equal(auto.cols.line, 3);
  assert.equal(auto.cols.amount, 4);
  console.log("  ✓ autoMapOperating: canonical headers + synonyms");
}

// Happy path: rows → OperatingLine entities. Costtype heuristic
// classifies "Salaries" as Labor.
{
  const s = sheet("Budget", [
    ["Code", "Dept", "Category", "Line", "Amount"],
    ["6101", "PLAN", "Software & subscriptions", "GIS license", 12000],
    ["5101", "PLAN", "Other", "Salaries — Planner II", 95000],
  ]);
  const r = excelToOperatingExtraction("op.xlsx", s, {
    headerRowIndex: 0, cols: { code: 0, dept: 1, category: 2, line: 3, amount: 4 },
  });
  assert.equal(r.importedRowCount, 2);
  const op0 = r.extraction.mapped[0].entity;
  assert.equal(op0.line, "GIS license");
  assert.equal(op0.dept, "PLAN");
  assert.equal(op0.amount, 12000);
  assert.equal(op0.category, "Software & subscriptions");
  assert.equal(op0.costType, "Operating");
  const op1 = r.extraction.mapped[1].entity;
  assert.equal(op1.costType, "Labor",
    "lines containing 'Salaries' are classified as Labor by the AI-side heuristic");
  console.log("  ✓ excelToOperatingExtraction: happy path + cost-type classify");
}

// validateOperatingMapping requires line / dept / amount.
{
  const s = sheet("X", [["Line", "Dept", "Amount"], ["A", "PLAN", 1]]);
  const errors = validateOperatingMapping(s, {
    headerRowIndex: 0, cols: { line: -1, dept: 1, amount: 2 },
  });
  assert.ok(errors.some((e) => /line description/i.test(e)));
  console.log("  ✓ validateOperatingMapping: missing required line flagged");
}

// ─── Operating retention policy ────────────────────────────────────────
//
// The PDF/AI and Excel paths share lib/ai/parseOperating.ts ::
// classifyOperatingExclusion + isOperatingTotalRow. These cases pin
// the Excel side end-to-end (autoMap → validate → extract → entity
// shape); the AI side reuses the exact same helpers, so behavior is
// consistent by construction.

// Capital outlay → include:false + reason "capital outlay" (by category)
// AND by line keyword. Zero and negative amounts pass through.
// Total / subtotal rows are skipped silently like blank rows.
// Unknown departments go to unmapped with source lineage.
{
  const s = sheet("Budget", [
    ["Code", "Dept", "Category", "Line", "Amount"],
    ["6101", "PLAN", "Software & subscriptions", "GIS license",                12000],
    ["7001", "PLAN", "Capital outlay",           "Vehicle replacement",        45000],
    ["7002", "PLAN", "Other",                    "Capital improvement project", 25000],
    ["8001", "PLAN", "Other",                    "Debt service - bond principal", 38000],
    ["8002", "PLAN", "Other",                    "Interfund transfer to General Fund", 17000],
    ["8003", "PLAN", "Other",                    "Grant pass-through",          9000],
    ["8004", "PLAN", "Other",                    "Applicant-reimbursed costs",  12500],
    ["8005", "PLAN", "Other",                    "One-time consulting study",   30000],
    ["6201", "PLAN", "Other",                    "Postage placeholder",             0],
    ["6202", "PLAN", "Other",                    "Refund credit",              -3500],
    ["9999", "PLAN", "Other",                    "Total Operating Expenses",  500000],
    ["9998", "PLAN", "Other",                    "Subtotal: Salaries & Benefits", 350000],
    ["6301", "GHOST_DEPT", "Other",              "Mystery dept line",            5000],
  ]);
  const r = excelToOperatingExtraction("op.xlsx", s, {
    headerRowIndex: 0, cols: { code: 0, dept: 1, category: 2, line: 3, amount: 4 },
  });

  // 1) Standard included row.
  const gis = r.extraction.mapped.find((m) => m.entity.line === "GIS license");
  assert.ok(gis, "GIS license imports as include=true");
  assert.equal(gis.entity.include, true);
  assert.equal(gis.entity.excludeReason, undefined);

  // 2) Capital outlay → include:false / "capital outlay" (category match).
  const cap = r.extraction.mapped.find((m) => m.entity.line === "Vehicle replacement");
  assert.ok(cap);
  assert.equal(cap.entity.include, false);
  assert.equal(cap.entity.excludeReason, "capital outlay");

  // 3) Capital outlay via keyword (line text), not category.
  const capLine = r.extraction.mapped.find((m) => m.entity.line === "Capital improvement project");
  assert.ok(capLine);
  assert.equal(capLine.entity.include, false);
  assert.equal(capLine.entity.excludeReason, "capital outlay");

  // 4) Debt service.
  const debt = r.extraction.mapped.find((m) => m.entity.line === "Debt service - bond principal");
  assert.ok(debt);
  assert.equal(debt.entity.include, false);
  assert.equal(debt.entity.excludeReason, "debt service");

  // 5) Interfund transfer.
  const xfer = r.extraction.mapped.find((m) => m.entity.line === "Interfund transfer to General Fund");
  assert.ok(xfer);
  assert.equal(xfer.entity.include, false);
  assert.equal(xfer.entity.excludeReason, "transfer");

  // 6) Pass-through.
  const pt = r.extraction.mapped.find((m) => m.entity.line === "Grant pass-through");
  assert.ok(pt);
  assert.equal(pt.entity.include, false);
  assert.equal(pt.entity.excludeReason, "pass-through");

  // 7) Applicant-reimbursed.
  const appr = r.extraction.mapped.find((m) => m.entity.line === "Applicant-reimbursed costs");
  assert.ok(appr);
  assert.equal(appr.entity.include, false);
  assert.equal(appr.entity.excludeReason, "applicant reimbursed");

  // 8) One-time / non-recurring.
  const oneTime = r.extraction.mapped.find((m) => m.entity.line === "One-time consulting study");
  assert.ok(oneTime);
  assert.equal(oneTime.entity.include, false);
  assert.equal(oneTime.entity.excludeReason, "one-time");

  // 9) Zero amount stays as include:true (not excluded by amount).
  const zero = r.extraction.mapped.find((m) => m.entity.line === "Postage placeholder");
  assert.ok(zero, "zero-amount row NOT discarded");
  assert.equal(zero.entity.amount, 0);
  assert.equal(zero.entity.include, true);

  // 10) Negative amount goes to lowConfidence with include:true (analyst review).
  const neg = r.extraction.lowConfidence.find((m) => m.entity.line === "Refund credit");
  assert.ok(neg, "negative-amount row routed to lowConfidence (not dropped)");
  assert.equal(neg.entity.amount, -3500);
  assert.equal(neg.entity.include, true);

  // 11) Total + subtotal rows skipped silently — not in mapped, not in
  //     lowConfidence, not in unmapped.
  const allEntities = [...r.extraction.mapped, ...r.extraction.lowConfidence].map((m) => m.entity.line);
  assert.ok(!allEntities.includes("Total Operating Expenses"), "Total row skipped");
  assert.ok(!allEntities.includes("Subtotal: Salaries & Benefits"), "Subtotal row skipped");
  assert.ok(r.extraction.unmapped.every((u) => u.raw[3] !== "Total Operating Expenses"));
  assert.ok(r.extraction.unmapped.every((u) => u.raw[3] !== "Subtotal: Salaries & Benefits"));

  // 12) Unknown department routes to unmapped with source lineage.
  const ghost = r.extraction.unmapped.find((u) => u.raw[3] === "Mystery dept line");
  assert.ok(ghost, "Unknown dept routed to unmapped (not silently dropped)");
  assert.equal(ghost.reason, "ambiguous-dept");
  assert.ok(ghost.lineage.row, "lineage row preserved for the analyst");
  assert.equal(ghost.lineage.file, "op.xlsx");

  console.log("  ✓ operating retention: include-false buckets + zero/negative retained + totals skipped + unknown dept unmapped");
}

// AI side: operatingToExtractionResult routes unknown dept to unmapped,
// keeps zero/negative amounts, applies the shared exclusion classifier
// when the model didn't tag the line itself.
{
  const rows = [
    { dept: "PLAN", category: "Software & subscriptions", line: "GIS license",
      amount: 12000, confidence: "high" as const },
    { dept: "PLAN", category: "Other", line: "Vehicle replacement (capital outlay)",
      amount: 45000, confidence: "high" as const },
    { dept: "PLAN", category: "Other", line: "Debt service principal",
      amount: 30000, confidence: "high" as const },
    { dept: "PLAN", category: "Other", line: "Postage placeholder",
      amount: 0, confidence: "high" as const },
    { dept: "PLAN", category: "Other", line: "Refund credit",
      amount: -3500, confidence: "high" as const },
    { dept: "PLAN", category: "Other", line: "Total Operating Expenses",
      amount: 500000, confidence: "high" as const },
    { dept: "GHOST_DEPT", category: "Other", line: "Mystery dept line",
      amount: 5000, confidence: "high" as const },
    // Model already set include=false + a custom reason: preserved verbatim.
    { dept: "PLAN", category: "Other", line: "Special analyst-flagged line",
      amount: 8000, include: false, excludeReason: "analyst marked one-time per memo",
      confidence: "high" as const },
  ];
  const r = operatingToExtractionResult(rows, "op.pdf");
  const find = (line: string) => [...r.mapped, ...r.lowConfidence].find((m) => m.entity.line === line);

  assert.equal(find("GIS license")?.entity.include, true);
  assert.equal(find("Vehicle replacement (capital outlay)")?.entity.include, false);
  assert.equal(find("Vehicle replacement (capital outlay)")?.entity.excludeReason, "capital outlay");
  assert.equal(find("Debt service principal")?.entity.include, false);
  assert.equal(find("Debt service principal")?.entity.excludeReason, "debt service");
  assert.equal(find("Postage placeholder")?.entity.amount, 0);
  assert.equal(find("Postage placeholder")?.entity.include, true,
    "AI-side zero-amount row retained");
  // Negative amount → lowConfidence even with high model confidence.
  const neg = r.lowConfidence.find((m) => m.entity.line === "Refund credit");
  assert.ok(neg, "AI-side negative routed to lowConfidence");
  assert.equal(neg.entity.amount, -3500);
  assert.equal(neg.entity.include, true);
  // Total row skipped at the row level.
  assert.ok(!find("Total Operating Expenses"), "AI-side Total row skipped");
  // Unknown dept routes to unmapped with lineage instead of silent drop.
  const ghost = r.unmapped.find((u) => Array.isArray(u.raw) && u.raw.includes("Mystery dept line"));
  assert.ok(ghost, "AI-side unknown dept routed to unmapped");
  assert.equal(ghost.reason, "ambiguous-dept");
  assert.equal(ghost.lineage.file, "op.pdf");
  // Model-supplied include=false + reason preserved verbatim.
  const analyst = find("Special analyst-flagged line");
  assert.equal(analyst?.entity.include, false);
  assert.equal(analyst?.entity.excludeReason, "analyst marked one-time per memo");
  console.log("  ✓ operatingToExtractionResult: parity with Excel + honors model-set include/excludeReason");
}

console.log("\nAll excelToDomain assertions passed.");
