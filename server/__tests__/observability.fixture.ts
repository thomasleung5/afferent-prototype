/* Observability fixture.
 *
 * Run with: npm run test:observability
 *
 * End-to-end check that:
 *   - requestLogger emits one INFO line per /api/* request with
 *     method / route / status / latency_ms / req_id
 *   - unhandled exceptions inside an /api/* handler produce
 *     `{ ok: false, message, req_id }` JSON 500 (not an HTML error)
 *   - the request-id in the JSON body matches the one in the log
 *     line so an operator can correlate them
 *   - `Authorization` headers + form bodies are NOT echoed into
 *     log fields (privacy invariant; tests would catch a future
 *     regression that started dumping headers into logs) */

import assert from "node:assert/strict";
import { Hono } from "hono";
import { logEvent, resetLogSink, setLogSink } from "../logger";
import { requestLogger, type RequestLogEnv } from "../requestLogger";

function makeApp() {
  const app = new Hono<RequestLogEnv>();

  // Global error handler — same shape as server/index.ts uses.
  app.onError((err, c) => {
    const route = new URL(c.req.url).pathname;
    if (!route.startsWith("/api/")) throw err;
    const requestId = (c.get as (k: "requestId") => string | undefined)("requestId");
    logEvent({
      level: "error",
      msg: "unhandled exception",
      method: c.req.method,
      route,
      req_id: requestId,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      { ok: false, message: "Internal server error.", req_id: requestId },
      500,
    );
  });

  app.use("/api/*", requestLogger());
  app.get("/api/ok", (c) => c.json({ ok: true }));
  app.get("/api/boom", () => { throw new Error("synthetic"); });
  app.post("/api/echo-secrets", (c) => {
    // Read the secrets — we deliberately do NOT pass them into any
    // logEvent here so the test can prove the envelope log strips them.
    void c.req.header("authorization");
    return c.json({ ok: true });
  });
  return app;
}

interface LogLine {
  level: string; msg: string;
  method?: string; route?: string;
  status?: number; latency_ms?: number; req_id?: string;
  error?: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const captured: LogLine[] = [];
  setLogSink((line) => captured.push(JSON.parse(line)));

  try {
    const app = makeApp();

    // ── 1. Happy path: one envelope log line, fields populated ────────────
    {
      captured.length = 0;
      const res = await app.request("/api/ok");
      assert.equal(res.status, 200);
      assert.equal(captured.length, 1, "exactly one envelope line per request");
      const line = captured[0];
      assert.equal(line.level, "info");
      assert.equal(line.msg, "request");
      assert.equal(line.method, "GET");
      assert.equal(line.route, "/api/ok");
      assert.equal(line.status, 200);
      assert.equal(typeof line.latency_ms, "number");
      assert.equal(typeof line.req_id, "string");
      assert.ok((line.req_id as string).length > 0, "req_id is non-empty");
      console.log("  ✓ 2xx request → INFO line with method/route/status/latency_ms/req_id");
    }

    // ── 2. req_id is unique per request ───────────────────────────────────
    {
      captured.length = 0;
      await app.request("/api/ok");
      await app.request("/api/ok");
      assert.equal(captured.length, 2);
      assert.notEqual(captured[0].req_id, captured[1].req_id,
        "every request gets its own correlation id");
      console.log("  ✓ each request gets a unique req_id");
    }

    // ── 3. Unhandled exception → 500 JSON + matching req_id ───────────────
    {
      captured.length = 0;
      const res = await app.request("/api/boom");
      assert.equal(res.status, 500);
      assert.equal(res.headers.get("content-type"), "application/json");
      const body = await res.json() as { ok: boolean; message: string; req_id?: string };
      assert.equal(body.ok, false);
      assert.equal(body.message, "Internal server error.",
        "client sees a generic message — never the underlying error string");
      assert.ok(body.req_id, "req_id echoed in the body for operator correlation");

      // We emit two log lines for an exception path: one from
      // requestLogger's catch (re-thrown) and one from the global
      // onError handler. Both must carry the same req_id.
      assert.ok(captured.length >= 1, "at least one log line for an error path");
      const errorLines = captured.filter((l) => l.req_id === body.req_id);
      assert.ok(errorLines.length >= 1, "log lines carry the same req_id the client received");
      const hasErrorLine = errorLines.some((l) => l.level === "error");
      assert.ok(hasErrorLine, "at least one log line is level=error");
      console.log("  ✓ uncaught exception → 500 JSON with req_id; matching log line emitted");
    }

    // ── 4. 4xx surfaces as warn (per requestLogger's level mapping) ───────
    {
      captured.length = 0;
      const app2 = new Hono<RequestLogEnv>();
      app2.use("/api/*", requestLogger());
      app2.all("/api/*", (c) => c.json({ ok: false, message: "Not found" }, 404));
      await app2.request("/api/missing");
      assert.equal(captured[0].level, "warn",
        "4xx requests should be warn — easier to spot in a noisy info stream");
      assert.equal(captured[0].status, 404);
      console.log("  ✓ 4xx response → warn-level envelope line");
    }

    // ── 5. Privacy: Authorization header doesn't leak into the log ────────
    //      The envelope log is built from method/route/status/latency_ms
    //      only — request headers + body are never serialized. This
    //      assertion would fail if a future change started dumping
    //      headers into the structured log.
    {
      captured.length = 0;
      const form = new FormData();
      form.append("file", new Blob(["pretend secret bytes"]), "secret.bin");
      await app.request("/api/echo-secrets", {
        method: "POST",
        body: form,
        headers: { Authorization: "Bearer super-secret-token-9999" },
      });
      assert.equal(captured.length, 1);
      const serialized = JSON.stringify(captured[0]);
      assert.ok(!serialized.includes("super-secret-token-9999"),
        "Authorization header value MUST NOT appear in the log line");
      assert.ok(!serialized.includes("Bearer "),
        "even the literal 'Bearer ' prefix must not appear");
      assert.ok(!serialized.includes("pretend secret bytes"),
        "uploaded body content MUST NOT appear in the log line");
      console.log("  ✓ Authorization headers + request body never appear in log fields");
    }
  } finally {
    resetLogSink();
  }
}

main()
  .then(() => console.log("\nAll observability assertions passed."))
  .catch((err) => { console.error(err); process.exit(1); });
