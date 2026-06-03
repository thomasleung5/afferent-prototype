/* Fixture for the sandbox-mode flag.
 *
 * Run with: npm run test:sandbox-mode
 *
 * The sandbox flag is the explicit escape hatch from the route-level
 * StudySelectionGate — it lets authenticated users explore demo
 * workspaces or browse without a server-backed study while still
 * making the local-only persistence path conscious rather than
 * silent. This fixture pins the module's contract:
 *
 *   - default state is off,
 *   - enable / disable flip the flag and persist exactly the same
 *     marker on / off,
 *   - enable / disable are idempotent (no underflow or double-fires),
 *   - reset-for-tests really does clear state + storage so subsequent
 *     test files don't bleed into each other. */

import assert from "node:assert/strict";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
  clear(): void { this.data.clear(); }
  // The DOM Storage interface includes these — stub them for type
  // compatibility; the module under test only uses get/set/remove.
  key(_i: number): string | null { return null; }
  get length(): number { return this.data.size; }
}

const memStorage = new MemoryStorage();

async function main(): Promise<void> {
  // Install the sessionStorage shim BEFORE the module imports it.
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage =
    memStorage as unknown as Storage;

  // Dynamic import so the static-init readInitial() sees the shim
  // we just installed (top-level imports run before this).
  const mod = await import("../studies/sandboxMode");
  const {
    isSandboxMode, enableSandboxMode, disableSandboxMode,
    resetSandboxModeForTests,
  } = mod;

  let passed = 0;

  // ── default state is off ──────────────────────────────────────
  {
    resetSandboxModeForTests();
    assert.equal(isSandboxMode(), false, "default off after reset");
    passed++;
  }

  // ── enable flips on + persists ────────────────────────────────
  {
    resetSandboxModeForTests();
    enableSandboxMode();
    assert.equal(isSandboxMode(), true);
    assert.equal(memStorage.getItem("afferent.sandboxMode"), "1");
    passed++;
  }

  // ── disable flips off + clears storage ────────────────────────
  {
    resetSandboxModeForTests();
    enableSandboxMode();
    disableSandboxMode();
    assert.equal(isSandboxMode(), false);
    assert.equal(memStorage.getItem("afferent.sandboxMode"), null,
      "disable must REMOVE the key, not set it to '0'");
    passed++;
  }

  // ── enable is idempotent ──────────────────────────────────────
  {
    resetSandboxModeForTests();
    enableSandboxMode();
    enableSandboxMode();
    enableSandboxMode();
    assert.equal(isSandboxMode(), true);
    passed++;
  }

  // ── disable is idempotent (no underflow) ──────────────────────
  {
    resetSandboxModeForTests();
    disableSandboxMode();
    disableSandboxMode();
    assert.equal(isSandboxMode(), false, "extra disables don't flip the flag");
    passed++;
  }

  // ── reset clears state AND storage ────────────────────────────
  {
    enableSandboxMode();
    resetSandboxModeForTests();
    assert.equal(isSandboxMode(), false);
    assert.equal(memStorage.getItem("afferent.sandboxMode"), null);
    passed++;
  }

  console.log(`PASS: sandboxMode.fixture — ${passed} cases`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
