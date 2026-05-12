import { classify } from "../lib/parse/classify";
import type { ParsedDoc } from "../lib/parse";

function make(fileName: string, headers: string[]): ParsedDoc {
  return {
    format: "xlsx", fileName, rowCount: 0, warnings: [],
    sheets: [{ name: "S1", headers, rows: [] }],
  };
}

const cases: [string, string[], string | null][] = [
  ["FY 26-27 Salary Table.xlsx", ["Position", "FTE", "Salary", "Benefits"], "positions"],
  ["FY27 Operating Budget.csv", ["Account", "Object", "Category", "Amount"], "operating"],
  ["Fee Schedule Adopted 2026.csv", ["Fee", "Current Fee", "Department"], "fees"],
  ["Permit Counts FY25.csv", ["Permits Issued", "FY24", "FY25"], "workload"],
  ["CAP Plan FY26-27.xlsx", ["Pool", "Center", "Basis", "Allocation %"], "cap"],
  ["Service Catalog.xlsx", ["Service", "Hours per Unit", "Volume"], "services"],
  ["Random Spreadsheet.xlsx", ["Col1", "Col2", "Col3"], null],
];

let bad = 0;
for (const [fn, hdr, want] of cases) {
  const r = classify(make(fn, hdr));
  const ok = r.domain === want ? "ok" : "FAIL";
  if (r.domain !== want) bad++;
  console.log(`${ok} ${fn.padEnd(36)} -> ${r.domain ?? "(none)"} ${(r.confidence*100).toFixed(0)}% want=${want ?? "(none)"} :: ${r.reason}`);
}
if (bad > 0) process.exit(1);
