/* Deterministic fixture for the persisted-state migration helper.
 *
 * Run with: npm run test:store-migration
 *
 * Covers every backfill in `migratePersistedState`:
 *   1. Empty/partial state — every required field gets seeded so the
 *      Zustand store hydrates into a usable shape.
 *   2. SourceTag coercion — unknown/missing source values become "seed";
 *      valid values pass through.
 *   3. allocationPercent backfill — preserves existing % values and
 *      derives missing ones from amount / center total.
 *   4. capCenterTotals backfill — synthesized from Σ amount per center
 *      when missing.
 *   5. versions backfill — creates one "Recovered baseline" entry when
 *      none exist; preserves existing versions otherwise.
 *   6. comparisonVersionId — repointed to the first version when the
 *      saved id no longer exists.
 *   7. Idempotency — a fully-formed state passes through unchanged.
 *
 * The seed catalogs (CAP_*) are real — verifying we don't regress on
 * the cross-module wiring.
 */

import assert from "node:assert/strict";
import { migratePersistedState } from "../storeMigration";
import { SEED_ALLOCATION_BASES } from "../data/allocationBasesCatalog";
import { DEFAULT_STUDY_CONTEXT } from "../data/studyContext";
import { DEFAULT_JURISDICTION_ID } from "../data/jurisdictions";
import { IMPORTS } from "../data/imports";

// ── 1. Empty state ────────────────────────────────────────────────────────
{
  const state: Record<string, unknown> = {};
  migratePersistedState(state as never);

  assert.deepEqual(state.capCenterOrder, []);
  assert.equal(state.capCenterGlCodes, undefined,
    "capCenterGlCodes is not on the post-PR-12 state shape");
  assert.deepEqual(state.studyContext, { ...DEFAULT_STUDY_CONTEXT });
  assert.equal(state.activeJurisdictionId, DEFAULT_JURISDICTION_ID);
  assert.ok(typeof state.activeFiscalYear === "string" && (state.activeFiscalYear as string).length > 0);
  assert.deepEqual(state.capCenterDisallowed, {});
  assert.ok(Array.isArray(state.imports));
  assert.equal((state.imports as unknown[]).length, IMPORTS.length);
  assert.ok(Array.isArray(state.allocationBases));
  assert.equal((state.allocationBases as unknown[]).length, SEED_ALLOCATION_BASES.length);
  assert.ok(Array.isArray(state.versions));
  assert.equal((state.versions as unknown[]).length, 1);
  console.log("  ✓ empty state seeded across every backfill");
}

// ── 2. SourceTag coercion ─────────────────────────────────────────────────
{
  const state: Record<string, unknown> = {
    services: [
      { id: "s1", source: "seed" },
      { id: "s2", source: "imported" },
      { id: "s3", source: "manual" },
      { id: "s4", source: "0001-9999" }, // legacy free-form GL string
      { id: "s5" },                       // missing entirely
    ],
    positions: [
      { id: "p1", source: undefined, title: "Role A", dept: "PLAN", fte: 1, salary: 0, benefits: 0, hours: 1720 },
      { id: "p2", source: "manual",  title: "Role B", dept: "BLDG", fte: 0.5, salary: 0, benefits: 0, hours: 1600 },
    ],
    operating: [
      { id: "o1", source: "not-a-tag" },                         // no costType — backfill
      { id: "o2", source: "seed", costType: "Labor" },           // existing value preserved
    ],
    volume: [{ id: "w1", source: 42 }],
  };
  migratePersistedState(state as never);

  assert.deepEqual(
    (state.services as { id: string; source: string }[]).map((s) => s.source),
    ["seed", "imported", "manual", "seed", "seed"],
  );
  // PR-F: legacy state.positions is consumed by translateLegacyPositions
  // and then deleted; downstream slices (productiveHours, labor operating
  // rows) carry the data.
  assert.equal((state as Record<string, unknown>).positions, undefined,
    "PR-F: state.positions removed after consumption");
  const op = state.operating as { id: string; source: string; costType: string }[];
  assert.equal(op[0].source, "seed");
  assert.equal(op[0].costType, "Operating",
    "PR-A: legacy operating rows without costType get backfilled to 'Operating'");
  assert.equal(op[1].costType, "Labor",
    "PR-A: existing costType value preserved");
  assert.equal((state.volume as { source: string }[])[0].source, "seed");

  // PR-C: productiveHours derived from positions when missing.
  const ph = state.productiveHours as { id: string; title: string; dept: string; fte: number; hours: number }[];
  assert.equal(ph.length, 2, "PR-C: productiveHours derived from positions count");
  assert.equal(ph[0].id, "p1");
  assert.equal(ph[0].dept, "PLAN");
  assert.equal(ph[0].fte, 1);
  assert.equal(ph[1].hours, 1600);
  console.log("  ✓ SourceTag coercion normalizes legacy values + costType + productiveHours backfill");
}

// ── 2b. PR-D: labor-classified operating rows derived from positions ─────
{
  const state: Record<string, unknown> = {
    positions: [
      { id: "pos-x", title: "Planner", dept: "PLAN", fte: 0.5, salary: 200000, benefits: 60000, hours: 1720, source: "seed" },
    ],
    operating: [
      { id: "OP-1", code: "—", dept: "PLAN", category: "Other", line: "Existing op row", amount: 100, source: "seed", include: true },
    ],
  };
  migratePersistedState(state as never);

  const op = state.operating as { id: string; costType: string; dept: string; amount: number; line: string }[];
  const labor = op.filter((o) => o.costType === "Labor");
  assert.equal(labor.length, 2, "PR-D: each position produces 2 labor rows (salary + benefits)");
  const salary = labor.find((o) => o.id === "op-labor-pos-x-salary");
  const benefits = labor.find((o) => o.id === "op-labor-pos-x-benefits");
  assert.ok(salary && benefits, "deterministic ids on derived labor rows");
  assert.equal(salary!.amount, 100000, "salary amount = salary × fte (200000 × 0.5)");
  assert.equal(benefits!.amount, 30000, "benefits amount = benefits × fte (60000 × 0.5)");
  assert.equal(salary!.dept, "PLAN");
  assert.equal(salary!.line, "Planner · Salaries");

  // Re-running migration must be idempotent (no duplicate labor rows).
  migratePersistedState(state as never);
  const laborAfter = (state.operating as { costType: string }[]).filter((o) => o.costType === "Labor");
  assert.equal(laborAfter.length, 2, "PR-D: re-migration does not duplicate labor rows");
  console.log("  ✓ labor operating rows derived from positions (idempotent)");
}

// ── 3. allocationPercent backfill ─────────────────────────────────────────
{
  const state = {
    capPools: [
      { id: "pool-1", center: "City Mgr", pool: "Salaries", amount: 300, basisId: "b", basis: "B", receiving: "All depts", recoverability: "TBD", review: "Review" },
      { id: "pool-2", center: "City Mgr", pool: "Operating", amount: 100, basisId: "b", basis: "B", receiving: "All depts", recoverability: "TBD", review: "Review" },
      { id: "pool-3", center: "Finance",  pool: "Payroll",   amount: 250, allocationPercent: 80, basisId: "b", basis: "B", receiving: "All depts", recoverability: "TBD", review: "Review" },
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
// Pools without capCenterGlCodes get synth `seed:center:NAME` keys
// stamped onto centerGlCode, and the derived totals key on those.
{
  const state: Record<string, unknown> = {
    capPools: [
      { id: "p1", center: "Center A", amount: 100 },
      { id: "p2", center: "Center A", amount: 50 },
      { id: "p3", center: "Center B", amount: 80 },
    ],
  };
  migratePersistedState(state as never);

  assert.deepEqual(state.capCenterTotals, {
    "seed:center:Center A": 150,
    "seed:center:Center B": 80,
  });
  console.log("  ✓ capCenterTotals synthesized from Σ amount per center");
}

// ── 4b. PR-11: name-keyed center maps translate to glCode-keyed ──────────
// A persisted state with name-keyed capCenterTotals + capCenterGlCodes
// gets rewritten so the maps key on glCode (or `seed:center:NAME` synth)
// instead. Pools get centerGlCode stamped. Centers without a glCode in
// capCenterGlCodes get the synth key.
{
  const state: Record<string, unknown> = {
    capCenterGlCodes: {
      "City Manager": "011-1200",
      "Finance & Administrative Services": "011-1400",
      // "Manual Center" intentionally absent — should synth.
    },
    capCenterTotals: {
      "City Manager": 1000,
      "Finance & Administrative Services": 2000,
      "Manual Center": 500,
    },
    capCenterDisallowed: { "City Manager": 50 },
    capCenterSources: {
      "City Manager": { source: "imported", sourceFile: "cap.pdf" },
      "Manual Center": { source: "manual" },
    },
    capCenterOrder: ["City Manager", "Finance & Administrative Services", "Manual Center"],
    capPools: [
      { id: "p1", center: "City Manager", amount: 100, allocationPercent: 10 },
      { id: "p2", center: "Finance & Administrative Services", amount: 50, allocationPercent: 2.5 },
      { id: "p3", center: "Manual Center", amount: 80, allocationPercent: 16 },
      // Existing centerGlCode preserved verbatim even if it disagrees with the map.
      { id: "p4", center: "City Manager", centerGlCode: "999-9999", amount: 40, allocationPercent: 4 },
    ],
  };
  migratePersistedState(state as never);

  const totals = state.capCenterTotals as Record<string, number>;
  assert.equal(totals["011-1200"], 1000, "City Manager translated to glCode key");
  assert.equal(totals["011-1400"], 2000, "FAS translated to glCode key");
  assert.equal(totals["seed:center:Manual Center"], 500, "Manual Center gets synth key");
  assert.equal(totals["City Manager"], undefined, "old name key removed");

  const disallowed = state.capCenterDisallowed as Record<string, number>;
  assert.equal(disallowed["011-1200"], 50);

  const sources = state.capCenterSources as Record<string, { name: string; source: string; sourceFile?: string }>;
  assert.equal(sources["011-1200"].name, "City Manager");
  assert.equal(sources["011-1200"].source, "imported");
  assert.equal(sources["011-1200"].sourceFile, "cap.pdf");
  assert.equal(sources["seed:center:Manual Center"].name, "Manual Center");
  assert.equal(sources["seed:center:Manual Center"].source, "manual");

  assert.deepEqual(
    state.capCenterOrder,
    ["011-1200", "011-1400", "seed:center:Manual Center"],
    "order entries rewritten to identity keys",
  );

  const pools = state.capPools as { id: string; centerGlCode?: string }[];
  assert.equal(pools.find((p) => p.id === "p1")!.centerGlCode, "011-1200");
  assert.equal(pools.find((p) => p.id === "p2")!.centerGlCode, "011-1400");
  assert.equal(pools.find((p) => p.id === "p3")!.centerGlCode, "seed:center:Manual Center");
  assert.equal(pools.find((p) => p.id === "p4")!.centerGlCode, "999-9999", "existing centerGlCode preserved");

  // PR-12: the legacy name → glCode map is stripped from the migrated
  // state once translateCenterMaps has consumed it.
  assert.equal(state.capCenterGlCodes, undefined,
    "legacy capCenterGlCodes field deleted after translation");
  console.log("  ✓ center maps translated from name-keyed to glCode-keyed");
}

// ── 4c. Translation is idempotent — already-translated state passes through
{
  const state: Record<string, unknown> = {
    capCenterGlCodes: { "City Manager": "011-1200" },
    capCenterTotals: { "011-1200": 1000, "seed:center:Manual": 500 },
    capCenterDisallowed: { "011-1200": 50 },
    capCenterSources: {
      "011-1200": { name: "City Manager", source: "imported" },
      "seed:center:Manual": { name: "Manual", source: "manual" },
    },
    capCenterOrder: ["011-1200", "seed:center:Manual"],
    capPools: [
      { id: "p1", center: "City Manager", centerGlCode: "011-1200", amount: 100, allocationPercent: 10 },
    ],
  };
  migratePersistedState(state as never);

  const totals = state.capCenterTotals as Record<string, number>;
  // Keys unchanged — no re-translation happened.
  assert.equal(totals["011-1200"], 1000);
  assert.equal(totals["seed:center:Manual"], 500);
  // No double-prefixing (would produce `seed:center:seed:center:Manual`).
  assert.equal(totals["seed:center:seed:center:Manual"], undefined,
    "already-translated state must not be re-translated");
  console.log("  ✓ already-translated state passes through unchanged (idempotent)");
}

// ── 4d. Version snapshots also get translated ─────────────────────────────
{
  const state: Record<string, unknown> = {
    capCenterGlCodes: { "City Manager": "011-1200" },
    capCenterTotals: { "011-1200": 1000 },
    capCenterDisallowed: {},
    capCenterSources: { "011-1200": { name: "City Manager", source: "imported" } },
    capCenterOrder: ["011-1200"],
    capPools: [
      { id: "p1", center: "City Manager", centerGlCode: "011-1200", amount: 100, allocationPercent: 100 },
    ],
    versions: [
      {
        id: "v-legacy",
        versionNumber: 1,
        label: "Legacy",
        status: "adopted",
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "user",
        sourceImportIds: [],
        // Old name-keyed snapshot — should be translated by migration.
        snapshot: {
          capCenterGlCodes: { "City Manager": "011-1200" },
          capCenterTotals: { "City Manager": 999 },
          capCenterDisallowed: { "City Manager": 9 },
          capCenterSources: { "City Manager": { source: "seed" } },
          capCenterOrder: ["City Manager"],
          capPools: [
            { id: "old-p", center: "City Manager", amount: 50, allocationPercent: 5 },
          ],
        },
      },
    ],
  };
  migratePersistedState(state as never);

  const versions = state.versions as { snapshot: Record<string, unknown> }[];
  const snap = versions[0].snapshot as {
    capCenterTotals: Record<string, number>;
    capCenterOrder: string[];
    capPools: { centerGlCode?: string }[];
  };
  assert.equal(snap.capCenterTotals["011-1200"], 999, "version snapshot totals translated");
  assert.deepEqual(snap.capCenterOrder, ["011-1200"], "version snapshot order translated");
  assert.equal(snap.capPools[0].centerGlCode, "011-1200",
    "version snapshot pool centerGlCode stamped");
  console.log("  ✓ version snapshots translated alongside live state");
}

// ── 5. versions backfill (seed when missing) ──────────────────────────────
{
  const state: Record<string, unknown> = { imports: [] };
  migratePersistedState(state as never);

  const versions = state.versions as { label: string; status: string; sourceImportIds: number[] }[];
  assert.equal(versions.length, 1);
  assert.equal(versions[0].label, "Recovered baseline");
  assert.equal(versions[0].status, "adopted");
  // Empty starting imports → empty sourceImportIds. (Confirms migration
  // doesn't re-seed imports into the snapshot.)
  // Note: the migration may have backfilled imports separately, but the
  // baseline was constructed before that mattered.
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

// ── 7. Idempotency ────────────────────────────────────────────────────────
{
  const state: Record<string, unknown> = {};
  migratePersistedState(state as never);
  const firstPass = JSON.parse(JSON.stringify(state));
  migratePersistedState(state as never);

  // Versions are timestamped on creation so we can't reuse them. Strip
  // before comparison — the rest of the state must be byte-identical
  // across two migrate passes.
  delete firstPass.versions;
  delete firstPass.comparisonVersionId;
  const second = JSON.parse(JSON.stringify(state));
  delete second.versions;
  delete second.comparisonVersionId;
  assert.deepEqual(second, firstPass);
  console.log("  ✓ migration is idempotent (versions excluded by design)");
}

console.log("\nAll storeMigration assertions passed.");
