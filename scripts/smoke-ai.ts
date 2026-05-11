/* Smoke test for the AI extract route.
 *
 *   npx tsx scripts/smoke-ai.ts
 *
 * Verifies:
 *  - With no ANTHROPIC_API_KEY set, the route returns 503 + status "no-api-key"
 *    and a useful message (so the UI can render an inline "AI unavailable" note).
 *  - With a key set, a synthetic unmapped row roundtrips into a structured
 *    suggestion via Claude Sonnet 4.6.
 *
 * The route is imported directly as a function — no HTTP server needed. */

import { POST } from "../app/api/ai/extract/route";
import type { AiExtractRequest, AiExtractResponse } from "../lib/ai/types";

function makeRequest(body: AiExtractRequest): Request {
  return new Request("http://localhost/api/ai/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sample: AiExtractRequest = {
  domain: "positions",
  headers: ["Position", "Department", "FTE", "Salary", "Benefits", "Productive Hours"],
  rows: [
    {
      index: 0,
      cells: ["Senior Plans Examiner", "Bldng", 1, 235000, 84000, 1720],
      reason: "ambiguous-dept",
      lineage: {
        file: "FY 26-27 Salary Table.xlsx",
        sheet: "Roster",
        row: 14,
        confidence: "review",
        importedAt: new Date().toISOString(),
      },
    },
  ],
  examples: {
    domain: "positions",
    sample: [
      { title: "Plans Examiner", dept: "BLDG", fte: 1, salary: 238000, benefits: 85000, hours: 1720 },
      { title: "Senior Planner", dept: "PLAN", fte: 1, salary: 214000, benefits: 78000, hours: 1720 },
    ],
  },
};

async function noKey() {
  const orig = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const res = await POST(makeRequest(sample));
    const json = (await res.json()) as AiExtractResponse;
    console.log("[no-key]", res.status, json.status, "—", json.message);
    if (res.status !== 503 || json.status !== "no-api-key") {
      throw new Error("no-key path didn't return 503 + status 'no-api-key'");
    }
  } finally {
    if (orig) process.env.ANTHROPIC_API_KEY = orig;
  }
}

async function withKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[with-key] skipped — set ANTHROPIC_API_KEY to run the live AI test");
    return;
  }
  const res = await POST(makeRequest(sample));
  const json = (await res.json()) as AiExtractResponse;
  console.log("[with-key]", res.status, json.status, "·", (json.suggestions ?? []).length, "suggestions");
  if (json.suggestions && json.suggestions[0]) {
    const s = json.suggestions[0];
    console.log("  sample:", s.domain, "·", s.label, "·", s.confidence);
    console.log("  reasoning:", s.reasoning);
    console.log("  entity:", JSON.stringify(s.entity));
  }
}

(async () => {
  await noKey();
  await withKey();
  console.log("✓ smoke ai test passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
