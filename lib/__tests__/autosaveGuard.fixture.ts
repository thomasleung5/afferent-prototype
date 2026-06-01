/* Fixture for the autosave-suppression counter.
 *
 * Run with: npm run test:autosave-guard
 *
 * Verifies:
 *   - begin/end balance the counter and isAutosaveSuppressed reflects it,
 *   - withSuppressedAutosave restores on normal exit AND on throw,
 *   - nested suppressions work (inner end doesn't unsuppress outer scope),
 *   - end is a no-op when the counter is already at zero,
 *   - async callbacks extend suppression until the Promise settles,
 *   - rejected async callbacks still release suppression. */

import assert from "node:assert/strict";
import {
  beginAutosaveSuppression, endAutosaveSuppression, isAutosaveSuppressed,
  withSuppressedAutosave, resetAutosaveSuppressionForTests,
} from "../studies/autosaveGuard";

async function main(): Promise<void> {
  let passed = 0;

  // ── Initial state ──────────────────────────────────────────────
  resetAutosaveSuppressionForTests();
  {
    assert.equal(isAutosaveSuppressed(), false, "starts unsuppressed");
    passed++;
  }

  // ── begin/end balance ─────────────────────────────────────────
  {
    beginAutosaveSuppression();
    assert.equal(isAutosaveSuppressed(), true);
    endAutosaveSuppression();
    assert.equal(isAutosaveSuppressed(), false);
    passed++;
  }

  // ── Nested suppression ────────────────────────────────────────
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

  // ── end is no-op at zero ──────────────────────────────────────
  {
    endAutosaveSuppression();
    endAutosaveSuppression();
    assert.equal(isAutosaveSuppressed(), false, "extra ends don't go negative");
    passed++;
  }

  // ── withSuppressedAutosave: normal exit ───────────────────────
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

  // ── withSuppressedAutosave: restores on throw ─────────────────
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

  // ── Nested withSuppressedAutosave ─────────────────────────────
  {
    withSuppressedAutosave(() => {
      withSuppressedAutosave(() => {
        assert.equal(isAutosaveSuppressed(), true);
      });
      assert.equal(isAutosaveSuppressed(), true,
        "inner ended but outer still active");
    });
    assert.equal(isAutosaveSuppressed(), false);
    passed++;
  }

  // ── Async withSuppressedAutosave: extends across awaits ───────
  {
    resetAutosaveSuppressionForTests();
    let inflightSuppressed = false;
    let afterAwaitSuppressed = false;
    const p = withSuppressedAutosave(async () => {
      inflightSuppressed = isAutosaveSuppressed();
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      afterAwaitSuppressed = isAutosaveSuppressed();
      return "ok";
    });
    assert.equal(isAutosaveSuppressed(), true,
      "outer suppression remains while inner Promise is pending");
    const out = await p;
    assert.equal(out, "ok");
    assert.equal(inflightSuppressed, true, "suppressed inside fn");
    assert.equal(afterAwaitSuppressed, true, "suppressed across the await");
    assert.equal(isAutosaveSuppressed(), false, "released after Promise settled");
    passed++;
  }

  // ── Async withSuppressedAutosave: releases on rejection ───────
  {
    resetAutosaveSuppressionForTests();
    let threw: unknown = null;
    try {
      await withSuppressedAutosave(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        throw new Error("async-boom");
      });
    } catch (e) {
      threw = e;
    }
    assert.ok(threw instanceof Error && threw.message === "async-boom");
    assert.equal(isAutosaveSuppressed(), false, "released after async rejection");
    passed++;
  }

  console.log(`PASS: autosaveGuard.fixture — ${passed} cases`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
