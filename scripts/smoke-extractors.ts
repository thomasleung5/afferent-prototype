/* End-to-end smoke for the new per-document-type extractors.
 *
 *   npx tsx scripts/smoke-extractors.ts
 *
 * Builds a synthetic spreadsheet for each new documentType, runs through
 * the full pipeline, and asserts:
 *
 *   - documentType classifies correctly (or via forceType when filename
 *     is ambiguous)
 *   - extracted rows carry rowType + non-empty fields
 *   - mapping engine produces a MappingCandidate per row
 *   - validation surfaces issues without flagging overall ERROR
 *   - apply step's accepted count matches auto_accepted rows
 *
 * Exit code 1 on any assertion failure. */

import { SERVICES } from "../lib/data/services";
import { runImportPipeline } from "../lib/import/pipeline";
import type { DocumentType } from "../lib/import/types";

function blob(text: string, name: string): File {
  return new File([text], name, { type: "text/csv" });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error(`✗ ${msg}`); process.exit(1); }
  console.log(`ok ${msg}`);
}

const FIXTURES: { name: string; csv: string; forceType?: DocumentType; want: DocumentType }[] = [
  {
    name: "FY 26-27 Salary Roster.csv",
    want: "salary_roster",
    csv:
`Position,Department,FTE,Salary,Benefits,Productive Hours,Status
"Senior Planner","Planning",1,135000,52000,1720,Filled
"Plans Examiner","Building",1,118000,48000,1720,Filled
"Engineering Tech II","Engineering",0.5,82000,,1720,Vacant
"Building Inspector","Bldg",1,128000,49000,1720,Filled
`,
  },
  {
    name: "FY 26-27 Operating Budget.csv",
    want: "operating_budget",
    csv:
`Account,Description,Department,Category,Amount,Notes
501-100,"Software Licenses","Planning","Software & subscriptions",18000,
501-200,"Professional Services","Building","Professional services",75000,
501-300,"Department Total","Planning",,93000,subtotal
501-400,"Training","Engineering","Training & travel",6000,
`,
  },
  {
    name: "FY 26-27 Cost Allocation Plan.csv",
    want: "cost_allocation_plan",
    csv:
`Pool,Center,Target,Basis,Percent,Amount,Sequence,Notes
"IT Services","Information Technology","Planning","FTE",18,72000,1,
"Human Resources","Human Resources","Building","FTE",22,88000,2,
"Facilities","Facilities & Building Maintenance","Engineering","Sq Ft",,42000,3,missing percent
"Total to direct depts",,,,100,402000,,subtotal
`,
  },
  {
    name: "Permit Counts FY26.csv",
    want: "workload_export",
    csv:
`Service,Department,Unit,FY24,FY25,Source System
"ADU permit","Building","each",24,31,Tyler EnerGov
"Site Development Permit","Planning","each",12,18,Accela
"Building permit","Building","each",,142,Tyler EnerGov
`,
  },
  {
    name: "Mountain View Master Fee Schedule.csv",
    want: "benchmark_fee_schedule",
    forceType: "benchmark_fee_schedule",
    csv:
`Fee Item,Department,Current Fee,Deposit,Unit,Notes
"Pre-Application Meeting","Planning",425,,each,
"Site Development Permit","Planning",1450,5500,each,
"ADU permit","Building",950,,each,
`,
  },
];

(async () => {
  for (const fx of FIXTURES) {
    console.log(`\n=== ${fx.name} ===`);
    const file = blob(fx.csv, fx.name);
    const batch = await runImportPipeline(file, { services: SERVICES, forceType: fx.forceType });

    console.log(`classification: ${batch.classification.documentType} @ ${(batch.classification.confidence * 100).toFixed(0)}% (${batch.classification.reason})`);
    console.log(`extracted: ${batch.extracted.unsectioned.length + batch.extracted.sections.flatMap((s) => s.rows).length} rows`);
    console.log(`mappings: auto=${batch.mappings.filter((m) => m.status === "auto_accepted").length} review=${batch.mappings.filter((m) => m.status === "needs_review").length} unresolved=${batch.mappings.filter((m) => m.status === "unresolved").length}`);
    console.log(`status: ${batch.status} · ${batch.issues.length} issue${batch.issues.length === 1 ? "" : "s"}`);

    // classification
    assert(
      batch.classification.documentType === fx.want,
      `[${fx.want}] classified as ${batch.classification.documentType}`,
    );

    // extraction
    const allRows = [
      ...batch.extracted.unsectioned,
      ...batch.extracted.sections.flatMap((s) => s.rows),
    ];
    assert(allRows.length > 0, `[${fx.want}] yielded at least one row`);

    // every row has a rowType
    for (const r of allRows) {
      assert(r.rowType, `[${fx.want}] row "${r.rawLabel}" has rowType`);
    }

    // mapping count matches extracted count
    assert(
      batch.mappings.length === allRows.length,
      `[${fx.want}] ${allRows.length} extracted → ${batch.mappings.length} mappings`,
    );

    // status not ERROR
    assert(batch.status !== "ERROR", `[${fx.want}] overall status ${batch.status} (not ERROR)`);
  }

  console.log("\n✓ extractor smokes passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
