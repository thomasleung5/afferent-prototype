import assert from "node:assert/strict";
import {
  discoverOperatingTableSemantics,
  extractOperatingRowsFromPdfTables,
  operatingBudgetHybridEnabled,
  parseOperatingTableSemantics,
} from "../aiParseOperating";
import type { TextItem } from "../pdfTableExtract";

function item(text: string, x: number, y: number, width = 40, page = 1): TextItem {
  return { text, x, y, width, height: 10, page };
}

{
  assert.equal(operatingBudgetHybridEnabled(undefined), true);
  assert.equal(operatingBudgetHybridEnabled("1"), true);
  assert.equal(operatingBudgetHybridEnabled("0"), false);
  console.log("  ✓ operating budget hybrid is default-on with explicit opt-out");
}

{
  const semantics = parseOperatingTableSemantics(`
    {
      "tables": [
        {
          "page": 12,
          "dept": "PLAN",
          "sourceDept": "Planning Division",
          "codeColumnHeader": "Account",
          "lineColumnHeader": "Description",
          "categoryColumnHeader": "Category",
          "amountColumnHeader": "Adopted Budget",
          "fiscalYear": "FY 2025-26",
          "amountType": "adopted"
        },
        { "page": 2, "lineColumnHeader": "Description" }
      ]
    }
  `);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 12);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].amountType, "adopted");
  console.log("  ✓ operating table semantics require line and amount headers");
}

{
  const items: TextItem[] = [
    item("Account", 30, 10, 60),
    item("Department", 120, 10, 80),
    item("Category", 230, 10, 70),
    item("Description", 350, 10, 90),
    item("Adopted Budget", 520, 10, 100),

    item("51110", 30, 30, 45),
    item("PLAN", 120, 30, 35),
    item("Personnel", 230, 30, 70),
    item("Regular Salaries", 350, 30, 110),
    item("$850,000", 525, 30, 70),

    item("53120", 30, 50, 45),
    item("PLAN", 120, 50, 35),
    item("Professional & Contractual Services", 230, 50, 160),
    item("Consulting Services", 350, 50, 120),
    item("620,000", 525, 50, 70),

    item("Department Total", 350, 70, 110),
    item("$1,470,000", 525, 70, 80),
  ];
  const rows = extractOperatingRowsFromPdfTables(items, [{
    page: 1,
    codeColumnHeader: "Account",
    deptColumnHeader: "Department",
    categoryColumnHeader: "Category",
    lineColumnHeader: "Description",
    amountColumnHeader: "Adopted Budget",
    fiscalYear: "FY 2025-26",
    amountType: "adopted",
  }]);
  assert.deepEqual(rows, [
    {
      code: "51110",
      dept: "PLAN",
      sourceDept: "PLAN",
      fiscalYear: "FY 2025-26",
      amountType: "adopted",
      category: "Other Operational Expenses",
      line: "Regular Salaries",
      amount: 850000,
      include: true,
      confidence: "high",
    },
    {
      code: "53120",
      dept: "PLAN",
      sourceDept: "PLAN",
      fiscalYear: "FY 2025-26",
      amountType: "adopted",
      category: "Professional & Contractual Services",
      line: "Consulting Services",
      amount: 620000,
      include: true,
      confidence: "high",
    },
  ]);
  console.log("  ✓ deterministic operating extraction reads line item amounts and skips totals");
}

{
  const items: TextItem[] = [
    item("Description", 80, 10, 90),
    item("Budget", 240, 10, 70),
    item("Adjustment", 80, 30, 80),
    item("($12,500)", 245, 30, 70),
  ];
  const rows = extractOperatingRowsFromPdfTables(items, [{
    page: 1,
    dept: "FIN",
    lineColumnHeader: "Description",
    amountColumnHeader: "Budget",
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, -12500);
  assert.equal(rows[0].confidence, "high");
  console.log("  ✓ deterministic operating extraction reads parenthetical negatives");
}

{
  const items: TextItem[] = [
    item("Planning Fee Schedule", 20, 1, 120),
    item("Fee Name", 80, 10, 70),
    item("Cost of Service", 240, 10, 90),
    item("Current Fee / Deposit", 360, 10, 100),
    item("Site Development", 80, 30, 100),
    item("$4,160", 365, 30, 60),
  ];
  const semantics = discoverOperatingTableSemantics(items);
  assert.equal(semantics.length, 0);
  console.log("  ✓ operating discovery ignores fee schedule pages");
}

console.log("\nAll aiParseOperating assertions passed.");
