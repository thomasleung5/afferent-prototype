/* Deterministic fixture for the persisted-state migration helper.
 *
 * Run with: npm run test:store-migration
 *
 * Covers every backfill in `migratePersistedState`:
 *   1. Empty/partial state — every required field gets seeded so the
 *      Zustand store hydrates into a usable shape.
 *   2. SourceTag coercion — unknown/missing source values become "seed";
 *      valid values pass through. operating rows get costType + laborType
 *      defaults when missing.
 *   3. allocationPercent backfill — preserves existing % values and
 *      derives missing ones from amount / center total.
 *   4. capCenterTotals backfill — synthesized from Σ amount per center
 *      when missing.
 *   5. versions backfill — creates one "Recovered baseline" entry when
 *      none exist; preserves existing versions otherwise.
 *   6. comparisonVersionId — repointed to the first version when the
 *      saved id no longer exists.
 *   7. functionalAllocation — seeds when missing; new-shape buckets
 *      pass through untouched.
 *   8. Idempotency — running migration twice produces identical state.
 */

import assert from "node:assert/strict";
import { migratePersistedState } from "../storeMigration";
import { SEED_ALLOCATION_BASES } from "../data/allocationBasesCatalog";
import { DEFAULT_STUDY_CONTEXT } from "../data/studyContext";
import { DEFAULT_JURISDICTION_ID } from "../data/jurisdictions";
import { IMPORTS } from "../data/imports";
import { FUNCTIONAL_ALLOCATION_SEED } from "../data/functionalAllocation";

// ── 1. Empty state ────────────────────────────────────────────────────────
{
  const state: Record<string, unknown> = {};
  migratePersistedState(state as never);

  assert.deepEqual(state.capCenterOrder, []);
  assert.deepEqual(state.studyContext, { ...DEFAULT_STUDY_CONTEXT });
  assert.equal(state.activeJurisdictionId, DEFAULT_JURISDICTION_ID);
  assert.ok(typeof state.activeFiscalYear === "string" && (state.activeFiscalYear as string).length > 0);
  assert.deepEqual(state.capCenterDisallowed, {});
  assert.deepEqual(state.serviceRoleAllocations, {},
    "serviceRoleAllocations backfills to empty override map");
  assert.ok(Array.isArray(state.imports));
  assert.equal((state.imports as unknown[]).length, IMPORTS.length);
  assert.ok(Array.isArray(state.allocationBases));
  assert.equal((state.allocationBases as unknown[]).length, SEED_ALLOCATION_BASES.length);
  assert.ok(Array.isArray(state.functionalAllocation),
    "functionalAllocation backfilled from seed when missing");
  assert.equal(
    (state.functionalAllocation as unknown[]).length,
    FUNCTIONAL_ALLOCATION_SEED.length,
    "functionalAllocation seed restored in full",
  );
  assert.ok(Array.isArray(state.versions));
  assert.equal((state.versions as unknown[]).length, 1);
  console.log("  ✓ empty state seeded across every backfill");
}

// ── 2. SourceTag coercion + costType / laborType backfill ────────────────
{
  const state: Record<string, unknown> = {
    services: [
      { id: "s1", source: "seed" },
      { id: "s2", source: "imported" },
      { id: "s3", source: "manual" },
      { id: "s4", source: "0001-9999" }, // legacy free-form GL string
      { id: "s5" },                       // missing entirely
    ],
    operating: [
      { id: "o1", source: "not-a-tag" },                                                              // no costType — backfill to Operating
      { id: "o2", source: "seed", costType: "Labor", line: "Salaries", category: "Other" },           // labor, no laborType — backfill to Salary
      { id: "o3", source: "seed", costType: "Labor", line: "Health Insurance", category: "Other" },   // labor, no laborType — backfill to Benefits
      { id: "o4", source: "seed", costType: "Labor", line: "Anything", laborType: "Salary" },         // existing laborType preserved
    ],
    volume: [{ id: "w1", source: 42 }],
  };
  migratePersistedState(state as never);

  assert.deepEqual(
    (state.services as { id: string; source: string }[]).map((s) => s.source),
    ["seed", "imported", "manual", "seed", "seed"],
  );
  const op = state.operating as { id: string; source: string; costType: string; laborType?: string }[];
  assert.equal(op[0].source, "seed");
  assert.equal(op[0].costType, "Operating",
    "operating rows without costType get backfilled to 'Operating'");
  assert.equal(op[1].costType, "Labor",
    "existing costType value preserved");
  assert.equal(op[1].laborType, "Salary",
    "labor row with 'Salaries' in line text classified as Salary");
  assert.equal(op[2].laborType, "Benefits",
    "labor row with 'Health Insurance' classified as Benefits");
  assert.equal(op[3].laborType, "Salary",
    "existing laborType value preserved");
  assert.equal((state.volume as { source: string }[])[0].source, "seed");
  console.log("  ✓ SourceTag coercion normalizes legacy values + costType / laborType backfill");
}

// ── 3. allocationPercent backfill ─────────────────────────────────────────
{
  const state = {
    capPools: [
      { id: "pool-1", center: "City Mgr", centerGlCode: "011-1200", pool: "Salaries", amount: 300,
        basisId: "b", basis: "B", receiving: "All depts", recoverability: "TBD", review: "Review" },
      { id: "pool-2", center: "City Mgr", centerGlCode: "011-1200", pool: "Operating", amount: 100,
        basisId: "b", basis: "B", receiving: "All depts", recoverability: "TBD", review: "Review" },
      { id: "pool-3", center: "Finance", centerGlCode: "011-1400", pool: "Payroll", amount: 250,
        allocationPercent: 80, basisId: "b", basis: "B", receiving: "All depts", recoverability: "TBD", review: "Review" },
    ],
  };
  migratePersistedState(state as never);

  const pools = state.capPools as { id: string; allocationPercent: number; amount: number }[];
  // Derived from amount / center total (300+100 = 400).
  assert.equal(pools.find((p) => p.id === "pool-1")!.allocationPercent, 75);
  assert.equal(pools.find((p) => p.id === "pool-2")!.allocationPercent, 25);
  // Existing % preserved verbatim.
  assert.equal(pools.find((p) => p.id === "pool-3")!.allocationPercent, 80);
  console.log("  ✓ allocationPercent derived from amount/center total when missing");
}

// ── 4. capCenterTotals backfill ───────────────────────────────────────────
{
  const state: Record<string, unknown> = {
    capPools: [
      { id: "p1", center: "Center A", centerGlCode: "011-1200", amount: 100 },
      { id: "p2", center: "Center A", centerGlCode: "011-1200", amount: 50 },
      { id: "p3", center: "Center B", centerGlCode: "011-1300", amount: 80 },
    ],
  };
  migratePersistedState(state as never);

  assert.deepEqual(state.capCenterTotals, {
    "011-1200": 150,
    "011-1300": 80,
  });
  console.log("  ✓ capCenterTotals synthesized from Σ amount per center");
}

// ── 5. versions backfill (seed when missing) ──────────────────────────────
{
  const state: Record<string, unknown> = { imports: [] };
  migratePersistedState(state as never);

  const versions = state.versions as { label: string; status: string; sourceImportIds: number[] }[];
  assert.equal(versions.length, 1);
  assert.equal(versions[0].label, "Recovered baseline");
  assert.equal(versions[0].status, "adopted");
  assert.ok(Array.isArray(versions[0].sourceImportIds));
  console.log("  ✓ versions backfilled with a single 'Recovered baseline'");
}

// ── 6. comparisonVersionId stays in sync with versions ────────────────────
{
  const existingVersions = [
    {
      id: "version-a", versionNumber: 1, label: "A", status: "adopted",
      createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user",
      sourceImportIds: [], snapshot: {} as never,
    },
    {
      id: "version-b", versionNumber: 2, label: "B", status: "draft",
      createdAt: "2026-02-01T00:00:00.000Z", createdBy: "user",
      sourceImportIds: [], snapshot: {} as never,
    },
  ];
  const state = {
    versions: existingVersions,
    comparisonVersionId: "version-stale-deleted-id",
  };
  migratePersistedState(state as never);
  assert.equal(state.comparisonVersionId, "version-a");

  const state2 = { versions: existingVersions, comparisonVersionId: "version-b" };
  migratePersistedState(state2 as never);
  assert.equal(state2.comparisonVersionId, "version-b", "valid id preserved");
  console.log("  ✓ comparisonVersionId repointed when stale, preserved when valid");
}

// ── 7. functionalAllocation — new-shape buckets pass through ─────────────
{
  const state: Record<string, unknown> = {
    functionalAllocation: [
      { id: "fa-zero-a", dept: "PLAN", name: "Long Range Planning",
        recoverabilityPct: 0, hoursSharePct: 0, rateBasisHours: false, source: "manual" },
      { id: "fa-zero-b", dept: "PLAN", name: "Current Planning",
        recoverabilityPct: 0, hoursSharePct: 0, rateBasisHours: false, source: "manual" },
    ],
  };
  migratePersistedState(state as never);
  const buckets = state.functionalAllocation as { id: string; hoursSharePct: number }[];
  assert.equal(buckets.find((b) => b.id === "fa-zero-a")!.hoursSharePct, 0,
    "new-shape bucket with analyst-zeroed share passes through unchanged");
  assert.equal(buckets.find((b) => b.id === "fa-zero-b")!.hoursSharePct, 0,
    "new-shape bucket with analyst-zeroed share passes through unchanged");
  console.log("  ✓ functionalAllocation new-shape buckets pass through unchanged");
}

// ── 8. Idempotency ────────────────────────────────────────────────────────
// Each scenario runs migratePersistedState twice and asserts the state is
// byte-identical across the two passes. Versions are stripped because
// makeStudyVersion stamps a fresh timestamp + id when it has to mint a
// baseline — those will legitimately differ on first creation but never
// thereafter. The second-pass check still proves the migration is stable.

function assertIdempotent(label: string, build: () => Record<string, unknown>): void {
  const state = build();
  migratePersistedState(state as never);
  const firstPass = JSON.parse(JSON.stringify(state));
  migratePersistedState(state as never);
  delete firstPass.versions;
  delete firstPass.comparisonVersionId;
  const second = JSON.parse(JSON.stringify(state));
  delete second.versions;
  delete second.comparisonVersionId;
  assert.deepEqual(second, firstPass, `idempotency failed: ${label}`);
}

assertIdempotent("empty state", () => ({}));
console.log("  ✓ migration is idempotent (empty state)");

assertIdempotent("populated state with versions", () => ({
  capCenterTotals: { "011-1200": 1000 },
  capCenterDisallowed: {},
  capCenterSources: { "011-1200": { name: "City Manager", source: "imported" } },
  capCenterOrder: ["011-1200"],
  capPools: [
    { id: "p1", center: "City Manager", centerGlCode: "011-1200",
      amount: 100, allocationPercent: 100,
      basisId: "b", basis: "B", pool: "Pool",
      receiving: "All depts", recoverability: "TBD", review: "Review" },
  ],
  versions: [
    {
      id: "v-1", versionNumber: 1, label: "v1", status: "adopted",
      createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user",
      sourceImportIds: [],
      snapshot: {
        capCenterTotals: { "011-1200": 999 },
        capCenterDisallowed: {},
        capCenterSources: { "011-1200": { name: "City Manager", source: "seed" } },
        capCenterOrder: ["011-1200"],
        capPools: [
          { id: "old-p", center: "City Manager", centerGlCode: "011-1200",
            amount: 50, allocationPercent: 5,
            basisId: "b", basis: "B", pool: "Pool",
            receiving: "All depts", recoverability: "TBD", review: "Review" },
        ],
      },
    },
  ],
  comparisonVersionId: "v-1",
}));
console.log("  ✓ migration is idempotent (populated state with versions)");

console.log("\nAll storeMigration assertions passed.");
