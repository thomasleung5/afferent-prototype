import assert from "node:assert/strict";
import {
  discoverVolumeTableSemantics,
  extractVolumeRowsFromPdfTables,
  parseVolumeTableSemantics,
  volumeCatalogHybridEnabled,
} from "../aiParseVolume";
import type { TextItem } from "../pdfTableExtract";

function item(text: string, x: number, y: number, width = 40, page = 1): TextItem {
  return { text, x, y, width, height: 10, page };
}

{
  assert.equal(volumeCatalogHybridEnabled(undefined), true);
  assert.equal(volumeCatalogHybridEnabled("1"), true);
  assert.equal(volumeCatalogHybridEnabled("0"), false);
  console.log("  ✓ volume hybrid is default-on with explicit opt-out");
}

{
  const semantics = parseVolumeTableSemantics(`
    {
      "tables": [
        {
          "page": 24,
          "dept": "PLAN",
          "serviceColumnHeader": "Fee Name",
          "unitColumnHeader": "Fee Type / Unit",
          "currentColumnHeader": "Estimated Volume of Activity"
        },
        { "page": "bad", "dept": "NOPE", "serviceColumnHeader": "" }
      ]
    }
  `);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 24);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].serviceColumnHeader, "Fee Name");
  console.log("  ✓ volume table semantics parse valid rows and drop invalid rows");
}

{
  const page = 3;
  const items: TextItem[] = [
    item("Fee No.", 20, 10, 40, page),
    item("Fee Name", 90, 10, 90, page),
    item("Fee Type / Unit", 230, 10, 70, page),
    item("Estimated Volume of Activity", 420, 10, 120, page),

    item("Planning Fee Schedule", 90, 30, 130, page),
    item("1", 30, 40, 10, page),
    item("General", 90, 40, 60, page),
    item("A. Pre-Application Meeting", 90, 50, 140, page),

    item("i. First 15 minutes", 100, 70, 110, page),
    item("per meeting", 230, 70, 70, page),
    item("-", 450, 70, 10, page),

    item("ii. Formal Meeting", 100, 90, 110, page),
    item("per meeting", 230, 90, 70, page),
    item("46", 450, 90, 25, page),
  ];

  const rows = extractVolumeRowsFromPdfTables(items, [{
    page,
    dept: "PLAN",
    serviceColumnHeader: "Fee Name",
    unitColumnHeader: "Fee Type / Unit",
    currentColumnHeader: "Estimated Volume of Activity",
  }]);

  assert.deepEqual(rows, [{
    name: "General - Pre-Application Meeting - Formal Meeting",
    dept: "PLAN",
    prior: null,
    current: 46,
    unit: "per meeting",
    confidence: "high",
  }]);
  console.log("  ✓ deterministic fee-schedule volume extraction reads current volume");
}

{
  const items: TextItem[] = [
    item("Service", 80, 10, 70),
    item("Dept", 220, 10, 40),
    item("Prior Year", 320, 10, 70),
    item("Current Count", 430, 10, 80),
    item("Building Permit", 80, 30, 100),
    item("BLDG", 220, 30, 35),
    item("142", 330, 30, 25),
    item("165", 440, 30, 25),
    item("TOTAL", 80, 50, 45),
    item("307", 440, 50, 25),
  ];
  const rows = extractVolumeRowsFromPdfTables(items, [{
    page: 1,
    serviceColumnHeader: "Service",
    deptColumnHeader: "Dept",
    priorColumnHeader: "Prior Year",
    currentColumnHeader: "Current Count",
  }]);
  assert.deepEqual(rows, [{
    name: "Building Permit",
    dept: "BLDG",
    prior: 142,
    current: 165,
    confidence: "high",
  }]);
  console.log("  ✓ deterministic generic volume extraction reads prior/current counts");
}

{
  const items: TextItem[] = [
    item("Town of Los Altos Hills", 20, 1, 90, 7),
    item("APPENDIX A.1", 500, 1, 80, 7),
    item("Planning Fee Schedule", 80, 5, 120, 7),
    item("Fee Name", 100, 10, 80, 7),
    item("Estimated Volume of Activity", 300, 10, 120, 7),
    item("Site Development Hearing Review", 100, 30, 150, 7),
    item("10", 330, 30, 25, 7),
  ];
  const semantics = discoverVolumeTableSemantics(items);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 7);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].currentColumnHeader, "Estimated Volume of Activity");
  console.log("  ✓ volume table discovery finds fee-schedule volume pages");
}

console.log("\nAll aiParseVolume assertions passed.");
