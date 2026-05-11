import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { AiExtractRequest, AiExtractResponse, AiSuggestion } from "@/lib/ai/types";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a municipal finance analyst's assistant. The user has uploaded a
city document (budget PDF, fee schedule, salary roster, workload export, CAP
inventory) and the deterministic local extractor failed to map certain rows.

Your job is to interpret those raw rows and propose a structured mapping for
each into the user's existing fee study model. You map rows into ONE of these
domains:

- positions  (Direct Labor): { title, dept, fte, salary, benefits, hours }
  dept is one of "PLAN" (Planning), "BLDG" (Building), "ENG" (Engineering).

- operating  (Operating costs): { code, line, dept, category, amount, include }
  dept is "PLAN" | "BLDG" | "ENG" | "SHARED:CDS".
  category is one of: "Software & subscriptions", "Professional services",
    "Training & travel", "Office & supplies", "Memberships & dues",
    "Vehicles & equipment", "Legal noticing", "Capital outlay", "Other".

- services   (Service catalog): { name, dept, hours, volume, fee, target }

- workload   (Annual volume per service): { name, current, prior, unit }
  Only suggest rows whose 'name' matches a service in the existing catalog.

- cap        (Cost allocation pools): { center, pool, amount, basis, recoverability }

- fees       (Fee schedule patch): { name, dept, fee, target, peer }

For every suggested row, return:
- domain: which tab it belongs to
- entity: structured fields per the schema above
- confidence: "high" / "med" / "low"
- reasoning: one short sentence on why

Be conservative. If a row is genuinely ambiguous (e.g. you can't tell
Planning from Building from the line description), mark it "low" and explain.
Never invent a department code that's not in the lists above. Never
hallucinate dollar amounts that aren't in the row.

Match service-related rows to the existing service names provided.

Return ALL suggestions via the suggest_mappings tool. Do not write prose
outside the tool call.`;

const TOOL = {
  name: "suggest_mappings",
  description: "Returns structured mappings for every raw row sent in the user message.",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        description: "One entry per input row that you can confidently interpret. Skip rows you cannot interpret at all.",
        items: {
          type: "object",
          properties: {
            sourceIndex: { type: "number", description: "The 'index' from the input row." },
            domain: {
              type: "string",
              enum: ["positions", "operating", "services", "workload", "cap", "fees"],
            },
            label: { type: "string", description: "Short human label for the row (position title, fee name, etc.)." },
            entity: {
              type: "object",
              description: "Domain-specific fields. See system prompt for each domain's schema.",
              additionalProperties: true,
            },
            confidence: { type: "string", enum: ["high", "med", "low"] },
            reasoning: { type: "string", description: "One short sentence explaining the mapping." },
          },
          required: ["sourceIndex", "domain", "label", "entity", "confidence", "reasoning"],
        },
      },
    },
    required: ["suggestions"],
  },
};

interface RawSuggestion {
  sourceIndex: number;
  domain: AiSuggestion["domain"];
  label: string;
  entity: Record<string, string | number | boolean | null>;
  confidence: AiSuggestion["confidence"];
  reasoning: string;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json<AiExtractResponse>({
      ok: false,
      status: "no-api-key",
      message: "AI extraction is not configured. Set ANTHROPIC_API_KEY in .env.local to enable it.",
    }, { status: 503 });
  }

  let body: AiExtractRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<AiExtractResponse>({
      ok: false,
      status: "model-error",
      message: "Request body was not valid JSON.",
    }, { status: 400 });
  }

  if (!body.rows || body.rows.length === 0) {
    return NextResponse.json<AiExtractResponse>({
      ok: true, status: "no-suggestions", suggestions: [],
    });
  }

  const userPrompt = buildUserPrompt(body);
  const client = new Anthropic({ apiKey });

  try {
    const result = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "suggest_mappings" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = result.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json<AiExtractResponse>({
        ok: false, status: "model-error",
        message: "Model returned no structured suggestions.",
      }, { status: 502 });
    }

    const raw = toolUse.input as { suggestions?: RawSuggestion[] };
    const suggestions: AiSuggestion[] = (raw.suggestions ?? []).map((s, i) => {
      const sourceRow = body.rows.find((r) => r.index === s.sourceIndex) ?? body.rows[i];
      return {
        id: `ai-${Date.now()}-${i}`,
        sourceIndex: sourceRow?.index ?? s.sourceIndex,
        domain: s.domain,
        label: s.label,
        reasoning: s.reasoning,
        confidence: s.confidence,
        entity: s.entity,
        lineage: sourceRow?.lineage ?? {
          file: "unknown", confidence: "review",
          importedAt: new Date().toISOString(),
        },
      };
    });

    return NextResponse.json<AiExtractResponse>({
      ok: true, status: "ok", suggestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    return NextResponse.json<AiExtractResponse>({
      ok: false, status: "model-error", message,
    }, { status: 502 });
  }
}

function buildUserPrompt(body: AiExtractRequest): string {
  const headerLine = body.headers.length > 0
    ? `Source columns: ${body.headers.join(" · ")}`
    : "No source columns available (raw text or unknown layout).";

  const examples = body.examples?.sample.length
    ? `\nExisting rows in the ${body.examples.domain} tab (for reference shape):\n` +
      body.examples.sample.slice(0, 4).map((r, i) => `  ${i + 1}. ${JSON.stringify(r)}`).join("\n")
    : "";

  const rowDump = body.rows.map((r) => {
    const cells = r.cells.map((c) => c == null ? "" : String(c)).join(" | ");
    const src = r.lineage.sheet
      ? `${r.lineage.file} · ${r.lineage.sheet} · row ${r.lineage.row}`
      : r.lineage.page != null
        ? `${r.lineage.file} · p.${r.lineage.page}`
        : r.lineage.file;
    return `[index ${r.index}] (${r.reason}) ${cells}\n  source: ${src}`;
  }).join("\n");

  return [
    `Target domain hint: ${body.domain}`,
    headerLine,
    examples,
    "",
    "Unmapped rows (please interpret each):",
    rowDump,
    "",
    "For each row, propose the best mapping into the fee study model. Return your answer via the suggest_mappings tool.",
  ].join("\n");
}
