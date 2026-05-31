import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { requireAiBearer } from "./aiAuth";
import { aiCors } from "./aiCors";
import { requireAllowedOrigin } from "./aiOriginGuard";
import { rateLimit } from "./aiRateLimit";
import { requestLogger } from "./requestLogger";
import { resolveMaxBytes } from "./aiUploadValidator";
import { handleAiParseFees } from "./aiParseFees";
import { handleAiParseServices } from "./aiParseServices";
import { handleAiParseLabor } from "./aiParseLabor";
import { handleAiParseOperating } from "./aiParseOperating";
import { handleAiParseCap } from "./aiParseCap";
import { handleAiParseVolume } from "./aiParseVolume";
import { handleExcelPreview } from "./excelImport";

const app = new Hono();

// /healthz is intentionally registered before any AI middleware so
// uptime probes don't trip the origin / auth / rate-limit gates and
// don't appear in the bearer-token audit logs.
app.get("/healthz", (c) =>
  c.json({ ok: true, uptime: process.uptime(), at: new Date().toISOString() }),
);

// Protected API surfaces — apply the same gates to /api/ai/* (AI parse
// routes, Anthropic-backed) and /api/import/* (deterministic import
// routes, no AI). Ordered cheapest-reject-first. requestLogger wraps
// everything so we always get an envelope log even when downstream
// middleware rejects. aiCors runs first so OPTIONS preflights can
// short-circuit before the origin guard / auth gates. The body cap
// mirrors the upload validator's MAX_UPLOAD_MB so the streaming gate
// and the parsed-size gate agree on the limit.
for (const prefix of ["/api/ai/*", "/api/import/*"] as const) {
  app.use(prefix, requestLogger());
  app.use(prefix, aiCors());
  app.use(prefix, requireAllowedOrigin());
  app.use(prefix, requireAiBearer());
  app.use(prefix, rateLimit());
  app.use(prefix, bodyLimit({
    maxSize: resolveMaxBytes(),
    onError: () => new Response(
      JSON.stringify({ ok: false, message: "Upload exceeds size limit." }),
      { status: 413, headers: { "content-type": "application/json" } },
    ),
  }));
}

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

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`Server listening on http://localhost:${port}`);
});
