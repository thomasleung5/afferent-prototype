/* Smoke test for the new shared import pipeline.
 *
 *   npx tsx scripts/smoke-pipeline.ts
 *
 * Builds a synthetic fee schedule CSV with the messy-but-realistic patterns
 * the brief calls out — section headers, fee + deposit pairs, an hourly rate,
 * a formula row, a subtotal — and runs it through parseFile → classify →
 * extract → map → validate. Asserts:
 *
 *   - classification.documentType is fee_schedule
 *   - extracted document has at least one section with rows
 *   - the fee+deposit row is rowType "fee_plus_deposit"
 *   - the hourly-rate row is rowType "hourly_rate"
 *   - the subtotal row is rowType "subtotal" and lands in section.subtotal
 *   - mapping engine produces a MappingCandidate per row
 *   - validation surfaces at least one issue and an overall non-ERROR status
 *
 * Exits with code 1 on any assertion failure. */

import { SERVICES } from "../lib/data/services";
import { runImportPipeline } from "../lib/import/pipeline";

function blob(text: string, name: string): File {
  return new File([text], name, { type: "text/csv" });
}

/* Synthetic Planning fee schedule with sections, fee+deposit, hourly rate. */
const CSV = `Fee Item,Department,Current Fee,Deposit,Unit,Notes
"PLANNING DEPARTMENT",,,,,
"Pre-Application Meeting","Planning",250,,each,
"Site Development Permit","Planning",1200,5000,each,"Includes plan check"
"Architectural Review (Major)","Planning",,2500,each,deposit only
"Staff Hourly Rate","Planning",185,,per hour,billed at staff time
"Conditional Use Permit","Planning",750,3500,each,
"Subtotal Planning",,8385,,,
"BUILDING DEPARTMENT",,,,,
"Building Permit (per IBC valuation)","Building",,,each,"Base fee plus 8% of valuation"
"Plan Check Fee","Building",1250,,each,
"Inspection · Per Re-inspection","Building",95,,per visit,
"Subtotal Building",,1345,,,
`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`ok ${msg}`);
}

(async () => {
  const file = blob(CSV, "Planning Fee Schedule FY26-27.csv");
  const batch = await runImportPipeline(file, { services: SERVICES });

  console.log("---");
  console.log(`classification: ${batch.classification.documentType} @ ${(batch.classification.confidence * 100).toFixed(0)}%`);
  console.log(`reason: ${batch.classification.reason}`);
  console.log(`sections: ${batch.extracted.sections.length}`);
  for (const s of batch.extracted.sections) {
    console.log(`  ${s.label} — ${s.rows.length} rows${s.subtotal ? ` (subtotal $${s.subtotal.amount})` : ""}`);
  }
  console.log(`mappings: ${batch.mappings.length}  (auto-accepted: ${batch.mappings.filter((m) => m.status === "auto_accepted").length}, review: ${batch.mappings.filter((m) => m.status === "needs_review").length}, unresolved: ${batch.mappings.filter((m) => m.status === "unresolved").length})`);
  console.log(`validation: ${batch.issues.length} issue${batch.issues.length === 1 ? "" : "s"} · overall ${batch.status}`);
  for (const i of batch.issues.slice(0, 6)) {
    console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
  }
  console.log("---");

  // Classification
  assert(batch.classification.documentType === "fee_schedule",
    "documentType resolves to fee_schedule");

  // Extraction structure
  assert(batch.extracted.sections.length >= 1, "at least one section was detected");

  const allRows = batch.extracted.sections.flatMap((s) => s.rows);
  const feePlusDeposit = allRows.find((r) => r.rowType === "fee_plus_deposit");
  assert(feePlusDeposit, "at least one fee_plus_deposit row was detected");

  const hourly = allRows.find((r) => r.rowType === "hourly_rate");
  assert(hourly, "the staff-hourly-rate row was detected as hourly_rate");

  const formula = allRows.find((r) => r.rowType === "formula_or_multiplier");
  assert(formula, "the building-permit row was detected as formula_or_multiplier");

  const sectionWithSubtotal = batch.extracted.sections.find((s) => s.subtotal);
  assert(sectionWithSubtotal, "at least one section carries its subtotal");

  // Mapping
  assert(batch.mappings.length === allRows.length,
    `${allRows.length} extracted rows -> ${batch.mappings.length} mapping candidates`);

  // Validation — there should be issues (low-confidence service matches at minimum)
  // but the batch shouldn't be ERROR because no field is structurally invalid.
  assert(batch.issues.length > 0, "validation surfaces at least one issue");
  assert(batch.status !== "ERROR", `batch status is ${batch.status} (not ERROR)`);

  console.log("\n✓ pipeline smoke passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
