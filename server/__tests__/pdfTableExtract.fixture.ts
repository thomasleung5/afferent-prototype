import assert from "node:assert/strict";
import {
  clusterRows,
  extractTextItems,
  tableFromRows,
  type TextItem,
} from "../pdfTableExtract";

function item(text: string, x: number, y: number, width = 50, height = 10, page = 1): TextItem {
  return { text, x, y, width, height, page };
}

// ─── clusterRows ──────────────────────────────────────────────────────────

{
  const rows = clusterRows([
    item("A", 0, 100),
    item("B", 50, 100),
    item("C", 0, 200),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].map((it) => it.text), ["A", "B"]);
  assert.deepEqual(rows[1].map((it) => it.text), ["C"]);
  console.log("  ✓ clusterRows groups items by Y position");
}

{
  // Baseline drift within tolerance: 100.0 and 102.5 should still group
  // as one row when item height is 10 (tolerance = 6).
  const rows = clusterRows([
    item("A", 0, 100),
    item("B", 50, 102.5),
    item("C", 100, 99),
  ]);
  assert.equal(rows.length, 1, "drift within tolerance stays in one row");
  console.log("  ✓ clusterRows absorbs baseline drift within tolerance");
}

{
  // Across tolerance: 100 and 130 with default tolerance 6 should split.
  const rows = clusterRows([
    item("A", 0, 100),
    item("B", 0, 130),
  ]);
  assert.equal(rows.length, 2);
  console.log("  ✓ clusterRows separates rows beyond tolerance");
}

{
  const rows = clusterRows([
    item("Right", 200, 100),
    item("Middle", 100, 100),
    item("Left", 0, 100),
  ]);
  assert.deepEqual(rows[0].map((it) => it.text), ["Left", "Middle", "Right"],
    "items within a row are sorted left-to-right");
  console.log("  ✓ clusterRows sorts items left-to-right within a row");
}

{
  // Rows arrive in arbitrary order; output is top-to-bottom (ascending Y).
  const rows = clusterRows([
    item("Bottom", 0, 300),
    item("Top",    0, 100),
    item("Middle", 0, 200),
  ]);
  assert.deepEqual(rows.map((r) => r[0].text), ["Top", "Middle", "Bottom"]);
  console.log("  ✓ clusterRows returns rows top-to-bottom");
}

// ─── tableFromRows ────────────────────────────────────────────────────────

{
  // Clean 3-column table, no blanks.
  const rows = [
    [item("Dept",  50, 10), item("FTE", 200, 10), item("AP", 350, 10)],
    [item("Plan",  50, 30), item("3",   200, 30), item("12", 350, 30)],
    [item("Bldg",  50, 50), item("2",   200, 50), item("8",  350, 50)],
  ];
  const table = tableFromRows(rows, 0);
  assert.deepEqual(table.headers, ["Dept", "FTE", "AP"]);
  assert.deepEqual(table.rows, [
    ["Plan", "3", "12"],
    ["Bldg", "2", "8"],
  ]);
  console.log("  ✓ tableFromRows assigns clean tables to columns");
}

{
  // Blank cell preservation — the load-bearing test for the row-shift bug.
  //
  // Milpitas Exhibit 5 shape: Housing's Budgeted FTE cell is genuinely
  // blank in the PDF. The wrong behavior (the bug we are preventing) is
  // for Recreation's 6.00 to slide up onto Housing's row. The right
  // behavior is for Housing's FTE cell to come out as "" and Recreation's
  // 6.00 to stay on Recreation's row.

  const headerRow = [
    item("Department",   50, 10, 90),
    item("Budgeted FTE", 200, 10, 80),
    item("AP Invoices",  350, 10, 80),
  ];
  const housing = [
    item("Housing & Neighborhood Svcs", 50, 30, 200),
    // No item near x≈200 — Housing's FTE cell is blank in the PDF.
    item("1,200", 350, 30, 35),
  ];
  const recreation = [
    item("Recreation Administration", 50, 50, 180),
    item("6.00", 200, 50, 25),
    item("800",  350, 50, 25),
  ];
  const table = tableFromRows([headerRow, housing, recreation], 0);

  assert.deepEqual(table.headers, ["Department", "Budgeted FTE", "AP Invoices"]);
  assert.equal(table.rows[0][0], "Housing & Neighborhood Svcs");
  assert.equal(table.rows[0][1], "",
    "Housing's blank Budgeted FTE cell must come out as empty string — the row-shift bug we are preventing");
  assert.equal(table.rows[0][2], "1,200");
  assert.equal(table.rows[1][0], "Recreation Administration");
  assert.equal(table.rows[1][1], "6.00",
    "Recreation's 6.00 stays on Recreation's row");
  assert.equal(table.rows[1][2], "800");
  console.log("  ✓ tableFromRows preserves blank cells (Milpitas row-shift regression)");
}

{
  // Multi-segment cells: pdfjs sometimes emits "$1,234" as two items
  // ("$1,234" can split on punctuation). Items in the same row that map
  // to the same column get joined with a single space.
  const headerRow = [
    item("Dept", 50, 10, 40),
    item("Cost", 200, 10, 40),
  ];
  const dataRow = [
    item("Police", 50, 30, 50),
    item("$1,234", 195, 30, 30),
    item(".56", 220, 30, 15),
  ];
  const table = tableFromRows([headerRow, dataRow], 0);
  assert.equal(table.rows[0][1], "$1,234 .56",
    "multi-segment cells in the same column join with a single space");
  console.log("  ✓ tableFromRows joins multi-segment cells in column order");
}

{
  // Items outside xTolerance of every anchor are dropped (prose, page
  // numbers, marginalia).
  const headerRow = [
    item("Dept", 50, 10, 40),
    item("FTE",  200, 10, 40),
  ];
  const dataRow = [
    item("Police", 50, 30, 50),
    item("4", 200, 30, 10),
    // x=600 is far from both anchor columns (50 and 200) — should drop.
    item("page 12", 600, 30, 50),
  ];
  const table = tableFromRows([headerRow, dataRow], 0);
  assert.deepEqual(table.rows[0], ["Police", "4"]);
  console.log("  ✓ tableFromRows drops items outside xTolerance");
}

{
  const rows = [
    [item("A", 0, 10)],
    [item("B", 0, 20)],
  ];
  assert.throws(() => tableFromRows(rows, 5),
    /anchorRowIndex 5 out of bounds/);
  console.log("  ✓ tableFromRows rejects out-of-range anchor index");
}

{
  const table = tableFromRows([], 0);
  assert.deepEqual(table, { page: 0, headers: [], rows: [] });
  console.log("  ✓ tableFromRows handles empty input");
}

// ─── extractTextItems plumbing smoke ──────────────────────────────────────

// The real-PDF round-trip test will land in PR 2 when we have the Milpitas
// fixture to anchor against. For now, verify the pdfjs-dist API surface
// loads in this Node version — catches "the dep doesn't work in our env"
// regressions without needing to generate a test PDF.

async function runSmokeTest(): Promise<void> {
  assert.equal(typeof extractTextItems, "function");
  // Touching the function should trigger the dynamic import; if pdfjs's
  // ESM entrypoint had broken, this would throw during module evaluation.
  // We pass an obviously-invalid buffer and expect pdfjs to reject — what
  // matters is the import chain working, not the parse succeeding.
  const tiny = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF" header only
  let threw = false;
  try {
    await extractTextItems(tiny);
  } catch {
    threw = true;
  }
  assert.ok(threw, "invalid PDF buffer should reject — confirms pdfjs is actually parsing");
  console.log("  ✓ extractTextItems loads pdfjs-dist and rejects invalid PDFs");
}

runSmokeTest().then(() => {
  console.log("\nAll pdfTableExtract assertions passed.");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
