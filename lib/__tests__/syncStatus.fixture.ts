/* Fixture for the sync-status label / tone / relative-time helpers.
 *
 * Run with: npm run test:sync-status
 *
 * Verifies:
 *   - every SyncStatus variant has a stable tone + label,
 *   - syncStatusLabel embeds the relative time on "saved" status,
 *   - formatRelativeTime brackets: just now / Ns ago / Nm ago /
 *     Nh ago / Nd ago, with a 5-second "just now" window. */

import assert from "node:assert/strict";
import {
  formatRelativeTime, studySaveSummary, syncStatusCanSaveNow, syncStatusIsRetryable,
  syncStatusLabel, syncStatusTone,
} from "../studies/syncStatus";

let passed = 0;

// ── tones ───────────────────────────────────────────────────────
{
  assert.equal(syncStatusTone({ kind: "local-only" }),     "neutral");
  assert.equal(syncStatusTone({ kind: "not-configured" }), "neutral");
  assert.equal(syncStatusTone({ kind: "awaiting-study" }), "warn",
    "awaiting-study reads as a gate — user has work to do");
  assert.equal(syncStatusTone({ kind: "idle" }),           "pos");
  assert.equal(syncStatusTone({ kind: "diverged" }),       "warn",
    "diverged reads as a warning — there's unsaved work, but nothing is lost");
  assert.equal(syncStatusTone({ kind: "saving" }),         "neutral");
  assert.equal(syncStatusTone({ kind: "saved", at: 0 }),   "pos");
  assert.equal(
    syncStatusTone({ kind: "error", message: "x", lastSavedAt: null }),
    "neg",
  );
  assert.equal(
    syncStatusTone({ kind: "conflict", currentRevisionId: null }),
    "warn",
    "conflict reads as a warning, not an error — local edits aren't lost",
  );
  passed++;
}

// ── retryable ───────────────────────────────────────────────────
{
  assert.equal(syncStatusIsRetryable({ kind: "saving" }), false);
  assert.equal(syncStatusIsRetryable({ kind: "saved", at: 0 }), false);
  assert.equal(
    syncStatusIsRetryable({ kind: "error", message: "x", lastSavedAt: null }),
    true,
  );
  // Conflict is deliberately NOT retryable — clicking "Save now"
  // would re-conflict; the user resolves by reload or explicit
  // overwrite via a separate flow.
  assert.equal(
    syncStatusIsRetryable({ kind: "conflict", currentRevisionId: null }),
    false,
  );
  assert.equal(
    syncStatusIsRetryable({ kind: "conflict", currentRevisionId: "abc" }),
    false,
  );
  // awaiting-study is a gate, not a save failure — the user picks
  // a study to resolve; a retry button would be meaningless.
  assert.equal(syncStatusIsRetryable({ kind: "awaiting-study" }), false);
  passed++;
}

// ── canSaveNow ──────────────────────────────────────────────────
{
  // idle/saved have nothing to push — the last save already reflects
  // local state, so there's nothing for the button to do.
  assert.equal(syncStatusCanSaveNow({ kind: "idle" }), false);
  assert.equal(syncStatusCanSaveNow({ kind: "saved", at: 0 }), false);
  // diverged DOES have something to push (e.g. just loaded a named
  // version) with no pending edit to trigger autosave on its own.
  assert.equal(syncStatusCanSaveNow({ kind: "diverged" }), true);
  assert.equal(
    syncStatusCanSaveNow({ kind: "error", message: "x", lastSavedAt: null }),
    true,
  );
  // A save already in flight — clicking again would be redundant.
  assert.equal(syncStatusCanSaveNow({ kind: "saving" }), false);
  // Conflict deliberately excluded — same rationale as syncStatusIsRetryable.
  assert.equal(
    syncStatusCanSaveNow({ kind: "conflict", currentRevisionId: null }),
    false,
  );
  passed++;
}

// ── labels ──────────────────────────────────────────────────────
{
  const now = 1_700_000_000_000;
  assert.equal(syncStatusLabel({ kind: "local-only" }, now),     "Local only");
  assert.equal(syncStatusLabel({ kind: "not-configured" }, now), "Storage not configured");
  assert.equal(syncStatusLabel({ kind: "idle" }, now),           "Synced");
  assert.equal(syncStatusLabel({ kind: "diverged" }, now),       "Not yet saved to the server");
  assert.equal(syncStatusLabel({ kind: "saving" }, now),         "Saving…");
  assert.equal(
    syncStatusLabel({ kind: "saved", at: now - 30_000 }, now),
    "Saved · 30s ago",
  );
  assert.equal(
    syncStatusLabel({ kind: "error", message: "boom", lastSavedAt: null }, now),
    "Save failed",
  );
  assert.equal(
    syncStatusLabel({ kind: "conflict", currentRevisionId: null }, now),
    "Conflict — reload to resolve",
  );
  assert.equal(
    syncStatusLabel({ kind: "awaiting-study" }, now),
    "No study selected — pick one to enable autosave",
    "label must NOT read like a valid production save destination",
  );
  passed++;
}

// ── formatRelativeTime: just-now window ─────────────────────────
{
  const now = 100_000;
  assert.equal(formatRelativeTime(now, now), "just now");
  assert.equal(formatRelativeTime(now - 2_000, now), "just now");
  assert.equal(formatRelativeTime(now - 4_999, now), "just now");
  passed++;
}

// ── formatRelativeTime: seconds ─────────────────────────────────
{
  const now = 1_000_000;
  assert.equal(formatRelativeTime(now - 5_000, now), "5s ago");
  assert.equal(formatRelativeTime(now - 30_000, now), "30s ago");
  assert.equal(formatRelativeTime(now - 59_000, now), "59s ago");
  passed++;
}

// ── formatRelativeTime: minutes / hours / days ──────────────────
{
  const now = 10_000_000_000;
  assert.equal(formatRelativeTime(now - 60_000, now), "1m ago");
  assert.equal(formatRelativeTime(now - 5 * 60_000, now), "5m ago");
  assert.equal(formatRelativeTime(now - 60 * 60_000, now), "1h ago");
  assert.equal(formatRelativeTime(now - 3 * 60 * 60_000, now), "3h ago");
  assert.equal(formatRelativeTime(now - 24 * 60 * 60_000, now), "1d ago");
  assert.equal(formatRelativeTime(now - 7 * 24 * 60 * 60_000, now), "7d ago");
  passed++;
}

// ── formatRelativeTime: future timestamps clamp to "just now" ───
{
  const now = 1_000_000;
  assert.equal(formatRelativeTime(now + 5_000, now), "just now",
    "negative delta floors to zero, not a future label");
  passed++;
}

// ── studySaveSummary: names the save destination explicitly ────
{
  const now = 1_700_000_000_000;
  assert.equal(
    studySaveSummary({ kind: "local-only" }, null, now),
    "Local only — current work is saved in this browser, not to a server study.",
  );
  assert.equal(
    studySaveSummary({ kind: "not-configured" }, null, now),
    "Local only — server study storage isn't configured on this deployment.",
  );
  assert.equal(
    studySaveSummary({ kind: "awaiting-study" }, null, now),
    "Local only — select or create a study below to save this work.",
    "local-only message must include an obvious next action",
  );
  assert.equal(
    studySaveSummary({ kind: "saving" }, "FY26 Fee Study", now),
    "Saving to FY26 Fee Study…",
  );
  assert.equal(
    studySaveSummary({ kind: "idle" }, "FY26 Fee Study", now),
    "Current work saved to FY26 Fee Study",
  );
  assert.equal(
    studySaveSummary({ kind: "diverged" }, "FY26 Fee Study", now),
    "Loaded locally — not yet saved to FY26 Fee Study",
  );
  assert.equal(
    studySaveSummary({ kind: "saved", at: now - 30_000 }, "FY26 Fee Study", now),
    "Current work saved to FY26 Fee Study · 30s ago",
    "names the study AND keeps the relative-time detail",
  );
  assert.equal(
    studySaveSummary({ kind: "error", message: "boom", lastSavedAt: null }, "FY26 Fee Study", now),
    "Save to FY26 Fee Study failed",
  );
  assert.equal(
    studySaveSummary({ kind: "conflict", currentRevisionId: null }, "FY26 Fee Study", now),
    "Conflict with FY26 Fee Study — reload to resolve",
  );
  // Defensive fallback when a study name isn't available even though
  // the status implies one should be (shouldn't happen in practice).
  assert.equal(studySaveSummary({ kind: "saving" }, null, now), "Saving…");
  passed++;
}

console.log(`PASS: syncStatus.fixture — ${passed} cases`);
