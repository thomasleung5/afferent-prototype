/* Deterministic fixture for the AI parser's JSON recovery helper.
 *
 * Run with: npm run test:ai-parser
 *
 * Verifies:
 *   1. Happy path — well-formed JSON returns the row array under
 *      `spec.rowsKey`.
 *   2. Wrong shape — JSON.parse succeeds but the rowsKey value isn't an
 *      array. The recovery path kicks in and pulls individual anchor
 *      objects from the text.
 *   3. Truncated response — closing `]` and `}` missing. The regex
 *      recovery captures every complete brace-balanced row.
 *   4. No rows match — anchor never appears; returns null so the route
 *      can surface a "shorter document" message.
 *   5. Malformed individual row — JSON.parse on the row fragment throws;
 *      the row is silently skipped without breaking the overall recovery.
 */

import assert from "node:assert/strict";
import { parseRowsOrRecover } from "../aiParseRunner";

const FEES_SPEC = { tag: "test", rowsKey: "fees", rowAnchor: "name", rowNoun: "fee" };

// ── 1. Happy path ────────────────────────────────────────────────────────
{
  const json = JSON.stringify({ fees: [
    { name: "Site plan review", amount: 1200 },
    { name: "Building permit",  amount: 850 },
  ]});
  const rows = parseRowsOrRecover(json, FEES_SPEC);
  assert.ok(rows);
  assert.equal(rows!.length, 2);
  assert.deepEqual(rows![0], { name: "Site plan review", amount: 1200 });
  console.log("  ✓ happy path returns row array verbatim");
}

// ── 2. Wrong shape triggers recovery ─────────────────────────────────────
{
  const json = JSON.stringify({
    notes: "model wrapped rows in the wrong field",
    items: [
      { name: "Wrong field anchor", amount: 100 },
    ],
  });
  // spec.rowsKey = "fees" but JSON has "items" — recovery scans for
  // anchor-bearing objects regardless of containing key.
  const rows = parseRowsOrRecover(json, FEES_SPEC);
  assert.ok(rows);
  assert.equal(rows!.length, 1);
  assert.deepEqual(rows![0], { name: "Wrong field anchor", amount: 100 });
  console.log("  ✓ wrong rowsKey falls back to anchor-pattern recovery");
}

// ── 3. Truncated response (missing close brackets) ────────────────────────
{
  const truncated = '{"fees":['
    + '{"name":"Site plan review","amount":1200},'
    + '{"name":"Building permit","amount":850},'
    + '{"name":"Truncated mid-ro';
  const rows = parseRowsOrRecover(truncated, FEES_SPEC);
  assert.ok(rows, "should recover at least the two complete rows");
  assert.equal(rows!.length, 2);
  assert.deepEqual(rows![0], { name: "Site plan review", amount: 1200 });
  assert.deepEqual(rows![1], { name: "Building permit",  amount: 850 });
  console.log("  ✓ truncated response recovers all complete rows");
}

// ── 4. No anchor matches → null ───────────────────────────────────────────
{
  // Truncated AND missing the anchor anywhere — JSON.parse throws, then
  // the regex finds zero anchor-bearing rows, so recovery returns null.
  const truncatedNoAnchor = '{"fees":[{"label":"missing","value":1';
  const rows = parseRowsOrRecover(truncatedNoAnchor, FEES_SPEC);
  assert.equal(rows, null);
  console.log("  ✓ zero anchor matches returns null");
}

// ── 5. Some malformed rows are skipped ────────────────────────────────────
{
  // First object's value is unquoted — JSON.parse will throw. Second
  // object is well-formed.
  const mixed = '{"fees":['
    + '{"name":"broken row,amount:badvalue},'
    + '{"name":"clean row","amount":200}'
    + ']}';
  const rows = parseRowsOrRecover(mixed, FEES_SPEC);
  assert.ok(rows);
  assert.equal(rows!.length, 1);
  assert.deepEqual(rows![0], { name: "clean row", amount: 200 });
  console.log("  ✓ malformed rows are silently skipped");
}

// ── 6. Different anchor key works the same way ────────────────────────────
{
  const positionsSpec = { tag: "test", rowsKey: "positions", rowAnchor: "title", rowNoun: "position" };
  const json = '{"positions":['
    + '{"title":"Planner I","fte":1},'
    + '{"title":"Plan Examiner","fte":2}'
    + ']}';
  const rows = parseRowsOrRecover(json, positionsSpec);
  assert.ok(rows);
  assert.equal(rows!.length, 2);
  console.log("  ✓ anchor key is configurable per parser");
}

console.log("\nAll aiParseRunner assertions passed.");
