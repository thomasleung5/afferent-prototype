/* Fixture for the Fee Study deterministic table-reading orchestrator.
 *
 * Run with: npm run test:fee-study-deterministic-tables
 *
 * Verifies:
 *   - findRowByName's 3-tier cascade (strict, qualifier-stripped, and
 *     all-tokens-unique, refusing on ambiguity)
 *   - resolveDeterministicFields' per-FIELD independence on a blank cell
 *     (the one deliberate divergence from CAP's per-row resolution)
 *   - header-not-found fallback returns null
 *   - the Volume-only grand-total backstop (match + mismatch)
 *   - parseFeeStudySemanticResponse's JSON parsing */

import assert from "node:assert/strict";
import {
  findRowByName, resolveDeterministicFields, volumeGrandTotalCheck,
  parseFeeStudySemanticResponse,
} from "../feeStudyDeterministicTables";
import type { TextItem } from "../pdfTableExtract";

function item(text: string, x: number, y: number, width = 50, height = 10, page = 1): TextItem {
  return { text, x, y, width, height, page };
}

// ─── findRowByName: happy path (strict tier) ──────────────────────────────
{
  const tableRows = [
    ["Site Development Hearing Review", "4160"],
    ["Erosion Control Inspections", "210"],
  ];
  assert.equal(findRowByName(tableRows, "Erosion Control Inspections", 1), 1);
  console.log("  ✓ findRowByName: strict normalized match");
}

// ─── findRowByName: qualifier-stripped tier ───────────────────────────────
{
  // Strict tier fails (different qualifier text on each side); the
  // qualifier-stripped tier strips both qualifiers down to a common
  // "building permit" before matching.
  const tableRows = [["Building Permit - SFR", "13500"]];
  assert.equal(findRowByName(tableRows, "Building Permit (typ.)", 1), 0);
  console.log("  ✓ findRowByName: qualifier-stripped match");
}

// ─── findRowByName: ambiguous refuses rather than guesses ─────────────────
{
  const tableRows = [
    ["Park Maintenance Plan Review", "100"],
    ["Review of Park Maintenance Standards", "200"],
  ];
  // Neither row contains "Park Maintenance Review" as a contiguous
  // substring (strict/stripped tiers both miss), so this falls to the
  // all-tokens tier — both rows contain every significant token, so the
  // cascade must refuse (-1) rather than pick one.
  assert.equal(findRowByName(tableRows, "Park Maintenance Review", 1), -1);
  console.log("  ✓ findRowByName: ambiguous match refuses (-1), never guesses");
}

// ─── resolveDeterministicFields: per-field independence on a blank cell ───
//
// A Services row has THREE independent numeric fields (hours/volume/fee)
// — unlike CAP, where one blank cell drops the whole row, a blank `hours`
// cell here must not discard a successfully-read `fee` on the same row.
{
  const pageItems: TextItem[] = [
    item("Service", 50, 10, 200),
    item("Hours", 260, 10, 60),
    item("Fee", 330, 10, 60),
    item("Erosion Control Inspections", 50, 30, 200),
    // No item at the Hours column for this row — genuinely blank cell.
    item("210", 330, 30, 40),
  ];
  const result = resolveDeterministicFields({
    pageItems,
    columns: { hours: "Hours", fee: "Fee" },
    rows: [{ name: "Erosion Control Inspections" }],
  });
  assert.ok(result, "table should be located");
  assert.equal(result.unmatchedRowIndices.length, 0,
    "row resolved at least one field, so it is not 'unmatched'");
  assert.equal(result.resolved.length, 1,
    "only the fee field resolves — hours stays AI-only");
  assert.equal(result.resolved[0].field, "fee");
  assert.equal(result.resolved[0].value, 210);
  console.log("  ✓ resolveDeterministicFields: blank cell only affects that field, not the whole row");
}

// ─── resolveDeterministicFields: header not found → null ─────────────────
{
  const pageItems: TextItem[] = [
    item("Service", 50, 10, 200),
    item("Adopted Fee", 330, 10, 60),
    item("Erosion Control Inspections", 50, 30, 200),
    item("210", 330, 30, 40),
  ];
  const result = resolveDeterministicFields({
    pageItems,
    columns: { fee: "Some Header That Does Not Exist" },
    rows: [{ name: "Erosion Control Inspections" }],
  });
  assert.equal(result, null, "caller falls back to AI values for the whole domain");
  console.log("  ✓ resolveDeterministicFields: header-not-found returns null");
}

// ─── resolveDeterministicFields: multi-row happy path ─────────────────────
{
  const pageItems: TextItem[] = [
    item("Service", 50, 10, 200),
    item("Adopted Fee", 330, 10, 60),
    item("Site Development Hearing Review", 50, 30, 200),
    item("4160", 330, 30, 40),
    item("Building Permit - New SFR", 50, 50, 200),
    item("13500", 330, 50, 40),
  ];
  const result = resolveDeterministicFields({
    pageItems,
    columns: { fee: "Adopted Fee" },
    rows: [
      { name: "Site Development Hearing Review" },
      { name: "Building Permit - New SFR" },
    ],
  });
  assert.ok(result);
  assert.equal(result.resolved.length, 2);
  assert.equal(result.resolved.find((r) => r.rowIndex === 0)?.value, 4160);
  assert.equal(result.resolved.find((r) => r.rowIndex === 1)?.value, 13500);
  console.log("  ✓ resolveDeterministicFields: multi-row fees table resolves correctly");
}

// ─── volumeGrandTotalCheck: match ──────────────────────────────────────────
{
  const table = {
    headers: ["Service", "Prior", "Current"],
    rows: [
      ["Service A", "100", "110"],
      ["Service B", "50", "60"],
      ["Total", "", "170"],
    ],
  };
  const check = volumeGrandTotalCheck(table, 2, 170);
  assert.ok(check);
  assert.equal(check.matches, true);
  assert.equal(check.printedTotal, 170);
  console.log("  ✓ volumeGrandTotalCheck: matches within tolerance");
}

// ─── volumeGrandTotalCheck: mismatch ───────────────────────────────────────
{
  const table = {
    headers: ["Service", "Prior", "Current"],
    rows: [
      ["Service A", "100", "110"],
      ["Service B", "50", "60"],
      ["Total", "", "180"],
    ],
  };
  const check = volumeGrandTotalCheck(table, 2, 170);
  assert.ok(check);
  assert.equal(check.matches, false, "170 resolved vs 180 printed exceeds tolerance");
  console.log("  ✓ volumeGrandTotalCheck: flags mismatch beyond tolerance");
}

// ─── volumeGrandTotalCheck: no total row → null (nothing to check) ────────
{
  const table = {
    headers: ["Service", "Prior", "Current"],
    rows: [["Service A", "100", "110"]],
  };
  const check = volumeGrandTotalCheck(table, 2, 110);
  assert.equal(check, null);
  console.log("  ✓ volumeGrandTotalCheck: no total row found returns null, not a failure");
}

// ─── parseFeeStudySemanticResponse ─────────────────────────────────────────
{
  const text = JSON.stringify({
    schedules: [
      { domain: "fees", page: 12, columns: { fee: "FY24-25 Adopted Fee" } },
      { domain: "volume", page: 8, columns: { prior: "FY23", current: "FY24" } },
      { domain: "bogus-domain", page: 1, columns: {} },
      { domain: "services", page: 0, columns: { hours: "Hours" } },
    ],
  });
  const parsed = parseFeeStudySemanticResponse(text);
  assert.equal(parsed.length, 2, "invalid domain and invalid page (0) are dropped");
  assert.equal(parsed[0].domain, "fees");
  assert.equal(parsed[0].columns.fee, "FY24-25 Adopted Fee");
  assert.equal(parsed[1].domain, "volume");
  assert.equal(parsed[1].columns.current, "FY24");
  console.log("  ✓ parseFeeStudySemanticResponse: parses valid schedules, drops invalid ones");
}

console.log("\nAll feeStudyDeterministicTables assertions passed.");
