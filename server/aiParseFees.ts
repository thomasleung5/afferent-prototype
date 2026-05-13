import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are parsing a municipal fee schedule PDF. Extract every fee line item and return ONLY this JSON, no prose:

{
  "fees": [
    { "name": "Site Development Hearing Review", "dept": "PLAN", "fee": 4160, "peer": 13800, "target": 100, "confidence": "high" },
    { "name": "Building Permit — New SFR", "dept": "BLDG", "fee": 13500, "confidence": "high" },
    { "name": "Erosion Control Inspections", "dept": "ENG", "fee": 210, "peer": 640, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering/Public Works)
- fee is the current adopted fee as a plain number — no $ or commas
- peer is the peer city comparison fee if shown, otherwise omit the field
- target is recovery % as 0–100, omit if not stated
- confidence: "high" if certain, "low" if dept or amount is ambiguous
- Skip section headers, subtotals, grand totals, notes, and blank rows
- Use the exact fee name as written in the document
- Return only the JSON object, nothing else`;

interface FeeRow {
  name: string;
  dept: string;
  fee: number;
  peer?: number;
  target?: number;
  confidence: "high" | "low";
}

interface ParseFeesResponse {
  ok: boolean;
  fees?: FeeRow[];
  message?: string;
}

function json(body: ParseFeesResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function handleAiParseFees(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({
      ok: false,
      message: "AI parsing is not configured. Set ANTHROPIC_API_KEY in .env.local to enable it.",
    }, { status: 503 });
  }

  let pdfBase64: string;
  let fileName: string;
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return json({ ok: false, message: "No file provided." }, { status: 400 });
    fileName = file.name;
    const buf = await file.arrayBuffer();
    pdfBase64 = Buffer.from(buf).toString("base64");
  } catch {
    return json({ ok: false, message: "Could not read uploaded file." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [{
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        }],
      }],
    });

    const text = response.content.find((c) => c.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return json({ ok: false, message: `Model returned no JSON. Raw: ${text.slice(0, 200)}` }, { status: 502 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { fees?: FeeRow[] };
    if (!Array.isArray(parsed.fees)) {
      return json({ ok: false, message: "Model returned unexpected structure." }, { status: 502 });
    }

    console.log(`[ai-parse-fees] ${fileName} → ${parsed.fees.length} rows`);
    return json({ ok: true, fees: parsed.fees });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    return json({ ok: false, message }, { status: 502 });
  }
}
