/* Fixture for the autosave-suppression counter.
 *
 * Run with: npm run test:autosave-guard
 *
 * Verifies:
 *   - begin/end balance the counter and isAutosaveSuppressed reflects it,
 *   - withSuppressedAutosave restores on normal exit AND on throw,
 *   - nested suppressions work (inner end doesn't unsuppress outer scope),
 *   - end is a no-op when the counter is already at zero. */

import assert from "node:assert/strict";
import {
  beginAutosaveSuppression, endAutosaveSuppression, isAutosaveSuppressed,
  withSuppressedAutosave, resetAutosaveSuppressionForTests,
} from "../studies/autosaveGuard";

let passed = 0;

// ── Initial state ────────────────────────────────────────────────
resetAutosaveSuppressionForTests();
{
  assert.equal(isAutosaveSuppressed(), false, "starts unsuppressed");
  passed++;
}

// ── begin/end balance ────────────────────────────────────────────
{
  beginAutosaveSuppression();
  assert.equal(isAutosaveSuppressed(), true);
  endAutosaveSuppression();
  assert.equal(isAutosaveSuppressed(), false);
  passed++;
}

// ── Nested suppression ───────────────────────────────────────────
{
  beginAutosaveSuppression();
  beginAutosaveSuppression();
  assert.equal(isAutosaveSuppressed(), true);
  endAutosaveSuppression();
  assert.equal(isAutosaveSuppressed(), true, "still suppressed at depth 1");
  endAutosaveSuppression();
  assert.equal(isAutosaveSuppressed(), false);
  passed++;
}

// ── end is no-op at zero ─────────────────────────────────────────
{
  endAutosaveSuppression();
  endAutosaveSuppression();
  assert.equal(isAutosaveSuppressed(), false, "extra ends don't go negative");
  passed++;
}

// ── withSuppressedAutosave: normal exit ──────────────────────────
{
  let seen = false;
  const out = withSuppressedAutosave(() => {
    seen = isAutosaveSuppressed();
    return 42;
  });
  assert.equal(seen, true, "inside the wrapper, suppression is active");
  assert.equal(out, 42, "return value preserved");
  assert.equal(isAutosaveSuppressed(), false, "cleared on exit");
  passed++;
}

// ── withSuppressedAutosave: restores on throw ────────────────────
{
  let threwAs: unknown = null;
  try {
    withSuppressedAutosave(() => { throw new Error("boom"); });
  } catch (e) {
    threwAs = e;
  }
  assert.ok(threwAs instanceof Error && threwAs.message === "boom");
  assert.equal(isAutosaveSuppressed(), false, "cleared even on throw");
  passed++;
}

// ── Nested withSuppressedAutosave ────────────────────────────────
{
  withSuppressedAutosave(() => {
    withSuppressedAutosave(() => {
      assert.equal(isAutosaveSuppressed(), true);
    });
    // Inner ended but outer is still active.
    assert.equal(isAutosaveSuppressed(), true);
  });
  assert.equal(isAutosaveSuppressed(), false);
  passed++;
}

console.log(`PASS: autosaveGuard.fixture — ${passed} cases`);
