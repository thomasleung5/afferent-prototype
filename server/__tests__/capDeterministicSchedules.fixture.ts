import assert from "node:assert/strict";
import {
  extractReceiverUnitsFromPdf,
  parseBasisSemanticResponse,
} from "../capDeterministicSchedules";
import type { TextItem } from "../pdfTableExtract";

function item(text: string, x: number, y: number, width = 50, height = 10, page = 1): TextItem {
  return { text, x, y, width, height, page };
}

// ─── Milpitas row-shift regression ────────────────────────────────────────
//
// Synthetic shape of Exhibit 5's Budgeted FTE column. Housing's cell is
// genuinely blank in the PDF — no text item exists at (x≈200, y=Housing).
// Recreation has 6.00 on its own row. The AI parse (which we mock as the
// `receivers` input) lists both as receivers because it thinks Housing has
// 6.00. The deterministic resolver must:
//
//   - Find Housing's row, read its FTE cell as blank, OMIT Housing from
//     resolved receivers (instead of borrowing Recreation's 6.00)
//   - Find Recreation's row, read its FTE cell as 6.00, KEEP Recreation
//   - Find Police's row, read its FTE cell as 360.92, KEEP Police

{
  const pageItems: TextItem[] = [
    // Header row
    item("Department",   50, 10, 90),
    item("Budgeted FTE", 200, 10, 90),
    item("AP Invoices",  350, 10, 90),
    // Housing — blank FTE in the PDF
    item("Housing & Neighborhood Svcs", 50, 30, 200),
    item("1,200", 350, 30, 35),
    // Recreation — 6.00 FTE
    item("Recreation Administration", 50, 50, 180),
    item("6.00",                      200, 50, 25),
    item("800",                       350, 50, 25),
    // Police — 360.92 FTE
    item("Police Administration", 50, 70, 180),
    item("360.92",                200, 70, 35),
    item("12,400",                350, 70, 50),
  ];
  const receivers = [
    { dept: "Housing & Neighborhood Svcs", glCode: "100-410-0" },
    { dept: "Recreation Administration",   glCode: "100-420-0" },
    { dept: "Police Administration",       glCode: "100-700-0" },
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Budgeted FTE",
    receivers,
  });

  assert.ok(result, "schedule resolution should succeed");
  assert.equal(result.receivers.length, 2,
    "Housing must be omitted (blank cell); Recreation and Police kept");
  assert.equal(result.receivers[0].dept, "Recreation Administration");
  assert.equal(result.receivers[0].units, 6,
    "Recreation's 6.00 must NOT bleed onto Housing");
  assert.equal(result.receivers[1].dept, "Police Administration");
  assert.equal(result.receivers[1].units, 360.92);
  assert.equal(result.blankReceivers.length, 1,
    "Housing surfaces in blankReceivers for logging");
  assert.equal(result.blankReceivers[0].dept, "Housing & Neighborhood Svcs");
  assert.equal(result.unmatchedReceivers.length, 0);
  console.log("  ✓ Milpitas row-shift: Housing's blank FTE cell is correctly omitted");
}

// ─── Header column variations ─────────────────────────────────────────────

{
  // Case insensitivity and punctuation tolerance — "Budgeted F.T.E." in
  // the PDF should still resolve when the AI says "Budgeted FTE".
  const pageItems: TextItem[] = [
    item("Department",      50, 10, 90),
    item("Budgeted F.T.E.", 200, 10, 90),
    item("Public Works",    50, 30, 90),
    item("3.50",            200, 30, 25),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Budgeted FTE",
    receivers: [{ dept: "Public Works", glCode: "100-PW" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 3.5);
  console.log("  ✓ Header match is case + punctuation insensitive");
}

{
  // Allocation-factor exhibits often print a basis name above generic
  // subheaders like Value / Distribution. If the semantic pass returns the
  // basis name, the extractor must read the Value subcolumn underneath it,
  // not the parent label's own text position.
  const pageItems: TextItem[] = [
    item("Gross Operating Expenses",   190, 10, 160),
    item("Modified Operating Expenses", 390, 10, 170),
    item("Department",                  50, 25, 90),
    item("Value",                      200, 25, 45),
    item("Distribution",               285, 25, 75),
    item("Value",                      400, 25, 45),
    item("Distribution",               485, 25, 75),
    item("Planning",                    50, 45, 70),
    item("2,000",                      200, 45, 40),
    item("40%",                        285, 45, 25),
    item("1,500",                      400, 45, 40),
    item("30%",                        485, 45, 25),
  ];
  const gross = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Gross Operating Expenses",
    receivers: [{ dept: "Planning", glCode: "" }],
  });
  assert.ok(gross);
  assert.equal(gross.receivers.length, 1);
  assert.equal(gross.receivers[0].units, 2000);
  console.log("  ✓ Two-line headers: basis label resolves to its Value subcolumn");
}

{
  // If the semantic pass reports the literal subheader "Value", use the
  // basis name to bind that generic column to the correct parent group.
  const pageItems: TextItem[] = [
    item("Gross Operating Expenses",   190, 10, 160),
    item("Modified Operating Expenses", 390, 10, 170),
    item("Department",                  50, 25, 90),
    item("Value",                      200, 25, 45),
    item("Distribution",               285, 25, 75),
    item("Value",                      400, 25, 45),
    item("Distribution",               485, 25, 75),
    item("Planning",                    50, 45, 70),
    item("2,000",                      200, 45, 40),
    item("40%",                        285, 45, 25),
    item("1,500",                      400, 45, 40),
    item("30%",                        485, 45, 25),
  ];
  const modified = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Value",
    basisName: "Modified Operating Expenses",
    receivers: [{ dept: "Planning", glCode: "" }],
  });
  assert.ok(modified);
  assert.equal(modified.receivers.length, 1);
  assert.equal(modified.receivers[0].units, 1500);
  console.log("  ✓ Generic Value subheaders are disambiguated by basis name");
}

{
  // Milpitas City Attorney Workload sits next to the FTE Value column.
  // If the AI supplies the adjacent FTE printed total by mistake, that
  // bad total must not override the exact City Attorney Workload header.
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35),
    item("Organization", 100, 10, 80),
    item("Division or Cost Pool", 200, 10, 120),
    item("City Council Agenda Items", 430, 10, 160),
    item("Full Time Equivalent Employees", 550, 10, 190),
    item("City Attorney Workload", 670, 10, 170),
    item("No.", 50, 25, 25),
    item("Title", 100, 25, 35),
    item("No.", 200, 25, 25),
    item("Title", 250, 25, 35),
    item("No.", 300, 25, 25),
    item("Title", 350, 25, 35),
    item("Value", 430, 25, 45),
    item("Value", 550, 25, 45),
    item("Value", 670, 25, 45),
    item("400", 50, 45, 25),
    item("Water M & O Fund", 100, 45, 110),
    item("0", 200, 45, 10),
    item("Total Fund", 250, 45, 60),
    item("0", 300, 45, 10),
    item("Total Fund", 350, 45, 60),
    item("45", 430, 45, 20),
    item("21.75", 550, 45, 35),
    item("1,748", 670, 45, 40),
    item("450", 50, 65, 25),
    item("Sewer M & O Fund", 100, 65, 110),
    item("0", 200, 65, 10),
    item("Total Fund", 250, 65, 60),
    item("0", 300, 65, 10),
    item("Total Fund", 350, 65, 60),
    item("14", 430, 65, 20),
    item("15.58", 550, 65, 35),
    item("473", 670, 65, 30),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "City Attorney Workload",
    basisName: "City Attorney Workload",
    expectedTotal: 37.33,
    receivers: [
      { dept: "Water M & O Fund", glCode: "400-0-0" },
      { dept: "Sewer M & O Fund", glCode: "450-0-0" },
    ],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 2);
  assert.equal(result.receivers[0].units, 1748);
  assert.equal(result.receivers[1].units, 473);
  console.log("  ✓ Exact City Attorney Workload header wins over an adjacent printed total");
}

{
  // Real Milpitas failure mode: derive all receivers from the PDF, keep
  // fund-level rows, and do not let a mistaken adjacent FTE total switch
  // the basis to FTE. This keeps Redevelopment and utility fund workload
  // values intact.
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35),
    item("Organization", 100, 10, 80),
    item("Division or Cost Pool", 200, 10, 120),
    item("City Council Agenda Items", 430, 10, 160),
    item("Full Time Equivalent Employees", 550, 10, 190),
    item("City Attorney Workload", 670, 10, 170),
    item("No.", 50, 25, 25),
    item("Title", 100, 25, 35),
    item("No.", 200, 25, 25),
    item("Title", 250, 25, 35),
    item("No.", 300, 25, 25),
    item("Title", 350, 25, 35),
    item("Value", 430, 25, 45),
    item("Value", 550, 25, 45),
    item("Value", 670, 25, 45),
    item("150", 50, 45, 25),
    item("Redevelopment Administration", 100, 45, 80),
    item("0", 200, 45, 10),
    item("Total Fund", 250, 45, 60),
    item("0", 300, 45, 10),
    item("Total Fund", 350, 45, 60),
    item("-", 430, 45, 10),
    item("0.05", 550, 45, 30),
    item("284", 670, 45, 25),
    item("400", 50, 65, 25),
    item("Water M & O Fund", 100, 65, 80),
    item("0", 200, 65, 10),
    item("Total Fund", 250, 65, 60),
    item("0", 300, 65, 10),
    item("Total Fund", 350, 65, 60),
    item("45", 430, 65, 20),
    item("21.75", 550, 65, 35),
    item("1,748", 670, 65, 40),
    item("450", 50, 85, 25),
    item("Sewer M & O Fund", 100, 85, 80),
    item("0", 200, 85, 10),
    item("Total Fund", 250, 85, 60),
    item("0", 300, 85, 10),
    item("Total Fund", 350, 85, 60),
    item("14", 430, 85, 20),
    item("15.58", 550, 85, 35),
    item("473", 670, 85, 30),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "City Attorney Workload",
    basisName: "City Attorney Workload",
    expectedTotal: 37.38,
    deriveReceiversFromPdf: true,
    receivers: [],
  });
  assert.ok(result);
  assert.deepEqual(
    result.receivers.map((receiver) => [receiver.glCode, receiver.dept, receiver.units]),
    [
      ["150-0", "Redevelopment Administration", 284],
      ["400-0", "Water M & O Fund", 1748],
      ["450-0", "Sewer M & O Fund", 473],
    ],
  );
  console.log("  ✓ PDF-derived City Attorney Workload keeps fund rows and ignores adjacent FTE total");
}

{
  // Regression: real CAP exhibits print a generic "Value" subheader on
  // every basis-schedule page, including unrelated schedules many pages
  // away within the AI's page-window scan. A bare match on the literal
  // word "Value" (with no basis-name confirmation) used to register as a
  // `preferred` candidate regardless of which table it came from, and
  // candidates were grouped purely by raw column index — so an unrelated
  // later-page table's "Value" column could be merged into the same
  // group and, since `evaluatePdfReceiverGroup` resolves receivers into a
  // single Map keyed by glCode, silently overwrite the correct basis's
  // value when the same Fund/Org/Division glCode happens to recur (a
  // realistic case — dept codes like "100-100" repeat across schedules).
  // Page 2's Y values are offset, matching how aiParseCap.ts shifts each
  // scanned page's items before clustering (each page's rows otherwise
  // restart at y≈0 and would collapse into page 1's rows).
  const PAGE_Y_OFFSET = 10000;
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35, 10, 1),
    item("Organization", 100, 10, 80, 10, 1),
    item("Division or Cost Pool", 200, 10, 120, 10, 1),
    item("Modified Operating Expenses", 430, 10, 170, 10, 1),
    item("No.", 50, 25, 25, 10, 1),
    item("Title", 100, 25, 35, 10, 1),
    item("No.", 200, 25, 25, 10, 1),
    item("Title", 250, 25, 35, 10, 1),
    item("No.", 300, 25, 25, 10, 1),
    item("Title", 350, 25, 35, 10, 1),
    item("Value", 430, 25, 45, 10, 1),
    item("400", 50, 45, 25, 10, 1),
    item("Water M & O Fund", 100, 45, 110, 10, 1),
    item("0", 200, 45, 10, 10, 1),
    item("Total Fund", 250, 45, 60, 10, 1),
    item("0", 300, 45, 10, 10, 1),
    item("Total Fund", 350, 45, 60, 10, 1),
    item("2,000", 430, 45, 40, 10, 1),
    // Filler receiver rows — real CAP schedules run for dozens of rows
    // per page, so this asserts the fix holds even with realistic
    // row-index distance between page 1's table and page 2's table (not
    // just the contrived 1-data-row-per-page case).
    item("410", 50, 65, 25, 10, 1),
    item("Sewer M & O Fund", 100, 65, 110, 10, 1),
    item("0", 200, 65, 10, 10, 1),
    item("Total Fund", 250, 65, 60, 10, 1),
    item("0", 300, 65, 10, 10, 1),
    item("Total Fund", 350, 65, 60, 10, 1),
    item("500", 430, 65, 40, 10, 1),
    item("420", 50, 85, 25, 10, 1),
    item("Gas Fund", 100, 85, 60, 10, 1),
    item("0", 200, 85, 10, 10, 1),
    item("Total Fund", 250, 85, 60, 10, 1),
    item("0", 300, 85, 10, 10, 1),
    item("Total Fund", 350, 85, 60, 10, 1),
    item("700", 430, 85, 40, 10, 1),
    item("Fund", 50, 10 + PAGE_Y_OFFSET, 35, 10, 2),
    item("Organization", 100, 10 + PAGE_Y_OFFSET, 80, 10, 2),
    item("Division or Cost Pool", 200, 10 + PAGE_Y_OFFSET, 120, 10, 2),
    item("Assigned Square Footage", 430, 10 + PAGE_Y_OFFSET, 170, 10, 2),
    item("No.", 50, 25 + PAGE_Y_OFFSET, 25, 10, 2),
    item("Title", 100, 25 + PAGE_Y_OFFSET, 35, 10, 2),
    item("No.", 200, 25 + PAGE_Y_OFFSET, 25, 10, 2),
    item("Title", 250, 25 + PAGE_Y_OFFSET, 35, 10, 2),
    item("No.", 300, 25 + PAGE_Y_OFFSET, 25, 10, 2),
    item("Title", 350, 25 + PAGE_Y_OFFSET, 35, 10, 2),
    item("Value", 430, 25 + PAGE_Y_OFFSET, 45, 10, 2),
    item("400", 50, 45 + PAGE_Y_OFFSET, 25, 10, 2),
    item("Water M & O Fund", 100, 45 + PAGE_Y_OFFSET, 110, 10, 2),
    item("0", 200, 45 + PAGE_Y_OFFSET, 10, 10, 2),
    item("Total Fund", 250, 45 + PAGE_Y_OFFSET, 60, 10, 2),
    item("0", 300, 45 + PAGE_Y_OFFSET, 10, 10, 2),
    item("Total Fund", 350, 45 + PAGE_Y_OFFSET, 60, 10, 2),
    item("9,999", 430, 45 + PAGE_Y_OFFSET, 40, 10, 2),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Value",
    basisName: "Modified Operating Expenses",
    deriveReceiversFromPdf: true,
    receivers: [],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 3);
  const waterRow = result.receivers.find((r) => r.glCode === "400-0");
  assert.ok(waterRow);
  assert.equal(waterRow.units, 2000,
    "an unrelated page's same-column-index 'Value' table must not contaminate this basis");
  console.log("  ✓ generic 'Value' header matches on unrelated pages don't contaminate the basis's own column");
}

{
  // Fund-level rows print the receiver name in the Fund Title column,
  // while the Organization / Division titles are generic "Total Fund".
  // Preserve the fund title so imported schedules do not show a pile of
  // indistinguishable "Total Fund" receivers.
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35),
    item("Organization", 100, 10, 80),
    item("Division or Cost Pool", 200, 10, 120),
    item("Full Time Equivalent Employees", 430, 10, 190),
    item("No.", 50, 25, 25),
    item("Title", 100, 25, 35),
    item("No.", 200, 25, 25),
    item("Title", 250, 25, 35),
    item("No.", 300, 25, 25),
    item("Title", 350, 25, 35),
    item("Value", 430, 25, 45),
    item("214", 50, 45, 25),
    item("Community Planning Fund", 100, 45, 80),
    item("0", 200, 45, 10),
    item("Total Fund", 250, 45, 60),
    item("0", 300, 45, 10),
    item("Total Fund", 350, 45, 60),
    item("1.35", 430, 45, 30),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Full Time Equivalent Employees",
    basisName: "Full Time Equivalent Employees",
    deriveReceiversFromPdf: true,
    receivers: [],
  });
  assert.ok(result);
  assert.deepEqual(
    result.receivers.map((receiver) => [receiver.glCode, receiver.dept, receiver.units]),
    [["214-0", "Community Planning Fund", 1.35]],
  );
  console.log("  ✓ Fund-level rows preserve fund title instead of generic Total Fund");
}

{
  // When importing all receivers, deterministic extraction should derive
  // receiver identities from the PDF table itself. This catches Purchase
  // Orders rows for indirect cost centers even when the AI omitted them
  // from its receiver list.
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35),
    item("Organization", 100, 10, 80),
    item("Division or Cost Pool", 200, 10, 120),
    item("Cash and Investments", 360, 10, 150),
    item("As Total City Manager Organization", 500, 10, 210),
    item("Purchase Orders Created", 640, 10, 170),
    item("No.", 50, 25, 25),
    item("Title", 100, 25, 35),
    item("No.", 200, 25, 25),
    item("Title", 250, 25, 35),
    item("No.", 300, 25, 25),
    item("Title", 350, 25, 35),
    item("Value", 400, 25, 45),
    item("Value", 520, 25, 45),
    item("Value", 640, 25, 45),
    item("100", 50, 45, 25),
    item("General", 100, 45, 50),
    item("City Manager 111", 200, 45, 110),
    item("16.50", 640, 45, 35),
    item("100", 50, 65, 25),
    item("General", 100, 65, 50),
    item("Finance Administration 300", 200, 65, 150),
    item("38.50", 640, 65, 35),
    item("100", 50, 85, 25),
    item("General", 100, 85, 50),
    item("512", 200, 85, 25),
    item("Planning", 250, 85, 70),
    item("Total Organization 0", 300, 85, 120),
    item("14.00", 640, 85, 35),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Purchase Orders Created",
    basisName: "Purchase Orders Created",
    expectedTotal: 69,
    deriveReceiversFromPdf: true,
    receivers: [],
  });
  assert.ok(result);
  assert.deepEqual(
    result.receivers.map((receiver) => [receiver.glCode, receiver.units]),
    [["100-111", 16.5], ["100-300", 38.5], ["100-512-0", 14]],
  );
  console.log("  ✓ PDF-derived schedules pull indirect center Purchase Order rows");
}

// ─── Currency / thousands separators ──────────────────────────────────────

{
  const pageItems: TextItem[] = [
    item("Department",      50, 10, 90),
    item("AP Invoices",     200, 10, 90),
    item("Finance",         50, 30, 60),
    item("$1,234,567",      200, 30, 80),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "AP Invoices",
    receivers: [{ dept: "Finance", glCode: "100-FAS" }],
  });
  assert.ok(result);
  assert.equal(result.receivers[0].units, 1234567);
  console.log("  ✓ Currency and thousands separators are stripped");
}

// ─── Dash cell omits receiver ─────────────────────────────────────────────

{
  const pageItems: TextItem[] = [
    item("Department", 50, 10, 90),
    item("FTE",        200, 10, 90),
    item("Library",    50, 30, 60),
    item("-",          200, 30, 5),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "FTE",
    receivers: [{ dept: "Library", glCode: "100-LIB" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 0);
  assert.equal(result.blankReceivers.length, 1);
  assert.equal(result.blankReceivers[0].dept, "Library");
  console.log("  ✓ Dash in cell omits receiver (not treated as 0 numeric)");
}

// ─── glCode match overrides dept-name fuzz ────────────────────────────────

{
  // PDF has the glCode printed but the dept name in the PDF differs from
  // what the AI returned. glCode-first matching wins.
  const pageItems: TextItem[] = [
    item("ID",       50, 10, 30),
    item("Department", 90, 10, 90),
    item("FTE",      200, 10, 50),
    item("100-700-0", 50, 30, 60),
    item("PD Admin",  90, 30, 60),
    item("65",        200, 30, 20),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "FTE",
    receivers: [{
      dept: "Police Administration", // AI said this, PDF prints "PD Admin"
      glCode: "100-700-0",
    }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 65);
  console.log("  ✓ glCode match works when dept name differs from PDF");
}

{
  // Milpitas prints fund / organization / division in separate columns,
  // while the AI identity joins them as "100-512-0". The deterministic
  // matcher should use those split code cells before falling back to dept
  // text, since "Planning" is otherwise ambiguous with "Long Range Planning".
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35),
    item("Organization", 100, 10, 80),
    item("Division or Cost Pool", 200, 10, 120),
    item("Gross Operating Expenses", 430, 10, 150),
    item("No.", 50, 25, 25),
    item("Title", 100, 25, 35),
    item("No.", 200, 25, 25),
    item("Title", 250, 25, 35),
    item("No.", 300, 25, 25),
    item("Title", 350, 25, 35),
    item("Value", 430, 25, 45),
    item("100", 50, 45, 25),
    item("512", 100, 45, 25),
    item("Planning", 200, 45, 60),
    item("0", 300, 45, 10),
    item("2,030,145", 430, 45, 60),
    item("100", 50, 65, 25),
    item("513", 100, 65, 25),
    item("Long Range Planning", 200, 65, 120),
    item("0", 300, 65, 10),
    item("1,274,733", 430, 65, 60),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Gross Operating Expenses",
    basisName: "Gross Operating Expenses",
    receivers: [{ dept: "Planning", glCode: "100-512-0" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 2030145);
  console.log("  ✓ Split GL code cells match composite receiver identity");
}

{
  // Fund-level receivers like "400-0-0" must not match an organization
  // row whose org number is 400. The GL parts need to appear in order and
  // with multiplicity, not just as an unordered token set.
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35),
    item("Organization", 100, 10, 80),
    item("Division or Cost Pool", 200, 10, 120),
    item("City Attorney Workload", 360, 10, 150),
    item("No.", 50, 25, 25),
    item("Title", 100, 25, 35),
    item("No.", 200, 25, 25),
    item("Title", 250, 25, 35),
    item("Value", 360, 25, 45),
    item("100", 50, 45, 25),
    item("General", 100, 45, 50),
    item("Public Works Administration", 200, 45, 150),
    item("400", 290, 45, 25),
    item("Total Organization", 320, 45, 100),
    item("0", 345, 45, 10),
    item("3.38", 360, 45, 35),
    item("400", 50, 65, 25),
    item("Water M & O Fund", 100, 65, 110),
    item("0", 200, 65, 10),
    item("Total Fund", 250, 65, 60),
    item("0", 300, 65, 10),
    item("21.75", 360, 65, 35),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "City Attorney Workload",
    basisName: "City Attorney Workload",
    receivers: [{ dept: "Water M & O Fund", glCode: "400-0-0" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 21.75);
  console.log("  ✓ Ordered split GL code avoids org/fund collisions");
}

{
  // Some central-service rows omit the trailing division zero in the PDF,
  // printing "100 / Non Departmental 910" while the importer identity is
  // normalized as "100-910-0". Treat that final zero as optional only when
  // the PDF row has no zero token at all. When an Exhibit/direct-services
  // duplicate has the same code, the non-Exhibit identity row wins.
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35),
    item("Organization", 100, 10, 80),
    item("Division or Cost Pool", 200, 10, 120),
    item("Gross Operating Expenses", 430, 10, 150),
    item("No.", 50, 25, 25),
    item("Title", 100, 25, 35),
    item("No.", 200, 25, 25),
    item("Title", 250, 25, 35),
    item("No.", 300, 25, 25),
    item("Title", 350, 25, 35),
    item("Value", 430, 25, 45),
    item("100", 50, 45, 25),
    item("General", 100, 45, 50),
    item("Non Departmental", 200, 45, 100),
    item("910", 290, 45, 25),
    item("2,880,096", 430, 45, 60),
    item("100", 50, 65, 25),
    item("General", 100, 65, 50),
    item("Non Departmental", 200, 65, 100),
    item("910", 290, 65, 25),
    item("Direct Services Ex. 4", 330, 65, 130),
    item("200,000", 430, 65, 50),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Gross Operating Expenses",
    basisName: "Gross Operating Expenses",
    receivers: [{ dept: "Non-Departmental", glCode: "100-910-0" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 2880096);
  console.log("  ✓ Missing trailing division zero still matches central-service GL code");
}

{
  // Inventory-of-allocation-factors exhibits print TWO parallel value
  // columns for some indirect depts: one under the dept's main/Central
  // Services pool, one under a "Direct Services" sub-pool — both sharing
  // identical Fund=100/Org=114, distinguished only by an "Ex. 4"
  // exhibit-reference marker. tableFromRows joins multi-segment cells
  // mapped to the same column with a space, so the pool title and the
  // exhibit marker merge into one cell: "Direct Services Ex. 4". Without
  // capturing that marker into the GL code, both rows resolve to the same
  // glCode and the deterministic receiver map silently drops one value
  // (the Milpitas Modified/Gross Operating Expenses undercount bug).
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35),
    item("Organization", 100, 10, 80),
    item("Division or Cost Pool", 200, 10, 120),
    item("Gross Operating Expenses", 430, 10, 150),
    item("No.", 50, 25, 25),
    item("Title", 100, 25, 35),
    item("No.", 200, 25, 25),
    item("Title", 250, 25, 35),
    item("No.", 300, 25, 25),
    item("Title", 350, 25, 35),
    item("Value", 430, 25, 45),
    item("100", 50, 45, 25),
    item("General", 100, 45, 50),
    item("City Clerk 114", 200, 45, 110),
    item("1,000,000", 430, 45, 60),
    item("100", 50, 65, 25),
    item("General", 100, 65, 50),
    item("City Clerk 114", 200, 65, 110),
    item("Direct Services Ex. 4", 330, 65, 130),
    item("500,000", 430, 65, 50),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Gross Operating Expenses",
    basisName: "Gross Operating Expenses",
    deriveReceiversFromPdf: true,
    receivers: [],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 2);
  const glCodes = result.receivers.map((r) => r.glCode);
  assert.equal(new Set(glCodes).size, 2, "the two City Clerk rows must resolve to distinct GL codes");
  const total = result.receivers.reduce((sum, r) => sum + (r.units ?? 0), 0);
  assert.equal(total, 1500000, "neither parallel value column should silently overwrite the other");
  console.log("  ✓ Dual value-column collision: 'Ex. N' marker disambiguates parallel pool rows");
}

// ─── Suffix-stripped matching ─────────────────────────────────────────────

{
  // AI extracted "Recreation Administration", PDF prints "Recreation
  // Admin.". Strict substring fails; suffix-stripping should rescue.
  const pageItems: TextItem[] = [
    item("Department",          50, 10, 90),
    item("FTE",                 200, 10, 50),
    item("Recreation Admin.",   50, 30, 100),
    item("6.00",                200, 30, 25),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "FTE",
    receivers: [{ dept: "Recreation Administration", glCode: "" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 6);
  console.log("  ✓ Suffix-stripped match: 'Recreation Administration' ↔ 'Recreation Admin.'");
}

{
  // AI extracted "City Manager's Office", PDF prints "City Manager".
  // After suffix strip both reduce to "citymanager".
  const pageItems: TextItem[] = [
    item("Department",  50, 10, 90),
    item("FTE",         200, 10, 50),
    item("City Manager", 50, 30, 100),
    item("3.50",        200, 30, 25),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "FTE",
    receivers: [{ dept: "City Manager's Office", glCode: "" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 3.5);
  console.log("  ✓ Suffix-stripped match: 'City Manager's Office' ↔ 'City Manager'");
}

// ─── Conjunction handling (the real Milpitas case) ───────────────────────

{
  // AI returns "Housing and Neighborhood Svcs", PDF prints "Housing &
  // Neighborhood Svcs". After normalization the "&" disappears entirely
  // while "and" survives. Without stopword stripping, every Milpitas
  // receiver with an "&" in its name fails to match.
  const pageItems: TextItem[] = [
    item("Department",                    50, 10, 90),
    item("FTE",                           200, 10, 50),
    item("Housing & Neighborhood Svcs",   50, 30, 200),
    item("6.00",                          200, 30, 25),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "FTE",
    receivers: [{ dept: "Housing and Neighborhood Svcs", glCode: "" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 6);
  console.log("  ✓ Conjunction stopwords: 'and' (AI) matches '&' (PDF)");
}

// ─── Token-with-uniqueness fallback ───────────────────────────────────────

{
  // AI extracted "Public Works Engineering", PDF prints "Engineering
  // & Public Works" (different word order, suffix-strip alone doesn't
  // help). Token-match-with-uniqueness should resolve.
  const pageItems: TextItem[] = [
    item("Department",                 50, 10, 90),
    item("FTE",                        200, 10, 50),
    item("Engineering & Public Works", 50, 30, 180),
    item("12.00",                      200, 30, 30),
    item("Parks Maintenance",          50, 50, 130),
    item("8.00",                       200, 50, 30),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "FTE",
    receivers: [{ dept: "Public Works Engineering", glCode: "" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].units, 12);
  console.log("  ✓ Token-match: word-order differences resolve uniquely");
}

{
  // Ambiguous token-match refuses (would otherwise pick the wrong row).
  // Both "Recreation Park" and "Recreation Pool" contain "recreation",
  // so matching against "Recreation" must not pick one arbitrarily.
  const pageItems: TextItem[] = [
    item("Department",      50, 10, 90),
    item("FTE",             200, 10, 50),
    item("Recreation Park", 50, 30, 130),
    item("4.00",            200, 30, 25),
    item("Recreation Pool", 50, 50, 130),
    item("3.00",            200, 50, 25),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "FTE",
    receivers: [{ dept: "Recreation", glCode: "" }],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 0,
    "ambiguous single-token target refuses to guess");
  assert.equal(result.unmatchedReceivers.length, 1);
  console.log("  ✓ Token-match refuses ambiguous one-of-many guesses");
}

// ─── Failure paths return null or surface unmatched ───────────────────────

{
  // Header text not found anywhere — return null so caller falls back to
  // the AI-extracted schedule.
  const pageItems: TextItem[] = [
    item("Department", 50, 10, 90),
    item("Square Feet", 200, 10, 90),
    item("Library",    50, 30, 60),
    item("4,200",      200, 30, 40),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "AP Invoices",
    receivers: [{ dept: "Library", glCode: "100-LIB" }],
  });
  assert.equal(result, null,
    "no matching header → null → AI fallback");
  console.log("  ✓ Missing header returns null for fallback");
}

{
  // Receiver dept not present in any table row — surfaces in
  // unmatchedReceivers, doesn't crash, doesn't borrow a value.
  const pageItems: TextItem[] = [
    item("Department", 50, 10, 90),
    item("FTE",        200, 10, 50),
    item("Recreation", 50, 30, 80),
    item("6.00",       200, 30, 25),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "FTE",
    receivers: [
      { dept: "Recreation",   glCode: "100-420-0" },
      { dept: "Mystery Dept", glCode: "999-999-0" },
    ],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1);
  assert.equal(result.receivers[0].dept, "Recreation");
  assert.equal(result.unmatchedReceivers.length, 1);
  assert.equal(result.unmatchedReceivers[0].dept, "Mystery Dept");
  console.log("  ✓ Unknown receiver surfaces in unmatchedReceivers, doesn't borrow");
}

{
  // Empty inputs return null cleanly.
  assert.equal(
    extractReceiverUnitsFromPdf({ pageItems: [], basisColumnHeader: "FTE", receivers: [] }),
    null,
  );
  console.log("  ✓ Empty inputs return null");
}

// ─── AI semantic response parsing ─────────────────────────────────────

{
  const text = JSON.stringify({
    schedules: [
      { basis: "Budgeted FTE", page: 5, basisColumnHeader: "FTE" },
      { basis: "AP Invoices",  page: 5, basisColumnHeader: "AP Inv." },
    ],
  });
  const parsed = parseBasisSemanticResponse(text);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], { basis: "Budgeted FTE", page: 5, basisColumnHeader: "FTE" });
  console.log("  ✓ Semantic response: clean JSON parses");
}

{
  // Mixed valid + invalid rows. Invalid rows are dropped silently.
  const text = JSON.stringify({
    schedules: [
      { basis: "Budgeted FTE", page: 5, basisColumnHeader: "FTE" },
      { basis: "Missing header", page: 5 }, // no basisColumnHeader
      { basis: "Bad page", page: 0, basisColumnHeader: "X" }, // page < 1
      { page: 5, basisColumnHeader: "FTE" }, // no basis
    ],
  });
  const parsed = parseBasisSemanticResponse(text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].basis, "Budgeted FTE");
  console.log("  ✓ Semantic response: invalid rows dropped, valid rows kept");
}

{
  // Surrounding prose (model occasionally adds a line of text before
  // the JSON). The JSON-object scan must still find the body.
  const text = `Here is the JSON:\n${JSON.stringify({ schedules: [
    { basis: "FTE", page: 3, basisColumnHeader: "FTE" },
  ] })}\nThanks.`;
  const parsed = parseBasisSemanticResponse(text);
  assert.equal(parsed.length, 1);
  console.log("  ✓ Semantic response: prose around JSON is tolerated");
}

{
  // Broken JSON returns empty (caller falls back to AI path).
  assert.deepEqual(parseBasisSemanticResponse("not json"), []);
  assert.deepEqual(parseBasisSemanticResponse("{ broken"), []);
  console.log("  ✓ Semantic response: malformed text returns empty array");
}

{
  // Regression: real CAP exhibits also print a narrative "Summary of
  // Allocation Decisions" table that lists each basis's *name* as a plain
  // data cell once per cost center (e.g. "Modified Operating Expenses"
  // repeated down a column for every center assigned that factor), and
  // an unrelated dollar-amount header can contain a short fragment of the
  // basis name (e.g. "Expense" inside "Allocable Central Service
  // Expense", which is a substring of "ModifiedOperatingExpenses" once
  // normalized). If the AI semantic pass mis-identifies this decision
  // table as the basis's page, the loose `headerTextMatches` containment
  // check used to let the fallback bind to that dollar column and read
  // currency amounts as the basis's units. The fallback must require a
  // close (not fragment) text match, and reject any column where the
  // basis-name text recurs across multiple rows (a hallmark of decision
  // data, not a header).
  const pageItems: TextItem[] = [
    item("Allocable Central Service", 50, 10, 150),
    item("Expense", 50, 25, 60),
    item("Allocation Basis", 250, 10, 150),
    item("Allocation Factor", 250, 25, 110),
    item("City Council", 50, 45, 90),
    item("$ 631,378", 50, 45 + 1, 70),
    item("City Council Agenda Items", 250, 45, 170),
    item("City Council", 50, 65, 90),
    item("$ 0", 50, 65 + 1, 70),
    item("Modified Operating Expenses", 250, 65, 170),
    item("Finance", 50, 85, 90),
    item("$ 0", 50, 85 + 1, 70),
    item("Modified Operating Expenses", 250, 85, 170),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Modified Operating Expenses",
    basisName: "Modified Operating Expenses",
    deriveReceiversFromPdf: true,
    receivers: [],
  });
  assert.equal(result, null,
    "a decision-table page with no real Value column must not produce fabricated units");
  console.log("  ✓ Decision-table basis-name fragments don't get mistaken for a Value column");
}

{
  // Regression: the primary AI CAP parse's `printedTotal` for a basis is a
  // separate, fallible extraction from the deterministic receiver-units
  // read. If it's wrong, `evaluateDeterministicResult` (in aiParseCap.ts)
  // would wrongly reject an already-correct deterministic result as a
  // "total-mismatch" and fall back to the AI's own row-shift-prone
  // receivers. Real CAP exhibits print their own "Grand Total: All
  // Services" row at the bottom of the schedule, in the same column
  // already being read for receiver units — that's a more trustworthy
  // reconciliation source. `extractReceiverUnitsFromPdf` must surface it
  // as `printedTotalFromPdf` whenever a deriveReceiversFromPdf table
  // contains that row.
  const pageItems: TextItem[] = [
    item("Fund", 50, 10, 35, 10, 1),
    item("Organization", 100, 10, 80, 10, 1),
    item("Division or Cost Pool", 200, 10, 120, 10, 1),
    item("Modified Operating Expenses", 430, 10, 170, 10, 1),
    item("No.", 50, 25, 25, 10, 1),
    item("Title", 100, 25, 35, 10, 1),
    item("No.", 200, 25, 25, 10, 1),
    item("Title", 250, 25, 35, 10, 1),
    item("No.", 300, 25, 25, 10, 1),
    item("Title", 350, 25, 35, 10, 1),
    item("Value", 430, 25, 45, 10, 1),
    item("400", 50, 45, 25, 10, 1),
    item("Water M & O Fund", 100, 45, 110, 10, 1),
    item("0", 200, 45, 10, 10, 1),
    item("Total Fund", 250, 45, 60, 10, 1),
    item("0", 300, 45, 10, 10, 1),
    item("Total Fund", 350, 45, 60, 10, 1),
    item("2,000", 430, 45, 40, 10, 1),
    item("410", 50, 65, 25, 10, 1),
    item("Sewer M & O Fund", 100, 65, 110, 10, 1),
    item("0", 200, 65, 10, 10, 1),
    item("Total Fund", 250, 65, 60, 10, 1),
    item("0", 300, 65, 10, 10, 1),
    item("Total Fund", 350, 65, 60, 10, 1),
    item("3,000", 430, 65, 40, 10, 1),
    item("Grand Total: All Services", 50, 85, 25, 10, 1),
    item("5,000", 430, 85, 40, 10, 1),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Modified Operating Expenses",
    basisName: "Modified Operating Expenses",
    deriveReceiversFromPdf: true,
    receivers: [],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 2,
    "the Grand Total row must not be mistaken for a receiver row");
  assert.equal(result.printedTotalFromPdf, 5000,
    "the schedule's own printed grand total must be read from the same column as receiver units");
  console.log("  ✓ PDF-derived schedules surface their own printed Grand Total for reconciliation");
}

{
  // Regression: long CAP exhibits paginate by re-printing the full header
  // block and re-listing every receiver row on the next page when a
  // schedule spans multiple pages (confirmed against the Milpitas CAP's
  // own Excel export, where "Table 1" repeats its 3-row header and every
  // receiver row verbatim at each page break). The multi-page scan window
  // in aiParseCap.ts concatenates items from several pages into one
  // pageItems array, so a byte-identical repeated row must not be summed
  // twice for the same receiver. `evaluatePdfReceiverGroup` resolves
  // receivers into a Map keyed by glCode, which already guards against
  // this — this test locks that behavior in.
  const headerBlock = (page: number, yBase: number) => [
    item("Fund", 50, yBase, 35, 10, page),
    item("Organization", 100, yBase, 80, 10, page),
    item("Division or Cost Pool", 200, yBase, 120, 10, page),
    item("Modified Operating Expenses", 430, yBase, 170, 10, page),
    item("No.", 50, yBase + 15, 25, 10, page),
    item("Title", 100, yBase + 15, 35, 10, page),
    item("No.", 200, yBase + 15, 25, 10, page),
    item("Title", 250, yBase + 15, 35, 10, page),
    item("No.", 300, yBase + 15, 25, 10, page),
    item("Title", 350, yBase + 15, 35, 10, page),
    item("Value", 430, yBase + 15, 45, 10, page),
  ];
  const receiverRow = (page: number, y: number) => [
    item("100", 50, y, 25, 10, page),
    item("General", 100, y, 50, 10, page),
    item("100", 200, y, 25, 10, page),
    item("City Council", 250, y, 100, 10, page),
    item("0", 300, y, 10, 10, page),
    item("Total Organization", 350, y, 100, 10, page),
    item("631,378", 430, y, 40, 10, page),
  ];
  // aiParseCap.ts offsets each scanned page's Y coordinates by a large
  // constant so pages don't collapse into the same row cluster (each PDF
  // page's Y restarts at 0) — mirror that here so the second page's
  // verbatim repeat is a genuinely separate row, not a merged duplicate.
  const PAGE_Y_OFFSET = 10000;
  const pageItems: TextItem[] = [
    ...headerBlock(1, 10),
    ...receiverRow(1, 35),
    // page 2 re-prints the same header block and the same receiver row
    // verbatim, exactly as the page break does in the real document.
    ...headerBlock(2, 10 + PAGE_Y_OFFSET),
    ...receiverRow(2, 35 + PAGE_Y_OFFSET),
  ];
  const result = extractReceiverUnitsFromPdf({
    pageItems,
    basisColumnHeader: "Modified Operating Expenses",
    basisName: "Modified Operating Expenses",
    deriveReceiversFromPdf: true,
    receivers: [],
  });
  assert.ok(result);
  assert.equal(result.receivers.length, 1,
    "a row repeated verbatim across a page break is one receiver, not two");
  assert.equal(result.receivers[0].units, 631378,
    "a repeated page-break row must not be double-counted into the receiver's total");
  console.log("  ✓ PDF-derived schedules collapse page-break header/row repeats instead of double-counting");
}

console.log("\nAll capDeterministicSchedules assertions passed.");
