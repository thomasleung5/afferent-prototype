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

  console.log(`[ai-parse-fees] Received ${fileName} (${fileSizeKb} KB) — sending to ${MODEL}…`);
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
    console.log(`[ai-parse-fees] Response received in ${elapsed}s (${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[ai-parse-fees] No JSON in response. Raw: ${text.slice(0, 300)}`);
      return json({ ok: false, message: `Model returned no JSON. Raw: ${text.slice(0, 200)}` }, { status: 502 });
    }

    let fees: FeeRow[];
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { fees?: FeeRow[] };
      if (!Array.isArray(parsed.fees)) throw new Error("no fees array");
      fees = parsed.fees;
    } catch {
      // Output was truncated — extract every complete fee object from the partial JSON
      const partialMatches = jsonMatch[0].matchAll(/\{[^{}]*"name"\s*:[^{}]*\}/g);
      fees = [];
      for (const m of partialMatches) {
        try { fees.push(JSON.parse(m[0]) as FeeRow); } catch { /* skip malformed */ }
      }
      if (fees.length === 0) {
        return json({ ok: false, message: "Response was truncated and no complete fee rows could be recovered. Try a shorter document." }, { status: 502 });
      }
      console.warn(`[ai-parse-fees] Response truncated — recovered ${fees.length} partial rows`);
    }

    console.log(`[ai-parse-fees] Parsed ${fees.length} fee rows from ${fileName}`);
    return json({ ok: true, fees });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    console.error(`[ai-parse-fees] Error: ${message}`);
    return json({ ok: false, message }, { status: 502 });
  }
}
