/* Logger fixture.
 *
 * Run with: npm run test:logger
 *
 * Exercises logEvent shape (always-present ts/level fields, JSON
 * roundtrip) via a captured sink so output stays out of the test
 * stream. */

import assert from "node:assert/strict";
import { logEvent, resetLogSink, setLogSink } from "../logger";

// ── 1. Default level is info; ts is set ──────────────────────────────────
{
  const captured: unknown[] = [];
  setLogSink((line) => captured.push(JSON.parse(line)));
  logEvent({ msg: "test", route: "/api/ai/parse-fees" });
  resetLogSink();

  assert.equal(captured.length, 1);
  const payload = captured[0] as Record<string, unknown>;
  assert.equal(payload.level, "info");
  assert.equal(payload.msg, "test");
  assert.equal(payload.route, "/api/ai/parse-fees");
  assert.ok(typeof payload.ts === "string");
  // Sanity-check ISO format roughly: matches 2024-..-..T..:..:..
  assert.match(payload.ts as string, /^\d{4}-\d{2}-\d{2}T/);
  console.log("  ✓ default level + ts + passthrough fields");
}

// ── 2. Custom level + extra fields preserved ─────────────────────────────
{
  const captured: unknown[] = [];
  setLogSink((line) => captured.push(JSON.parse(line)));
  logEvent({
    level: "error",
    msg: "anthropic failure",
    tag: "ai-parse-cap",
    latency_ms: 1234,
    error: "rate_limit_error",
  });
  resetLogSink();

  const payload = captured[0] as Record<string, unknown>;
  assert.equal(payload.level, "error");
  assert.equal(payload.tag, "ai-parse-cap");
  assert.equal(payload.latency_ms, 1234);
  assert.equal(payload.error, "rate_limit_error");
  console.log("  ✓ custom level + arbitrary extras passed through");
}

// ── 3. Sink failure doesn't propagate ────────────────────────────────────
{
  setLogSink(() => { throw new Error("disk full"); });
  // Must not throw — the logger swallows sink errors to keep the
  // request path running even when the log destination dies.
  logEvent({ msg: "should not throw" });
  resetLogSink();
  console.log("  ✓ sink failure is swallowed (logging never breaks the request)");
}

console.log("\nAll logger assertions passed.");
