/* Fixture for the server-snapshot coercion helper.
 *
 * Run with: npm run test:snapshot-coercion
 *
 * Verifies:
 *   - non-object inputs are rejected with a clear message,
 *   - an object missing schema fields is backfilled by migration
 *     (proves the migration path is wired in, same as parseSnapshotJson),
 *   - a fully-populated snapshot round-trips. */

import assert from "node:assert/strict";
import { coerceServerSnapshot } from "../studies/snapshotCoercion";
import type { BuildSnapshot } from "../store";

let passed = 0;

// ── Reject null ──────────────────────────────────────────────────
{
  const r = coerceServerSnapshot(null);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /empty or malformed/);
  passed++;
}

// ── Reject primitives ────────────────────────────────────────────
{
  for (const v of [42, "snapshot", true, undefined]) {
    const r = coerceServerSnapshot(v);
    assert.equal(r.ok, false, `non-object ${JSON.stringify(v)} should reject`);
  }
  passed++;
}

// ── Reject arrays ────────────────────────────────────────────────
{
  const r = coerceServerSnapshot([]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /empty or malformed/);
  passed++;
}

// ── Migration runs on the inner payload ──────────────────────────
//    Proof: a snapshot missing functionalAllocation comes back with
//    the array backfilled by migratePersistedState. Same path as
//    lib/snapshotIO.ts:parseSnapshotJson covers for file uploads.
{
  const minimal: Partial<BuildSnapshot> = {
    services: [], operating: [], productiveHours: [],
    studyContext: { cityId: "test", fiscalYear: "FY 2025-26" },
    activeJurisdictionId: "test",
    activeFiscalYear: "FY 2025-26",
  };
  const r = coerceServerSnapshot(minimal);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(
      Array.isArray(r.snapshot.functionalAllocation),
      "migration backfilled functionalAllocation",
    );
  }
  passed++;
}

// ── Happy-path round-trip ────────────────────────────────────────
{
  const r = coerceServerSnapshot({
    services: [],
    operating: [],
    productiveHours: [],
    studyContext: { cityId: "x", fiscalYear: "FY 2025-26" },
    activeJurisdictionId: "x",
    activeFiscalYear: "FY 2025-26",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.snapshot.activeFiscalYear, "FY 2025-26");
    assert.equal(r.snapshot.studyContext.cityId, "x");
  }
  passed++;
}

console.log(`PASS: snapshotCoercion.fixture — ${passed} cases`);
