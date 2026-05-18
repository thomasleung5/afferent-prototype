import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are extracting non-labor operating expenditure line items from a municipal budget document. The document may be a budget book, an ERP/GL export, a fund-detail report, or a department appendix inside a larger fee study — only the line-item rows matter.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip narrative chapters, methodology sections, executive summaries, recommendation tables, and revenue/fee tables
- Focus exclusively on sections titled "Operating Expenditures", "Non-Personnel Budget", "Services & Supplies", "Materials & Services", "Operating Budget Detail", "Expenditure Detail", or any tabular section that lists individual account-level expenditure lines with adopted/budgeted amounts
- Do not read or process narrative paragraphs — jump directly to the expenditure tables

Extract every non-labor expenditure line item you find in those sections and return ONLY this JSON, no prose:

{
  "items": [
    { "code": "53120", "dept": "PLAN", "category": "Professional services", "line": "Consulting Services", "amount": 620000, "include": true, "confidence": "high" },
    { "code": "54330", "dept": "BLDG", "category": "Software & subscriptions", "line": "Software Subscriptions", "amount": 84000, "include": true, "confidence": "high" },
    { "code": "55210", "dept": "ENG", "category": "Vehicles & equipment", "line": "Field Equipment", "amount": 42000, "include": true, "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), "ENG" (Engineering), or "SHARED:CDS" (shared Community Development Services)
- ONLY include rows for those four departments. SKIP every row whose department is anything else — Public Works, Parks & Recreation, Police, Fire, Finance, City Manager, City Clerk, Admin, Library, Recreation, Streets, Water, Sewer, etc.
- SKIP all personnel / payroll lines entirely — anything that pays a person. This includes (but is not limited to) regular salaries, overtime, part-time wages, retirement contributions, PERS, OPEB, health insurance, dental, vision, payroll taxes, Medicare, FICA, workers comp, life insurance, and any account whose category is "Salaries", "Salaries & Benefits", "Personnel", "Wages", "Compensation", or whose account number falls in a personnel range (commonly 511xx–512xx, but trust the category label too). These belong on the salary roster, NOT on operating.
- category must be exactly one of these nine values — pick the closest match:
  * "Software & subscriptions" — software licenses, SaaS, cloud services, IT subscriptions, technology platforms
  * "Professional services" — consulting, contract services, legal (non-noticing), plan review services, contract inspection, contract engineering, outside professional services
  * "Training & travel" — conferences, training, certifications, travel, mileage, per diem
  * "Office & supplies" — office supplies, postage, printing, general operating supplies (non-equipment)
  * "Memberships & dues" — professional memberships, association dues, subscriptions to publications
  * "Vehicles & equipment" — vehicles, fleet, field equipment, inspection equipment, tools, fuel, vehicle maintenance, equipment maintenance
  * "Legal noticing" — public hearing notices, legal advertising, publication of notices
  * "Capital outlay" — one-time capital purchases, capital improvements, equipment purchases capitalized as assets
  * "Other" — anything that doesn't clearly fit above (utilities, rent, telephone, generic maintenance of facilities, etc.)
- ERP-style category labels translate as follows: "Technology" → "Software & subscriptions"; "Maintenance" of fleet/vehicles → "Vehicles & equipment"; "Maintenance" of buildings/facilities → "Other"; "Utilities" → "Other"; "Operating Supplies" → "Office & supplies" unless the line clearly describes equipment (then "Vehicles & equipment"); "Programming" → "Software & subscriptions"; "Contract Services" / "Professional Services" → "Professional services"
- amount must be a plain JavaScript number — STRIP any "$" sign, commas, and whitespace ("$620,000" → 620000). Drop any text-formatted ranges, percentages, or footnote markers.
- code is the GL account number / object code if present (e.g. "53120"); omit the field if the document has no account numbers
- line is the human-readable description of the expenditure (e.g. "Consulting Services", "Software Subscriptions")
- include defaults to true. Set to false ONLY when the document explicitly excludes the line from operating cost (one-time capital outlay flagged as non-recurring, reimbursed-by-applicant pass-throughs, interfund transfers, debt service). When you set include=false, add a short excludeReason like "one-time capital", "reimbursed pass-through", or "transfer".
- confidence: "high" if dept, category, line, and amount are all clear from the document; "low" if any are ambiguous, estimated, or inferred from context
- Skip totals, subtotals, grand totals, "Department Total" rows, fund totals, and summary rows
- Skip blank rows, header rows, and rows where amount is zero or missing
- Use the exact line description as written in the document
- Return only the JSON object, nothing else`;

interface OperatingRow {
  code?: string;
  dept: string;
  category: string;
  line: string;
  amount: number;
  include?: boolean;
  excludeReason?: string;
  confidence: "high" | "low";
}

interface ParseOperatingResponse {
  ok: boolean;
  items?: OperatingRow[];
  message?: string;
}

function json(body: ParseOperatingResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function handleAiParseOperating(req: Request): Promise<Response> {
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

  console.log(`[ai-parse-operating] Received ${fileName} (${fileSizeKb} KB) — sending to ${MODEL}…`);
  const t0 = Date.now();

  const client = new Anthropic({ apiKey, timeout: 10 * 60 * 1000 });
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
    console.log(`[ai-parse-operating] Response received in ${elapsed}s (${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[ai-parse-operating] No JSON in response. Raw: ${text.slice(0, 300)}`);
      return json({ ok: false, message: `Model returned no JSON. Raw: ${text.slice(0, 200)}` }, { status: 502 });
    }

    let items: OperatingRow[];
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { items?: OperatingRow[] };
      if (!Array.isArray(parsed.items)) throw new Error("no items array");
      items = parsed.items;
    } catch {
      const partialMatches = jsonMatch[0].matchAll(/\{[^{}]*"line"\s*:[^{}]*\}/g);
      items = [];
      for (const m of partialMatches) {
        try { items.push(JSON.parse(m[0]) as OperatingRow); } catch { /* skip malformed */ }
      }
      if (items.length === 0) {
        return json({ ok: false, message: "Response was truncated and no complete operating rows could be recovered. Try a shorter document." }, { status: 502 });
      }
      console.warn(`[ai-parse-operating] Response truncated — recovered ${items.length} partial rows`);
    }

    console.log(`[ai-parse-operating] Parsed ${items.length} operating rows from ${fileName}`);
    return json({ ok: true, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    console.error(`[ai-parse-operating] Error: ${message}`);
    return json({ ok: false, message }, { status: 502 });
  }
}
