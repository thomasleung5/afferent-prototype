import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const BASE_SYSTEM = `You are parsing a municipal cost-of-service study or fee study PDF. Extract every service line item and return ONLY this JSON, no prose:

{
  "services": [
    { "name": "Site Development Hearing Review", "dept": "PLAN", "hours": 3.5, "volume": 45, "fee": 4160, "target": 100, "confidence": "high" },
    { "name": "Building Permit — New SFR", "dept": "BLDG", "hours": 8.0, "volume": 120, "fee": 13500, "confidence": "high" },
    { "name": "Erosion Control Inspections", "dept": "ENG", "hours": 1.5, "volume": 80, "fee": 210, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering/Public Works)
- hours is staff hours per service occurrence (fully-burdened hours, not clock hours)
- volume is annual service count or permit count — plain number, no commas
- fee is the current adopted fee as a plain number — no $ or commas
- target is recovery % as 0–100 (e.g. 100 = full cost recovery), omit if not stated
- confidence: "high" if certain, "low" if dept, hours, or volume is ambiguous or estimated
- Skip section headers, subtotals, grand totals, notes, and blank rows
- If hours are not shown but a unit cost and FBHR are shown, compute hours = unit_cost / FBHR
- Return only the JSON object, nothing else`;

function buildSystem(catalogEntries: { name: string; dept: string }[]): string {
  if (catalogEntries.length === 0) return BASE_SYSTEM;
  const list = catalogEntries.map((e) => `  - ${e.name} (${e.dept})`).join("\n");
  return `${BASE_SYSTEM}

IMPORTANT — existing service catalog (you MUST use these exact names when there is a match):
${list}

When a row in the PDF clearly corresponds to a catalog entry, use the catalog name verbatim in your output even if the PDF spells it differently. Only use a name from the PDF directly when there is no reasonable catalog match.`;
}

interface ServiceRow {
  name: string;
  dept: string;
  hours: number;
  volume?: number;
  fee?: number;
  target?: number;
  confidence: "high" | "low";
}

interface ParseServicesResponse {
  ok: boolean;
  services?: ServiceRow[];
  message?: string;
}

function json(body: ParseServicesResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function handleAiParseServices(req: Request): Promise<Response> {
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
  let catalog: { name: string; dept: string }[] = [];
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return json({ ok: false, message: "No file provided." }, { status: 400 });
    fileName = file.name;
    fileSizeKb = Math.round(file.size / 1024);
    const buf = await file.arrayBuffer();
    pdfBase64 = Buffer.from(buf).toString("base64");
    const catalogRaw = form.get("catalog");
    if (typeof catalogRaw === "string" && catalogRaw) {
      catalog = JSON.parse(catalogRaw) as { name: string; dept: string }[];
    }
  } catch {
    return json({ ok: false, message: "Could not read uploaded file." }, { status: 400 });
  }

  console.log(`[ai-parse-services] Received ${fileName} (${fileSizeKb} KB), catalog: ${catalog.length} entries — sending to ${MODEL}…`);
  const t0 = Date.now();

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: buildSystem(catalog),
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
    console.log(`[ai-parse-services] Response received in ${elapsed}s (${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[ai-parse-services] No JSON in response. Raw: ${text.slice(0, 300)}`);
      return json({ ok: false, message: `Model returned no JSON. Raw: ${text.slice(0, 200)}` }, { status: 502 });
    }

    let services: ServiceRow[];
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { services?: ServiceRow[] };
      if (!Array.isArray(parsed.services)) throw new Error("no services array");
      services = parsed.services;
    } catch {
      const partialMatches = jsonMatch[0].matchAll(/\{[^{}]*"name"\s*:[^{}]*\}/g);
      services = [];
      for (const m of partialMatches) {
        try { services.push(JSON.parse(m[0]) as ServiceRow); } catch { /* skip malformed */ }
      }
      if (services.length === 0) {
        return json({ ok: false, message: "Response was truncated and no complete service rows could be recovered. Try a shorter document." }, { status: 502 });
      }
      console.warn(`[ai-parse-services] Response truncated — recovered ${services.length} partial rows`);
    }

    console.log(`[ai-parse-services] Parsed ${services.length} service rows from ${fileName}`);
    return json({ ok: true, services });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    console.error(`[ai-parse-services] Error: ${message}`);
    return json({ ok: false, message }, { status: 502 });
  }
}
