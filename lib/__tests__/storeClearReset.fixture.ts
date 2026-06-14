/* Fixture for the store's destructive Clear / Reset actions.
 *
 * Run with: npm run test:store-clear-reset
 *
 * Verifies that:
 *   1. clearAll() empties every persisted slice — including
 *      allocationBases (the bug this fixture guards against).
 *   2. clearAll() purges the persisted localStorage entry so a
 *      subsequent rehydrate doesn't resurrect the prior seed state.
 *   3. Once cleared, re-running the migration on the cleared snapshot
 *      keeps allocationBases empty (the migration treats `[]` as a
 *      deliberate clear; only null/undefined re-seeds).
 *   4. resetAll() restores the seed model afterwards — Clear is
 *      irreversible from the user's standpoint, but Reset gives
 *      analysts a way back to the canonical baseline.
 *
 * tsx (Node) has no localStorage; install a Storage-compatible shim on
 * globalThis BEFORE importing the store module so its module-level
 * persist() middleware finds something. Mirrors activeStudy.fixture.ts. */

import assert from "node:assert/strict";

const storage = new Map<string, string>();
const shim: Storage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => { storage.clear(); },
  key: (i: number) => Array.from(storage.keys())[i] ?? null,
  get length() { return storage.size; },
};
// Zustand's persist middleware probes `window.localStorage`, not just
// the bare `localStorage` global — so the shim has to live on both.
(globalThis as unknown as { localStorage: Storage }).localStorage = shim;
(globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: shim };

async function main(): Promise<void> {
  const { useBuildStore } = await import("../store");
  const { migratePersistedState } = await import("../storeMigration");
  const { SEED_ALLOCATION_BASES } = await import("../data/allocationBasesCatalog");

  // The persist middleware key — duplicated from store.ts STORAGE_KEY
  // so the fixture can read/inspect the persisted blob directly.
  const STORAGE_KEY = "afferent.build.v1";

  let passed = 0;

  // ── 1. Seed baseline carries allocation bases ────────────────────
  {
    useBuildStore.getState().resetAll();
    const bases = useBuildStore.getState().allocationBases;
    assert.ok(bases.length > 0, "seed model ships with allocation bases");
    assert.equal(bases.length, SEED_ALLOCATION_BASES.length);
    passed += 1;
    console.log("  ✓ seed baseline carries the SEED_ALLOCATION_BASES catalog");
  }

  // ── 2. clearAll() empties allocationBases + the persisted blob ────
  {
    useBuildStore.getState().clearAll();
    const state = useBuildStore.getState();
    assert.deepEqual(state.allocationBases, [],
      "clearAll() wipes allocationBases to []");
    assert.deepEqual(state.operating, [], "every persisted slice is cleared");
    assert.deepEqual(state.services, []);
    assert.deepEqual(state.capPools, []);
    assert.deepEqual(state.imports, []);
    assert.deepEqual(state.functionalAllocation, []);
    // persist() writes asynchronously after the set() call in clearAll;
    // give it a tick. Confirms the localStorage line in clearAll() (the
    // explicit removeItem before set) actually clears, and any
    // subsequent persist write reflects the cleared shape.
    await new Promise((r) => setImmediate(r));
    const blob = storage.get(STORAGE_KEY);
    if (blob) {
      const parsed = JSON.parse(blob) as { state?: { allocationBases?: unknown[] } };
      assert.ok(Array.isArray(parsed.state?.allocationBases));
      assert.equal(parsed.state?.allocationBases?.length, 0,
        "persisted snapshot reflects the cleared allocationBases");
    }
    passed += 1;
    console.log("  ✓ clearAll() empties allocationBases + persisted snapshot");
  }

  // ── 3. Re-running migration on the cleared state keeps it empty ──
  //
  // The bug this guards: storeMigration treating `[]` as "missing" and
  // re-seeding the catalog on every rehydrate would resurrect the data
  // the user just cleared. The cleared snapshot must round-trip.
  {
    const cleared = JSON.parse(JSON.stringify(useBuildStore.getState())) as {
      allocationBases: unknown[];
    };
    assert.equal(cleared.allocationBases.length, 0);
    migratePersistedState(cleared as never);
    assert.equal(cleared.allocationBases.length, 0,
      "migration preserves the cleared empty array on rehydrate");
    passed += 1;
    console.log("  ✓ migration preserves empty allocationBases through rehydrate");
  }

  // ── 4. resetAll() restores the seed model after a clear ──────────
  {
    useBuildStore.getState().resetAll();
    const bases = useBuildStore.getState().allocationBases;
    assert.equal(bases.length, SEED_ALLOCATION_BASES.length,
      "resetAll() restores the canonical seed catalog");
    assert.ok(useBuildStore.getState().services.length > 0,
      "resetAll() also restores the services seed");
    passed += 1;
    console.log("  ✓ resetAll() restores the seed model after clearAll()");
  }

  console.log(`\n${passed}/4 store clear / reset assertions passed.`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
