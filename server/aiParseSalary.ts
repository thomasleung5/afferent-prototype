import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are parsing a municipal salary roster or personnel budget PDF. Extract every position line item and return ONLY this JSON, no prose:

{
  "positions": [
    { "title": "Senior Planner", "dept": "PLAN", "fte": 0.80, "salary": 95000, "benefits": 38000, "hours": 1720, "confidence": "high" },
    { "title": "Building Inspector II", "dept": "BLDG", "fte": 1.00, "salary": 82000, "benefits": 32800, "hours": 1720, "confidence": "high" },
    { "title": "Civil Engineer", "dept": "ENG", "fte": 0.50, "salary": 110000, "benefits": 44000, "hours": 1720, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering/Public Works)
- fte is the full-time equivalent allocation to fee services (0.0–1.0) — if not stated assume 1.0
- salary is the annual base salary as a plain number — no $ or commas
- benefits is the annual benefits cost as a plain number — if shown as a % of salary, compute the dollar amount
- hours is productive hours per year per FTE — default to 1720 if not stated in the document
- confidence: "high" if title, dept, salary, and benefits are all clear; "low" if any are ambiguous or estimated
- Skip totals, subtotals, vacant positions, and summary rows
- Use the exact position title as written in the document
- Return only the JSON object, nothing else`;

interface PositionRow {
  title: string;
  dept: string;
  fte: number;
  salary: number;
  benefits: number;
  hours: number;
  confidence: "high" | "low";
}

interface ParseSalaryResponse {
  ok: boolean;
  positions?: PositionRow[];
  message?: string;
}

function json(body: ParseSalaryResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function handleAiParseSalary(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({
      ok: false,
      message: "AI parsing is not configured. Set ANTHROPIC_API_KEY in .env.local to enable it.",
    }, { status: 503 });
  }

  let pdfBase64: string;
  let fileName: string;
  let fileSizeKb: number;
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return json({ ok: false, message: "No file provided." }, { status: 400 });
    fileName = file.name;
    fileSizeKb = Math.round(file.size / 1024);
    const buf = await file.arrayBuffer();
    pdfBase64 = Buffer.from(buf).toString("base64");
  } catch {
    return json({ ok: false, message: "Could not read uploaded file." }, { status: 400 });
  }

  console.log(`[ai-parse-salary] Received ${fileName} (${fileSizeKb} KB) — sending to ${MODEL}…`);
  const t0 = Date.now();

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [{
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        }],
      }],
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const text = response.content.find((c) => c.type === "text")?.text ?? "";
    console.log(`[ai-parse-salary] Response received in ${elapsed}s (${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[ai-parse-salary] No JSON in response. Raw: ${text.slice(0, 300)}`);
      return json({ ok: false, message: `Model returned no JSON. Raw: ${text.slice(0, 200)}` }, { status: 502 });
    }

    let positions: PositionRow[];
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { positions?: PositionRow[] };
      if (!Array.isArray(parsed.positions)) throw new Error("no positions array");
      positions = parsed.positions;
    } catch {
      const partialMatches = jsonMatch[0].matchAll(/\{[^{}]*"title"\s*:[^{}]*\}/g);
      positions = [];
      for (const m of partialMatches) {
        try { positions.push(JSON.parse(m[0]) as PositionRow); } catch { /* skip malformed */ }
      }
      if (positions.length === 0) {
        return json({ ok: false, message: "Response was truncated and no complete position rows could be recovered. Try a shorter document." }, { status: 502 });
      }
      console.warn(`[ai-parse-salary] Response truncated — recovered ${positions.length} partial rows`);
    }

    console.log(`[ai-parse-salary] Parsed ${positions.length} position rows from ${fileName}`);
    return json({ ok: true, positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    console.error(`[ai-parse-salary] Error: ${message}`);
    return json({ ok: false, message }, { status: 502 });
  }
}
