import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { handleAiParseFees } from "./aiParseFees";
import { handleAiParseServices } from "./aiParseServices";
import { handleAiParseLabor } from "./aiParseLabor";
import { handleAiParseOperating } from "./aiParseOperating";
import { handleAiParseCap } from "./aiParseCap";
import { handleAiParseVolume } from "./aiParseVolume";

const app = new Hono();

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
