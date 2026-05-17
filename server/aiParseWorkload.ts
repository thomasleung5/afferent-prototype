import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are extracting service-volume / workload counts from a municipal document. The document may be an annual report, a permit-volume table, an application-count summary, a year-over-year activity table, or a workload appendix inside a fee study — only the rows that COUNT units of service activity matter.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip narrative chapters, methodology sections, executive summaries, recommendation tables, financial tables, fee tables, revenue summaries, and rate-derivation tables
- Focus exclusively on sections titled "Workload", "Service Volumes", "Annual Activity", "Permit Volume", "Application Counts", "Transactions", "Activity Report", "Year-over-Year Activity", appendices labeled "Workload" or "Activity", or any tabular section that lists individual services with annual unit counts

Extract every row that reports a count of services performed and return ONLY this JSON, no prose:

{
  "items": [
    { "name": "Building Permit — Single-Family Residential", "dept": "BLDG", "prior": 142, "current": 165, "unit": "permits", "confidence": "high" },
    { "name": "Conditional Use Permit", "dept": "PLAN", "prior": null, "current": 12, "unit": "applications", "confidence": "high" },
    { "name": "Encroachment Permit", "dept": "ENG", "prior": 158, "current": 169, "unit": "permits", "confidence": "low" }
  ]
}

Rules:
- dept must be exactly "PLAN" (Planning), "BLDG" (Building/Inspection), or "ENG" (Engineering)
- ONLY include rows whose department is PLAN, BLDG, or ENG. SKIP every row for Public Works, Parks & Recreation, Police, Fire, Finance, City Manager, City Clerk, Admin, Library, Recreation, Streets, Water, Sewer, etc.
- name must be the EXACT service description as written in the document. Do NOT abbreviate, expand, paraphrase, or reword — downstream client-side matching depends on the name matching the catalog character-for-character.
- prior is the prior-year (or baseline) volume as a plain integer with commas stripped ("1,245" → 1245). If only one year is reported, set prior to null.
- current is the current-year (or most-recent) volume as a plain integer with commas stripped. If only one year is reported, populate current and leave prior null.
- SKIP rows whose volume cell is a range (e.g. "12-20"), a percentage ("8.4%"), a year-over-year delta ("+12"), text ("Various"), or non-numeric. Skip rows whose volume is zero or missing.
- unit is a short noun describing what is being counted: "permits", "applications", "reviews", "inspections", "hearings", "transactions", "encroachments", etc. Default to "units" only when the document does not state one.
- confidence: "high" only when name, dept, and at least one of prior/current are unambiguous; "low" if any field is ambiguous, estimated, inferred from context, or footnoted
- SKIP totals, subtotals, grand totals, "Department Total" rows, fund totals, percent-change rows, header rows, and blank rows
- SKIP narrative-style rows (single sentences without a tabular count) and rows that describe a service without giving a count
- Return only the JSON object, nothing else`;

interface WorkloadItem {
  name: string;
  dept: string;
  prior?: number | null;
  current?: number | null;
  unit?: string;
  confidence: "high" | "low";
}

interface ParseWorkloadResponse {
  ok: boolean;
  items?: WorkloadItem[];
  message?: string;
}

function json(body: ParseWorkloadResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function handleAiParseWorkload(req: Request): Promise<Response> {
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

  console.log(`[ai-parse-workload] Received ${fileName} (${fileSizeKb} KB) — sending to ${MODEL}…`);
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
    console.log(`[ai-parse-workload] Response received in ${elapsed}s (${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[ai-parse-workload] No JSON in response. Raw: ${text.slice(0, 300)}`);
      return json({ ok: false, message: `Model returned no JSON. Raw: ${text.slice(0, 200)}` }, { status: 502 });
    }

    let items: WorkloadItem[];
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { items?: WorkloadItem[] };
      if (!Array.isArray(parsed.items)) throw new Error("no items array");
      items = parsed.items;
    } catch {
      const partialMatches = jsonMatch[0].matchAll(/\{[^{}]*"name"\s*:[^{}]*\}/g);
      items = [];
      for (const m of partialMatches) {
        try { items.push(JSON.parse(m[0]) as WorkloadItem); } catch { /* skip malformed */ }
      }
      if (items.length === 0) {
        return json({ ok: false, message: "Response was truncated and no complete workload rows could be recovered. Try a shorter document." }, { status: 502 });
      }
      console.warn(`[ai-parse-workload] Response truncated — recovered ${items.length} partial rows`);
    }

    console.log(`[ai-parse-workload] Parsed ${items.length} workload rows from ${fileName}`);
    return json({ ok: true, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    console.error(`[ai-parse-workload] Error: ${message}`);
    return json({ ok: false, message }, { status: 502 });
  }
}
