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

console.log("\nAll capDeterministicSchedules assertions passed.");
