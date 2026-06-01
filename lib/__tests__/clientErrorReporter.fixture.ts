/* Fixture for the client error reporter indirection.
 *
 * Run with: npm run test:client-error-reporter
 *
 * Verifies:
 *   - default reporter writes to console.warn / console.error
 *     respectively, matching the pre-indirection behavior
 *   - setClientErrorReporter swaps in a custom reporter
 *   - resetClientErrorReporter restores the default
 *   - the payload shape (`source` / `level` / `message` / `fields`)
 *     is delivered verbatim to the active reporter */

import assert from "node:assert/strict";
import {
  reportClientError, setClientErrorReporter, resetClientErrorReporter,
  type ClientErrorPayload,
} from "../telemetry/clientErrorReporter";

let passed = 0;

// Capture console.* calls so we can verify the default path without
// polluting CI output.
function captureConsole<T>(run: () => T): { warn: unknown[][]; error: unknown[][] } {
  const warn: unknown[][] = [];
  const error: unknown[][] = [];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args: unknown[]) => { warn.push(args); };
  console.error = (...args: unknown[]) => { error.push(args); };
  try {
    run();
  } finally {
    console.warn = origWarn;
    console.error = origError;
  }
  return { warn, error };
}

// 1. Default reporter — warn routes to console.warn.
{
  resetClientErrorReporter();
  const { warn, error } = captureConsole(() => {
    reportClientError({
      source: "apiResponse",
      level: "warn",
      message: "non-2xx response",
      fields: { path: "/api/x", status: 502 },
    });
  });
  assert.equal(warn.length, 1, "warn level → one console.warn call");
  assert.equal(error.length, 0);
  assert.equal(warn[0][0], "[apiResponse] non-2xx response");
  assert.deepEqual(warn[0][1], { path: "/api/x", status: 502 });
  passed++;
}

// 2. Default reporter — error routes to console.error.
{
  resetClientErrorReporter();
  const { warn, error } = captureConsole(() => {
    reportClientError({
      source: "apiFetch",
      level: "error",
      message: "Network error.",
      fields: { path: "/api/x" },
    });
  });
  assert.equal(error.length, 1, "error level → one console.error call");
  assert.equal(warn.length, 0);
  assert.equal(error[0][0], "[apiFetch] Network error.");
  passed++;
}

// 3. Default reporter — missing fields gracefully omitted.
{
  resetClientErrorReporter();
  const { warn } = captureConsole(() => {
    reportClientError({
      source: "x",
      level: "warn",
      message: "no fields",
    });
  });
  assert.deepEqual(warn[0][1], {}, "no `fields` → empty object, no crash");
  passed++;
}

// 4. Custom reporter receives the exact payload.
{
  const received: ClientErrorPayload[] = [];
  setClientErrorReporter({
    report(payload) { received.push(payload); },
  });
  reportClientError({
    source: "errorBoundary",
    level: "error",
    message: "render crash",
    fields: { name: "TypeError", componentStack: "  at Foo > Bar" },
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].source, "errorBoundary");
  assert.equal(received[0].level, "error");
  assert.equal(received[0].message, "render crash");
  assert.deepEqual(received[0].fields, {
    name: "TypeError",
    componentStack: "  at Foo > Bar",
  });
  passed++;
}

// 5. Custom reporter is sticky across calls until reset.
{
  const received: ClientErrorPayload[] = [];
  setClientErrorReporter({ report: (p) => received.push(p) });
  reportClientError({ source: "a", level: "warn", message: "1" });
  reportClientError({ source: "b", level: "warn", message: "2" });
  assert.equal(received.length, 2);
  assert.equal(received[0].message, "1");
  assert.equal(received[1].message, "2");
  passed++;
}

// 6. resetClientErrorReporter restores the default.
{
  setClientErrorReporter({ report: () => { /* swallow */ } });
  resetClientErrorReporter();
  const { warn } = captureConsole(() => {
    reportClientError({ source: "z", level: "warn", message: "post-reset" });
  });
  assert.equal(warn.length, 1, "reset restores console reporter");
  passed++;
}

resetClientErrorReporter();
console.log(`PASS: clientErrorReporter.fixture — ${passed} cases`);
