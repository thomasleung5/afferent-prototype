/* Excel domain converters fixture.
 *
 * Run with: npm run test:excel-to-domain
 *
 * Pins the per-domain converters used by the Source Data Excel
 * import surface — same shape contract as excelToFeeExtraction, but
 * for Services / Volume / Labor / Operating. */

import assert from "node:assert/strict";
import type { Service, VolumeRow } from "../types";
import type { PreviewSheet } from "../import/excelPreview";
import {
  autoMapServices, excelToServicesExtraction, validateServicesMapping,
} from "../import/excelToServices";
import {
  autoMapVolume, excelToVolumeExtraction, validateVolumeMapping,
} from "../import/excelToVolume";
import {
  autoMapLabor, excelToLaborExtraction, validateLaborMapping,
} from "../import/excelToLabor";
import {
  autoMapOperating, excelToOperatingExtraction, validateOperatingMapping,
} from "../import/excelToOperating";

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

console.log("\nAll excelToDomain assertions passed.");
