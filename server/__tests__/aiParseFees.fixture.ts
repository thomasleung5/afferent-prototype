import assert from "node:assert/strict";
import {
  discoverFeeTableSemantics,
  extractFeeRowsFromPdfTables,
  feeScheduleHybridEnabled,
  parseFeeTableSemantics,
} from "../aiParseFees";
import type { TextItem } from "../pdfTableExtract";

function item(text: string, x: number, y: number, width = 40, page = 1): TextItem {
  return { text, x, y, width, height: 10, page };
}

{
  assert.equal(feeScheduleHybridEnabled(undefined), true);
  assert.equal(feeScheduleHybridEnabled("1"), true);
  assert.equal(feeScheduleHybridEnabled("0"), false);
  console.log("  ✓ fee schedule hybrid is default-on with explicit opt-out");
}

{
  const semantics = parseFeeTableSemantics(`
    {
      "tables": [
        {
          "page": 24,
          "dept": "PLAN",
          "serviceColumnHeader": "Fee Name",
          "unitColumnHeader": "Fee Type / Unit",
          "feeColumnHeader": "Current Fee / Deposit"
        },
        { "page": 2, "serviceColumnHeader": "Fee Name" }
      ]
    }
  `);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 24);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].feeColumnHeader, "Current Fee / Deposit");
  console.log("  ✓ fee table semantics require service and current-fee headers");
}

{
  const page = 3;
  const items: TextItem[] = [
    item("Fee No.", 20, 10, 40, page),
    item("Fee Name", 90, 10, 90, page),
    item("Fee Type / Unit", 230, 10, 70, page),
    item("Cost of Service", 360, 10, 85, page),
    item("Current Fee / Deposit", 480, 10, 90, page),
    item("Rec'd Fee Level / Deposit", 610, 10, 100, page),

    item("Planning Fee Schedule", 90, 30, 130, page),
    item("1", 30, 40, 10, page),
    item("General", 90, 40, 60, page),
    item("A. Pre-Application Meeting", 90, 50, 140, page),

    item("i. First 15 minutes", 100, 70, 110, page),
    item("per meeting", 230, 70, 70, page),
    item("$ 75", 365, 70, 45, page),
    item("No Charge", 485, 70, 65, page),
    item("$ 75", 615, 70, 45, page),

    item("ii. Formal Meeting", 100, 90, 110, page),
    item("per meeting", 230, 90, 70, page),
    item("$ 603", 365, 90, 45, page),
    item("$ 520", 490, 90, 45, page),
    item("$ 603", 615, 90, 45, page),
  ];

  const rows = extractFeeRowsFromPdfTables(items, [{
    page,
    dept: "PLAN",
    serviceColumnHeader: "Fee Name",
    unitColumnHeader: "Fee Type / Unit",
    feeColumnHeader: "Current Fee / Deposit",
  }]);

  assert.deepEqual(rows, [
    {
      name: "General - Pre-Application Meeting - First 15 minutes",
      dept: "PLAN",
      unit: "per meeting",
      fee: 0,
      confidence: "high",
    },
    {
      name: "General - Pre-Application Meeting - Formal Meeting",
      dept: "PLAN",
      unit: "per meeting",
      fee: 520,
      confidence: "high",
    },
  ]);
  console.log("  ✓ deterministic fee extraction reads current fee column only");
}

{
  const items: TextItem[] = [
    item("Town of Los Altos Hills", 20, 1, 90, 7),
    item("APPENDIX A.1", 500, 1, 80, 7),
    item("Planning Fee Schedule", 80, 5, 120, 7),
    item("Fee Name", 100, 10, 80, 7),
    item("Current Fee / Deposit", 300, 10, 90, 7),
    item("Site Development Hearing Review", 100, 30, 150, 7),
    item("$ 4,160", 310, 30, 60, 7),
  ];
  const semantics = discoverFeeTableSemantics(items);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 7);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].feeColumnHeader, "Current Fee / Deposit");
  console.log("  ✓ fee table discovery finds fee-schedule pages");
}

console.log("\nAll aiParseFees assertions passed.");
