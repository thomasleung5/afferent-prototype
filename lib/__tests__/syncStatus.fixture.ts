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
  formatRelativeTime, syncStatusIsRetryable, syncStatusLabel,
  syncStatusTone,
} from "../studies/syncStatus";

let passed = 0;

// ── tones ───────────────────────────────────────────────────────
{
  assert.equal(syncStatusTone({ kind: "local-only" }),     "neutral");
  assert.equal(syncStatusTone({ kind: "not-configured" }), "neutral");
  assert.equal(syncStatusTone({ kind: "idle" }),           "pos");
  assert.equal(syncStatusTone({ kind: "saving" }),         "neutral");
  assert.equal(syncStatusTone({ kind: "saved", at: 0 }),   "pos");
  assert.equal(
    syncStatusTone({ kind: "error", message: "x", lastSavedAt: null }),
    "neg",
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
  passed++;
}

// ── labels ──────────────────────────────────────────────────────
{
  const now = 1_700_000_000_000;
  assert.equal(syncStatusLabel({ kind: "local-only" }, now),     "Local only");
  assert.equal(syncStatusLabel({ kind: "not-configured" }, now), "Storage not configured");
  assert.equal(syncStatusLabel({ kind: "idle" }, now),           "Synced");
  assert.equal(syncStatusLabel({ kind: "saving" }, now),         "Saving…");
  assert.equal(
    syncStatusLabel({ kind: "saved", at: now - 30_000 }, now),
    "Saved · 30s ago",
  );
  assert.equal(
    syncStatusLabel({ kind: "error", message: "boom", lastSavedAt: null }, now),
    "Save failed",
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

console.log(`PASS: syncStatus.fixture — ${passed} cases`);
