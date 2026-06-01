/* Fixture for the active-study module.
 *
 * Run with: npm run test:active-study
 *
 * Verifies the module-level store + persistence semantics. tsx (Node)
 * has no localStorage, so the fixture installs a tiny in-memory shim
 * BEFORE the module under test is dynamically imported. */

import assert from "node:assert/strict";

// Install a Storage-compatible shim on globalThis before the module
// is loaded so its module-level `readInitial()` finds something.
const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => { storage.clear(); },
  key: (i: number) => Array.from(storage.keys())[i] ?? null,
  get length() { return storage.size; },
};

async function main(): Promise<void> {
  const {
    getActiveStudy, getActiveStudyId, setActiveStudy, clearActiveStudy,
    resetActiveStudyForTests,
  } = await import("../studies/activeStudy");

  let passed = 0;

  resetActiveStudyForTests();

  // ── Initial state ──────────────────────────────────────────────
  {
    assert.equal(getActiveStudy(), null);
    assert.equal(getActiveStudyId(), null);
    passed++;
  }

  // ── setActiveStudy round-trips to localStorage ────────────────
  {
    resetActiveStudyForTests();
    setActiveStudy({ id: "abc", name: "FY26 Fee Study" });
    assert.deepEqual(getActiveStudy(), { id: "abc", name: "FY26 Fee Study" });
    assert.equal(getActiveStudyId(), "abc");
    assert.equal(storage.get("afferent.activeStudyId"), "abc");
    assert.equal(storage.get("afferent.activeStudyName"), "FY26 Fee Study");
    passed++;
  }

  // ── clearActiveStudy removes from localStorage + state ────────
  {
    setActiveStudy({ id: "abc", name: "X" });
    clearActiveStudy();
    assert.equal(getActiveStudy(), null);
    assert.equal(storage.has("afferent.activeStudyId"), false);
    assert.equal(storage.has("afferent.activeStudyName"), false);
    passed++;
  }

  // ── Equal-value setActiveStudy is a no-op (no re-persist) ─────
  {
    resetActiveStudyForTests();
    setActiveStudy({ id: "y", name: "Y" });
    // Manually wipe the storage key to detect a re-persist.
    storage.delete("afferent.activeStudyId");
    setActiveStudy({ id: "y", name: "Y" });
    assert.equal(storage.has("afferent.activeStudyId"), false,
      "equal-value setActiveStudy must not re-persist");
    passed++;
  }

  // ── Changing the name re-persists ─────────────────────────────
  {
    resetActiveStudyForTests();
    setActiveStudy({ id: "z", name: "First" });
    setActiveStudy({ id: "z", name: "Second" });
    assert.equal(getActiveStudy()?.name, "Second");
    assert.equal(storage.get("afferent.activeStudyName"), "Second");
    passed++;
  }

  // ── Changing the id re-persists both keys ─────────────────────
  {
    resetActiveStudyForTests();
    setActiveStudy({ id: "first", name: "F" });
    setActiveStudy({ id: "second", name: "S" });
    assert.equal(getActiveStudyId(), "second");
    assert.equal(storage.get("afferent.activeStudyId"), "second");
    assert.equal(storage.get("afferent.activeStudyName"), "S");
    passed++;
  }

  // ── setActiveStudy(null) when already null is a no-op ─────────
  {
    resetActiveStudyForTests();
    setActiveStudy(null);
    assert.equal(getActiveStudy(), null);
    assert.equal(storage.size, 0);
    passed++;
  }

  console.log(`PASS: activeStudy.fixture — ${passed} cases`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
