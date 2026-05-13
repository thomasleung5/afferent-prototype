import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { handleAiExtract } from "./aiExtract";
import { handleAiParseFees } from "./aiParseFees";
import { handleAiParseServices } from "./aiParseServices";
import { handleAiParseSalary } from "./aiParseSalary";

const app = new Hono();

app.post("/api/ai/extract", (c) => handleAiExtract(c.req.raw));
app.post("/api/ai/parse-fees", (c) => handleAiParseFees(c.req.raw));
app.post("/api/ai/parse-services", (c) => handleAiParseServices(c.req.raw));
app.post("/api/ai/parse-salary", (c) => handleAiParseSalary(c.req.raw));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`API listening on http://localhost:${port}`);
});
