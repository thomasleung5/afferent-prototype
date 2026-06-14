/* Fixture for the snapshot JSON envelope helpers.
 *
 * Run with: npm run test:snapshot-io
 *
 * Verifies:
 *   - serializeSnapshot wraps with the canonical format tag.
 *   - snapshotBlob produces a JSON-typed Blob whose text round-trips.
 *   - defaultSnapshotFilename formats the FY + ISO date sensibly.
 *   - parseSnapshotJson accepts valid envelopes and migrates the inner
 *     payload (proof: an old-shape field passes through migration).
 *   - parseSnapshotJson rejects: invalid JSON, non-object, wrong format
 *     tag, missing snapshot payload. */

import assert from "node:assert/strict";
import {
  serializeSnapshot, snapshotBlob, defaultSnapshotFilename,
  parseSnapshotJson, type SnapshotFileEnvelope,
} from "../snapshotIO";
import type { BuildSnapshot } from "../store";

async function main(): Promise<void> {
  let passed = 0;

  // Minimal valid snapshot. The migrator only reads / mutates a few
  // fields; the rest stay as-is. Using mostly-empty arrays keeps the
  // fixture independent of the seed-data shape.
  const baseSnapshot: BuildSnapshot = {
    productiveHours: [],
    operating: [],
    capPools: [],
    capCenterTotals: {},
    capCenterDisallowed: {},
    capCenterSources: {},
    studyContext: {
      cityId: "test-city",
      fiscalYear: "FY 2025-26",
    },
    allocationBases: [],
    capBasisUnits: [],
    capDirectAllocations: [],
    directBills: {},
    volume: [],
    services: [],
    serviceRoleAllocations: {},
    policyTargets: [],
    policyExceptions: [],
    lineage: {},
    pendingReview: { positions: [], operating: [], services: [], fees: [], volume: [], cap: [] },
    capCenterOrder: [],
    imports: [],
    functionalAllocation: [],
    activeJurisdictionId: "test-jurisdiction",
    activeFeeDepts: [],
    activeFiscalYear: "FY 2025-26",
    operatingCategoryMappings: {},
  };

  // 1. serializeSnapshot — canonical envelope shape.
  {
    const env = serializeSnapshot(baseSnapshot);
    assert.equal(env.format, "afferent.snapshot");
    assert.equal(env.formatVersion, 1);
    assert.ok(env.exportedAt.endsWith("Z"), "ISO timestamp ends in Z");
    assert.equal(env.snapshot, baseSnapshot, "snapshot reference passed through");
    passed++;
  }

  // 2. snapshotBlob — JSON MIME, deserializable bytes.
  {
    const blob = snapshotBlob(baseSnapshot);
    assert.equal(blob.type, "application/json");
    const text = await blob.text();
    const parsed = JSON.parse(text) as SnapshotFileEnvelope;
    assert.equal(parsed.format, "afferent.snapshot");
    assert.equal(parsed.snapshot.activeFiscalYear, "FY 2025-26");
    passed++;
  }

  // 3. defaultSnapshotFilename — strips whitespace from FY + appends date.
  {
    const filename = defaultSnapshotFilename(baseSnapshot, new Date("2026-05-31T12:00:00Z"));
    assert.equal(filename, "afferent-snapshot-FY2025-26-2026-05-31.json");
    passed++;
  }

  // 4. parseSnapshotJson — happy path round-trips.
  {
    const text = JSON.stringify(serializeSnapshot(baseSnapshot));
    const res = parseSnapshotJson(text);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.snapshot.activeFiscalYear, "FY 2025-26");
      assert.equal(res.snapshot.activeJurisdictionId, "test-jurisdiction");
    }
    passed++;
  }

  // 5. parseSnapshotJson — runs migration on the inner payload.
  //    Proof: a snapshot missing functionalAllocation should still
  //    come back with the array backfilled by migratePersistedState.
  {
    const minusFunctional = { ...baseSnapshot } as Partial<BuildSnapshot>;
    delete (minusFunctional as { functionalAllocation?: unknown }).functionalAllocation;
    const text = JSON.stringify({
      format: "afferent.snapshot",
      formatVersion: 1,
      exportedAt: "2026-05-31T12:00:00.000Z",
      snapshot: minusFunctional,
    });
    const res = parseSnapshotJson(text);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.ok(
        Array.isArray(res.snapshot.functionalAllocation),
        "migration backfilled functionalAllocation",
      );
    }
    passed++;
  }

  // 6. parseSnapshotJson — rejects invalid JSON.
  {
    const res = parseSnapshotJson("not json {");
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.message, /not valid JSON/);
    passed++;
  }

  // 7. parseSnapshotJson — rejects non-object payload.
  {
    const res = parseSnapshotJson("42");
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.message, /empty or malformed/);
    passed++;
  }

  // 8. parseSnapshotJson — rejects wrong format tag.
  {
    const res = parseSnapshotJson(JSON.stringify({
      format: "something-else",
      snapshot: baseSnapshot,
    }));
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.message, /not an Afferent snapshot/);
    passed++;
  }

  // 9. parseSnapshotJson — rejects missing snapshot.
  {
    const res = parseSnapshotJson(JSON.stringify({
      format: "afferent.snapshot",
      formatVersion: 1,
    }));
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.message, /missing the snapshot payload/);
    passed++;
  }

  console.log(`PASS: snapshotIO.fixture — ${passed} cases`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
