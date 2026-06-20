/* Fixture for the demo-jurisdiction registry.
 *
 * Run with: tsx lib/data/__tests__/jurisdictions.fixture.ts
 *
 * Verifies newly added demo workspaces are represented intentionally in
 * the picker registry, including whether they have live seed data or a
 * live blank-workspace mode.
 */

import assert from "node:assert/strict";
import { getJurisdiction } from "../jurisdictions";

const losAltosHills = getJurisdiction("los-altos-hills");
const maplewood = getJurisdiction("city-of-maplewood");
const milpitas = getJurisdiction("city-of-milpitas");

assert.ok(losAltosHills, "Los Altos Hills demo workspace is registered");
assert.equal(losAltosHills.dataAvailable, true, "Los Altos Hills is selectable in the demo picker");
assert.equal(losAltosHills.blankWorkspace, true, "Los Altos Hills loads as a blank workspace");

assert.ok(maplewood, "Maplewood demo workspace is registered");
assert.equal(maplewood.dataAvailable, true, "Maplewood is selectable in the demo picker");
assert.equal(maplewood.blankWorkspace, undefined, "Maplewood is the seeded sample workspace");
assert.equal(maplewood.seedFile, "/test-seed.json");

assert.ok(milpitas, "Milpitas demo workspace is registered");
assert.equal(milpitas.name, "City of Milpitas");
assert.equal(milpitas.defaultFiscalYear, "FY 2025-26");
assert.deepEqual(milpitas.departments, ["Planning", "Building", "Engineering"]);
assert.equal(milpitas.dataAvailable, true, "Milpitas is selectable in the demo picker");
assert.equal(milpitas.blankWorkspace, true, "Milpitas loads as a blank workspace");

console.log("PASS: jurisdictions.fixture — Milpitas demo workspace registered");
