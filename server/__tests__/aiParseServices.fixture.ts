import assert from "node:assert/strict";
import {
  discoverServiceTableSemantics,
  extractServiceRowsFromPdfTables,
  parseServiceTableSemantics,
  serviceCatalogHybridEnabled,
} from "../aiParseServices";
import type { TextItem } from "../pdfTableExtract";

function item(text: string, x: number, y: number, width = 40, page = 1): TextItem {
  return { text, x, y, width, height: 10, page };
}

{
  assert.equal(serviceCatalogHybridEnabled(undefined), true);
  assert.equal(serviceCatalogHybridEnabled("1"), true);
  assert.equal(serviceCatalogHybridEnabled("0"), false);
  console.log("  ✓ service catalog hybrid is default-on with explicit opt-out");
}

{
  const semantics = parseServiceTableSemantics(`
    Here are the tables:
    {
      "tables": [
        {
          "page": 24,
          "dept": "PLAN",
          "serviceColumnHeader": "Fee Name",
          "hoursColumnHeader": "Estimated Average Labor Time Per Activity (hours)",
          "volumeColumnHeader": "Estimated Volume of Activity",
          "feeColumnHeader": "Current Fee / Deposit",
          "targetColumnHeader": "Rec'd Cost Recovery %"
        },
        { "page": "bad", "dept": "NOPE", "serviceColumnHeader": "" }
      ]
    }
  `);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 24);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].serviceColumnHeader, "Fee Name");
  console.log("  ✓ service table semantics parse valid rows and drop invalid rows");
}

{
  const page = 24;
  const items: TextItem[] = [
    item("Fee No.", 20, 10, 40, page),
    item("Fee Name", 90, 10, 90, page),
    item("Fee Type / Unit", 230, 10, 70, page),
    item("Estimated Average Labor Time Per Activity (hours)", 340, 10, 100, page),
    item("Current Fee / Deposit", 480, 10, 80, page),
    item("Rec'd Cost Recovery %", 600, 10, 70, page),
    item("Estimated Volume of Activity", 700, 10, 80, page),

    item("Planning Fee Schedule", 90, 30, 130, page),
    item("1", 30, 40, 10, page),
    item("General", 90, 40, 60, page),
    item("A. Pre-Application Meeting", 90, 50, 140, page),

    item("i. First 15 minutes", 100, 70, 110, page),
    item("per meeting", 230, 70, 70, page),
    item("0.25", 360, 70, 35, page),
    item("No Charge", 485, 70, 65, page),
    item("100%", 610, 70, 40, page),

    item("ii. Formal Meeting", 100, 90, 110, page),
    item("per meeting", 230, 90, 70, page),
    item("2.00", 360, 90, 35, page),
    item("$ 520", 490, 90, 45, page),
    item("100%", 610, 90, 40, page),
    item("46", 710, 90, 25, page),

    item("TOTALS", 90, 110, 50, page),
  ];

  const rows = extractServiceRowsFromPdfTables(items, [{
    page,
    dept: "PLAN",
    serviceColumnHeader: "Fee Name",
    hoursColumnHeader: "Estimated Average Labor Time Per Activity (hours)",
    feeColumnHeader: "Current Fee / Deposit",
    targetColumnHeader: "Rec'd Cost Recovery %",
    volumeColumnHeader: "Estimated Volume of Activity",
  }]);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => ({
      name: row.name,
      dept: row.dept,
      hours: row.hours,
      fee: row.fee,
      target: row.target,
      volume: row.volume,
    })),
    [
      {
        name: "General - Pre-Application Meeting - First 15 minutes",
        dept: "PLAN",
        hours: 0.25,
        fee: 0,
        target: 100,
        volume: undefined,
      },
      {
        name: "General - Pre-Application Meeting - Formal Meeting",
        dept: "PLAN",
        hours: 2,
        fee: 520,
        target: 100,
        volume: 46,
      },
    ],
  );
  assert.ok(rows.every((row) => row.confidence === "high"));
  console.log("  ✓ deterministic service extraction reads selected table columns");
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
  const semantics = discoverServiceTableSemantics(items);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 7);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].serviceColumnHeader, "Fee Name");
  console.log("  ✓ service table discovery finds repeated fee-name pages");
}

{
  const items: TextItem[] = [
    item("Service Name", 100, 10, 90),
    item("Department", 260, 10, 80),
    item("Business License Review", 100, 30, 130),
    item("FIN", 270, 30, 30),
  ];
  const rows = extractServiceRowsFromPdfTables(items, [{
    page: 1,
    serviceColumnHeader: "Service Name",
    deptColumnHeader: "Department",
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Business License Review");
  assert.equal(rows[0].dept, "FIN");
  assert.equal(rows[0].confidence, "low");
  console.log("  ✓ service catalog extraction supports name/dept-only tables");
}

console.log("\nAll aiParseServices assertions passed.");
