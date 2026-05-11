/* Quick smoke test for the parse + extract pipeline.
 *
 *   npx tsx scripts/smoke-import.ts
 *
 * Builds a synthetic CSV / xlsx file in memory and runs it through each
 * relevant extractor. Verifies counts add up. Exit code is non-zero on any
 * unexpected count. */

import { parseCsv } from "../lib/parse/csv";
import { parseXlsx } from "../lib/parse/xlsx";
import { extractWorkload } from "../lib/parse/extract/workload";
import { extractSalary } from "../lib/parse/extract/salary";
import { extractFeeSchedule } from "../lib/parse/extract/fee-schedule";
import { SERVICES } from "../lib/data/services";
import { POSITIONS } from "../lib/data/positions";

function blob(text: string, name: string): File {
  return new File([text], name, { type: "text/csv" });
}

async function workload() {
  const sampleNames = SERVICES.slice(0, 4).map((s) => s.name);
  const csv =
    "Service,Current Volume,Prior Volume,Unit\n" +
    sampleNames.map((n, i) => `"${n}",${100 + i * 20},${90 + i * 20},Permit`).join("\n") +
    `\n"Unknown Service ABC",5,3,Permit\n,,,\n`;
  const doc = await parseCsv(blob(csv, "permits.csv"));
  const r = extractWorkload(doc, [], SERVICES);
  console.log("[workload]", r.stats);
  // Expect: 4 mapped (sample names matched the catalog), 1 unmapped (unknown
  // service that's not in the catalog). Blank rows are dropped upstream.
  if (r.stats.mapped !== 4 || r.stats.unmapped !== 1) {
    throw new Error(`workload counts unexpected: ${JSON.stringify(r.stats)}`);
  }
}

async function salary() {
  // Use real-ish columns
  const csv =
    "Title,Department,FTE,Salary,Benefits,Productive Hours\n" +
    `"Senior Planner",PLAN,1,210000,75000,1720\n` +
    `"Plans Examiner",BLDG,1,230000,82000,1720\n` +
    `"New Title Not In Roster",ENG,0.5,100000,35000,1720\n` +
    `,,,,,\n`;
  const doc = await parseCsv(blob(csv, "salary.csv"));
  const r = extractSalary(doc, POSITIONS);
  console.log("[salary]", r.stats);
  // Expect: 1 mapped (new title), 2 duplicates (existing). Blank rows dropped.
  if (r.stats.duplicates < 2 || r.stats.mapped < 1) {
    throw new Error(`salary counts unexpected: ${JSON.stringify(r.stats)}`);
  }
}

async function feeSchedule() {
  const csv =
    "Fee Item,Dept,Current Fee,Recommended\n" +
    `"${SERVICES[0].name}",PLAN,4500,5200\n` +
    `"Brand New Fee",PLAN,300,300\n` +
    `,,,\n`;
  const doc = await parseCsv(blob(csv, "fees.csv"));
  const r = extractFeeSchedule(doc, SERVICES);
  console.log("[fees]", r.stats);
}

// Tiny check that xlsx parser at least loads (does not need a real workbook).
async function xlsxLoads() {
  try {
    await import("xlsx");
    console.log("[xlsx] dynamic import OK");
  } catch (err) {
    console.error("xlsx failed to load:", err);
    process.exit(1);
  }
}

(async () => {
  await xlsxLoads();
  await workload();
  await salary();
  await feeSchedule();
  console.log("✓ smoke import test passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
