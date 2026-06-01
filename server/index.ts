import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { requireAuth } from "./requireAuth";
import { aiCors } from "./aiCors";
import { requireAllowedOrigin } from "./aiOriginGuard";
import { rateLimit } from "./aiRateLimit";
import { requestLogger } from "./requestLogger";
import { logEvent } from "./logger";
import { resolveMaxBytes } from "./aiUploadValidator";
import { ensureValidOrExit, logEnvSummary, validateEnv } from "./env";
import { handleAiParseFees } from "./aiParseFees";
import { handleAiParseServices } from "./aiParseServices";
import { handleAiParseLabor } from "./aiParseLabor";
import { handleAiParseOperating } from "./aiParseOperating";
import { handleAiParseCap } from "./aiParseCap";
import { handleAiParseVolume } from "./aiParseVolume";
import { handleExcelPreview } from "./excelImport";
import { studiesRoutes, resolveStudySnapshotMaxBytes } from "./studies";
import { organizationsRoutes } from "./organizations";

const app = new Hono();

// Global onError → JSON 500 for any unhandled exception escaping an
// /api/* handler. Echoes the req_id back to the caller so an analyst
// can pull the matching log line. Non-API routes fall back to Hono's
// default error response (HTML, no JSON shape promise).
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
    error_name: err instanceof Error ? err.name : undefined,
  });
  return c.json(
    { ok: false, message: "Internal server error.", req_id: requestId },
    500,
  );
});

// /healthz is intentionally registered before any other middleware so
// uptime probes don't trip the origin / auth / rate-limit gates and
// don't show up in the per-request log stream.
app.get("/healthz", (c) =>
  c.json({ ok: true, uptime: process.uptime(), at: new Date().toISOString() }),
);

// Per-request structured log line for EVERY /api/* request — including
// /api/import/* and any future un-protected /api/public/* surfaces.
// Logs method, route, status, latency_ms, and a per-request id that
// downstream handlers can use to correlate their own log lines.
app.use("/api/*", requestLogger());

// Protected API surfaces — apply the same gates to /api/ai/* (AI parse
// routes, Anthropic-backed) and /api/import/* (deterministic import
// routes, no AI). Ordered cheapest-reject-first. aiCors runs first so
// OPTIONS preflights can short-circuit before the origin guard / auth
// gates. The body cap mirrors the upload validator's MAX_UPLOAD_MB so
// the streaming gate and the parsed-size gate agree on the limit.
for (const prefix of ["/api/ai/*", "/api/import/*"] as const) {
  app.use(prefix, aiCors());
  app.use(prefix, requireAllowedOrigin());
  // Real user auth (Supabase JWT). Replaces the legacy shared-bearer
  // gate — that token was baked into the SPA bundle and never a real
  // authn boundary. The middleware honors a documented dev escape
  // hatch (AUTH_DEV_BYPASS=1 + NODE_ENV!=production).
  app.use(prefix, requireAuth());
  app.use(prefix, rateLimit());
  app.use(prefix, bodyLimit({
    maxSize: resolveMaxBytes(),
    onError: () => new Response(
      JSON.stringify({ ok: false, message: "Upload exceeds size limit." }),
      { status: 413, headers: { "content-type": "application/json" } },
    ),
  }));
}

// /api/studies/* — protected DB persistence surface. Same CORS / origin
// / auth gates as the AI + import paths, but no AI rate limiter (these
// are cheap DB ops and shouldn't share the Anthropic-spend quota), and
// the body cap is the JSON-snapshot cap rather than the upload cap.
app.use("/api/studies/*", aiCors());
app.use("/api/studies/*", requireAllowedOrigin());
app.use("/api/studies/*", requireAuth());
app.use("/api/studies/*", bodyLimit({
  maxSize: resolveStudySnapshotMaxBytes(),
  onError: () => new Response(
    JSON.stringify({ ok: false, message: "Snapshot exceeds size limit." }),
    { status: 413, headers: { "content-type": "application/json" } },
  ),
}));
app.route("/api/studies", studiesRoutes);

// /api/organizations/* — sibling surface to /api/studies/*. Same CORS
// / origin / auth gates. GET-only today (lists the caller's
// memberships); no body limit needed but the auth chain is kept
// identical for predictability.
app.use("/api/organizations/*", aiCors());
app.use("/api/organizations/*", requireAllowedOrigin());
app.use("/api/organizations/*", requireAuth());
app.route("/api/organizations", organizationsRoutes);

app.post("/api/ai/parse-fees", (c) => handleAiParseFees(c.req.raw));
app.post("/api/ai/parse-services", (c) => handleAiParseServices(c.req.raw));
app.post("/api/ai/parse-labor", (c) => handleAiParseLabor(c.req.raw));
app.post("/api/ai/parse-operating", (c) => handleAiParseOperating(c.req.raw));
app.post("/api/ai/parse-cap", (c) => handleAiParseCap(c.req.raw));
app.post("/api/ai/parse-volume", (c) => handleAiParseVolume(c.req.raw));

app.post("/api/import/excel/preview", (c) => handleExcelPreview(c.req.raw));

// Any unmatched /api/* request returns JSON 404. Without this catch the
// SPA fallback below would happily serve dist/index.html for a misspelled
// endpoint, which would mask client bugs as silent HTML responses.
app.all("/api/*", (c) =>
  c.json({ ok: false, message: "Not found" }, 404),
);

// Static assets (dist/assets/*, fonts, favicon, …) plus an SPA fallback
// for any non-/api GET that doesn't resolve to a real file. The order
// matters: serveStatic falls through to next() on miss, so the index
// fallback runs last and serves the SPA shell. Both are no-ops in dev
// (`npm run dev:api`) because `dist/` doesn't exist yet — Vite handles
// the client side directly on :3000 in that mode.
app.use("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

// Validate prod env before opening the listener so a misconfigured
// deploy crashes the container before the load balancer routes any
// traffic to it. In development this is a no-op.
const envResult = validateEnv(process.env);
ensureValidOrExit(envResult);
logEnvSummary(envResult);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`Server listening on http://localhost:${port}`);
});
