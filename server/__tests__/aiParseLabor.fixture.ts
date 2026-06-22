import assert from "node:assert/strict";
import {
  discoverLaborTableSemantics,
  extractLaborRowsFromPdfTables,
  laborRosterHybridEnabled,
  parseLaborTableSemantics,
} from "../aiParseLabor";
import type { TextItem } from "../pdfTableExtract";

function item(text: string, x: number, y: number, width = 40, page = 1): TextItem {
  return { text, x, y, width, height: 10, page };
}

{
  assert.equal(laborRosterHybridEnabled(undefined), true);
  assert.equal(laborRosterHybridEnabled("1"), true);
  assert.equal(laborRosterHybridEnabled("0"), false);
  console.log("  ✓ labor roster hybrid is default-on with explicit opt-out");
}

{
  const semantics = parseLaborTableSemantics(`
    {
      "tables": [
        {
          "page": 12,
          "dept": "PLAN",
          "titleColumnHeader": "Position",
          "fteColumnHeader": "FTE",
          "hoursColumnHeader": "Productive Hours"
        },
        { "page": "bad", "dept": "NOPE", "titleColumnHeader": "" }
      ]
    }
  `);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 12);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].titleColumnHeader, "Position");
  console.log("  ✓ labor table semantics parse valid rows and drop invalid rows");
}

{
  const items: TextItem[] = [
    item("Position", 80, 10, 70),
    item("Dept", 240, 10, 40),
    item("FTE", 330, 10, 35),
    item("Productive Hours", 430, 10, 100),
    item("Senior Planner", 80, 30, 100),
    item("PLAN", 240, 30, 35),
    item("0.80", 335, 30, 35),
    item("1,720", 440, 30, 45),
    item("Vacant Planner", 80, 50, 100),
    item("PLAN", 240, 50, 35),
    item("1.00", 335, 50, 35),
    item("1,720", 440, 50, 45),
    item("TOTAL", 80, 70, 45),
    item("1.80", 335, 70, 35),
  ];
  const rows = extractLaborRowsFromPdfTables(items, [{
    page: 1,
    titleColumnHeader: "Position",
    deptColumnHeader: "Dept",
    fteColumnHeader: "FTE",
    hoursColumnHeader: "Productive Hours",
  }]);
  assert.deepEqual(rows, [{
    title: "Senior Planner",
    dept: "PLAN",
    fte: 0.8,
    hours: 1720,
    confidence: "high",
  }]);
  console.log("  ✓ deterministic labor extraction reads title/dept/fte/hours");
}

{
  const items: TextItem[] = [
    item("Position", 80, 10, 70),
    item("Department", 240, 10, 80),
    item("FTE", 360, 10, 35),
    item("Building Inspector II", 80, 30, 130),
    item("BLDG", 245, 30, 35),
    item("1.00", 365, 30, 35),
  ];
  const rows = extractLaborRowsFromPdfTables(items, [{
    page: 1,
    titleColumnHeader: "Position",
    deptColumnHeader: "Department",
    fteColumnHeader: "FTE",
  }]);
  assert.deepEqual(rows, [{
    title: "Building Inspector II",
    dept: "BLDG",
    fte: 1,
    hours: 1720,
    confidence: "low",
  }]);
  console.log("  ✓ deterministic labor extraction defaults missing productive hours");
}

{
  const items: TextItem[] = [
    item("Planning Department Staffing", 40, 1, 160, 4),
    item("Job Title", 80, 10, 70, 4),
    item("FTE", 260, 10, 35, 4),
    item("Planner I", 80, 30, 70, 4),
    item("1.00", 265, 30, 35, 4),
  ];
  const semantics = discoverLaborTableSemantics(items);
  assert.equal(semantics.length, 1);
  assert.equal(semantics[0].page, 4);
  assert.equal(semantics[0].dept, "PLAN");
  assert.equal(semantics[0].titleColumnHeader, "Job Title");
  console.log("  ✓ labor table discovery infers dept from staffing page text");
}

console.log("\nAll aiParseLabor assertions passed.");
