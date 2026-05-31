import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
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

const app = new Hono();

// Middleware chain for /api/ai/*, ordered cheapest-reject-first.
// requestLogger wraps everything so we always get an envelope log
// even when downstream middleware rejects. aiCors runs first so OPTIONS
// preflights can short-circuit before the origin guard / auth gates.
app.use("/api/ai/*", requestLogger());
app.use("/api/ai/*", aiCors());
app.use("/api/ai/*", requireAllowedOrigin());
app.use("/api/ai/*", requireAiBearer());
app.use("/api/ai/*", rateLimit());
// Body cap mirrors aiUploadValidator's MAX_UPLOAD_MB so the streaming
// gate and the parsed-size gate agree on the limit.
app.use("/api/ai/*", bodyLimit({
  maxSize: resolveMaxBytes(),
  onError: () => new Response(
    JSON.stringify({ ok: false, message: "Upload exceeds size limit." }),
    { status: 413, headers: { "content-type": "application/json" } },
  ),
}));

app.post("/api/ai/parse-fees", (c) => handleAiParseFees(c.req.raw));
app.post("/api/ai/parse-services", (c) => handleAiParseServices(c.req.raw));
app.post("/api/ai/parse-labor", (c) => handleAiParseLabor(c.req.raw));
app.post("/api/ai/parse-operating", (c) => handleAiParseOperating(c.req.raw));
app.post("/api/ai/parse-cap", (c) => handleAiParseCap(c.req.raw));
app.post("/api/ai/parse-volume", (c) => handleAiParseVolume(c.req.raw));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`API listening on http://localhost:${port}`);
});
