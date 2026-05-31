/* Rate-limit fixture.
 *
 * Run with: npm run test:ai-rate-limit
 *
 * Exercises recordRequest's sliding-window math directly. Time is
 * passed in so the test can advance it without sleeping. */

import assert from "node:assert/strict";
import {
  clientKey, recordRequest, resolvePerMinute, type RateLimitStore,
} from "../aiRateLimit";

// ── 1. Under the limit → allow, store grows ──────────────────────────────
{
  const store: RateLimitStore = new Map();
  const now = 1_000_000;
  for (let i = 0; i < 5; i += 1) {
    const r = recordRequest({ key: "1.1.1.1", now: now + i, perMinute: 10, store });
    assert.equal(r.allowed, true);
  }
  assert.equal(store.get("1.1.1.1")?.length, 5,
    "every allowed request is recorded into the window");
  console.log("  ✓ under-limit traffic allowed and recorded");
}

// ── 2. At the limit → next request rejected with retry-after ─────────────
{
  const store: RateLimitStore = new Map();
  const t0 = 5_000_000;
  for (let i = 0; i < 3; i += 1) {
    recordRequest({ key: "k", now: t0 + i * 1000, perMinute: 3, store });
  }
  const reject = recordRequest({ key: "k", now: t0 + 3000, perMinute: 3, store });
  assert.equal(reject.allowed, false);
  if (!reject.allowed) {
    assert.ok(reject.retryAfterSec >= 1, "retry-after must be ≥ 1 second");
    // Oldest timestamp is t0; window is 60s; we asked at t0+3000ms so
    // we need to wait ~57s for the oldest to roll off.
    assert.ok(reject.retryAfterSec >= 56 && reject.retryAfterSec <= 58,
      `retryAfterSec ≈ 57s (got ${reject.retryAfterSec})`);
  }
  console.log("  ✓ over-limit → 429-equivalent with retry-after");
}

// ── 3. Rejected requests do NOT count against the window ─────────────────
//      Otherwise an attacker hammering would keep extending their own
//      lockout indefinitely.
{
  const store: RateLimitStore = new Map();
  const t0 = 9_000_000;
  for (let i = 0; i < 2; i += 1) {
    recordRequest({ key: "k", now: t0, perMinute: 2, store });
  }
  // First rejection at t0.
  recordRequest({ key: "k", now: t0, perMinute: 2, store });
  // Spam 100 more rejections within the window — must not increase
  // the stored timestamp count beyond the original 2.
  for (let i = 0; i < 100; i += 1) {
    const r = recordRequest({ key: "k", now: t0 + i, perMinute: 2, store });
    assert.equal(r.allowed, false);
  }
  assert.equal(store.get("k")?.length, 2,
    "rejected probes do not extend the lockout");
  console.log("  ✓ rejected requests don't extend the lockout window");
}

// ── 4. Window rollover — old timestamps drop ─────────────────────────────
{
  const store: RateLimitStore = new Map();
  const t0 = 10_000_000;
  // 3 requests at t0; cap = 3.
  for (let i = 0; i < 3; i += 1) {
    recordRequest({ key: "k", now: t0, perMinute: 3, store });
  }
  // 65s later, all three should be outside the 60s window.
  const after = recordRequest({ key: "k", now: t0 + 65_000, perMinute: 3, store });
  assert.equal(after.allowed, true,
    "old timestamps must roll off so the caller isn't locked out forever");
  assert.equal(store.get("k")?.length, 1,
    "store contains only the new request after rollover");
  console.log("  ✓ window rollover frees the counter");
}

// ── 5. Separate keys don't share buckets ─────────────────────────────────
{
  const store: RateLimitStore = new Map();
  const now = 12_000_000;
  for (let i = 0; i < 3; i += 1) {
    recordRequest({ key: "a", now, perMinute: 3, store });
  }
  // 'a' is now at the cap; 'b' should still be empty.
  const b = recordRequest({ key: "b", now, perMinute: 3, store });
  assert.equal(b.allowed, true,
    "rate limit is keyed per client — different IPs don't share counters");
  console.log("  ✓ separate keys are independent");
}

// ── 6. clientKey — IP extraction precedence ──────────────────────────────
{
  assert.equal(clientKey({ forwarded: "1.2.3.4", realIp: "9.9.9.9" }), "1.2.3.4",
    "X-Forwarded-For wins (proxy-chain semantics)");
  assert.equal(
    clientKey({ forwarded: "1.2.3.4, 10.0.0.1, 10.0.0.2", realIp: null }),
    "1.2.3.4",
    "first hop in the comma chain is the real client",
  );
  assert.equal(clientKey({ forwarded: null, realIp: "9.9.9.9" }), "9.9.9.9",
    "X-Real-IP fallback when X-Forwarded-For missing");
  assert.equal(clientKey({ forwarded: null, realIp: null }), "anonymous",
    "no headers → shared 'anonymous' bucket throttles misconfigured proxies");
  console.log("  ✓ clientKey precedence: X-Forwarded-For > X-Real-IP > anonymous");
}

// ── 7. resolvePerMinute — env override + defaults ────────────────────────
{
  const original = process.env.AI_RATE_LIMIT_PER_MIN;
  try {
    delete process.env.AI_RATE_LIMIT_PER_MIN;
    assert.equal(resolvePerMinute(), 30, "default = 30/min");

    process.env.AI_RATE_LIMIT_PER_MIN = "5";
    assert.equal(resolvePerMinute(), 5);

    process.env.AI_RATE_LIMIT_PER_MIN = "0";
    assert.equal(resolvePerMinute(), 30, "zero → default");

    process.env.AI_RATE_LIMIT_PER_MIN = "abc";
    assert.equal(resolvePerMinute(), 30, "NaN → default");

    process.env.AI_RATE_LIMIT_PER_MIN = "12.7";
    assert.equal(resolvePerMinute(), 12, "fractional → floored");
  } finally {
    if (original == null) delete process.env.AI_RATE_LIMIT_PER_MIN;
    else process.env.AI_RATE_LIMIT_PER_MIN = original;
  }
  console.log("  ✓ resolvePerMinute default + override + invalid-value fallback");
}

console.log("\nAll aiRateLimit assertions passed.");
