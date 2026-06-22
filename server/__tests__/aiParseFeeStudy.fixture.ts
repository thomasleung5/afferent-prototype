/* Fixture for the Fee Study combined 4-section response parser.
 *
 * Run with: npm run test:fee-study-parser
 *
 * Verifies:
 *   - well-formed response parses all four sections
 *   - domain-absent sections (empty arrays) are accepted, not an error
 *   - per-section truncation recovery — a truncated `fees` array doesn't
 *     void the intact `services`/`positions`/`items` arrays
 *   - no JSON in the response at all → null
 *   - fully truncated with zero recoverable rows in every section → null */

import assert from "node:assert/strict";
import { parseFeeStudyResponse } from "../aiParseFeeStudy";

// ─── Well-formed response ──────────────────────────────────────────────
{
  const text = JSON.stringify({
    services: [{ name: "Site Plan Review", dept: "PLAN", hours: 2, volume: 10, fee: 500, confidence: "high" }],
    positions: [{ title: "Planner I", dept: "PLAN", fte: 1, hours: 1720, confidence: "high" }],
    items: [{ name: "Building Permit", dept: "BLDG", prior: 100, current: 120, unit: "permits", confidence: "high" }],
    fees: [{ name: "Site Plan Review", dept: "PLAN", fee: 500, confidence: "high" }],
  });
  const sections = parseFeeStudyResponse(text);
  assert.ok(sections);
  assert.equal(sections.services.length, 1);
  assert.equal(sections.positions.length, 1);
  assert.equal(sections.items.length, 1);
  assert.equal(sections.fees.length, 1);
  console.log("  ✓ well-formed response parses all four sections");
}

// ─── Domain-absent sections are accepted ───────────────────────────────
{
  const text = JSON.stringify({
    services: [{ name: "Site Plan Review", dept: "PLAN", hours: 2, confidence: "high" }],
    positions: [],
    items: [],
    fees: [{ name: "Site Plan Review", dept: "PLAN", fee: 500, confidence: "high" }],
  });
  const sections = parseFeeStudyResponse(text);
  assert.ok(sections);
  assert.equal(sections.services.length, 1);
  assert.equal(sections.positions.length, 0);
  assert.equal(sections.items.length, 0);
  assert.equal(sections.fees.length, 1);
  console.log("  ✓ domain-absent sections (empty arrays) accepted, not an error");
}

// ─── Per-section truncation recovery ───────────────────────────────────
{
  // services/positions/items are complete; fees is truncated mid-second-row.
  const truncated = '{"services":[{"name":"Site Plan Review","dept":"PLAN","hours":2,"volume":10,"fee":500,"confidence":"high"}],'
    + '"positions":[{"title":"Planner I","dept":"PLAN","fte":1,"hours":1720,"confidence":"high"}],'
    + '"items":[{"name":"Building Permit","dept":"BLDG","prior":100,"current":120,"unit":"permits","confidence":"high"}],'
    + '"fees":[{"name":"Site Plan Review","dept":"PLAN","fee":500,"confidence":"high"},'
    + '{"name":"Building Permit","dept":"BLDG","fee":13500,"confidence"';
  const sections = parseFeeStudyResponse(truncated);
  assert.ok(sections, "should recover the intact sections plus the complete fees row");
  assert.equal(sections.services.length, 1);
  assert.equal(sections.positions.length, 1);
  assert.equal(sections.items.length, 1);
  assert.equal(sections.fees.length, 1, "only the complete fees row recovers — the truncated second row is dropped");
  assert.deepEqual(sections.services[0], {
    name: "Site Plan Review", dept: "PLAN", hours: 2, volume: 10, fee: 500, confidence: "high",
  });
  console.log("  ✓ a truncated fees array doesn't void the intact services/positions/items arrays");
}

// ─── No JSON in the response at all ────────────────────────────────────
{
  const sections = parseFeeStudyResponse("I'm sorry, I cannot process this document.");
  assert.equal(sections, null);
  console.log("  ✓ no JSON object in response returns null");
}

// ─── Fully truncated, zero recoverable rows anywhere → null ───────────
//
// Every section is missing its closing bracket (so the whole-array parse
// fails) AND missing its own anchor field (so per-row recovery also finds
// nothing) — the worst case where there is truly nothing to recover.
{
  const truncated = '{"services":[{"label":"wrong field, no anchor here"'
    + ',"positions":[{"label":"also wrong, no anchor here"'
    + ',"items":[{"label":"also wrong, no anchor here"'
    + ',"fees":[';
  const sections = parseFeeStudyResponse(truncated);
  assert.equal(sections, null, "zero rows recoverable across every section means total failure");
  console.log("  ✓ fully truncated with nothing recoverable anywhere returns null");
}

console.log("\nAll aiParseFeeStudy assertions passed.");
