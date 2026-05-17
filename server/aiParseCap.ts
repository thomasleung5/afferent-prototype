import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are extracting Cost Allocation Plan (CAP) data from a municipal document. The document may contain any combination of three sections: (1) cost centers with their source-department total budgets, (2) the allocation-bases catalog with named denominators, and (3) cost pools that allocate a slice of a center's budget to receiving departments.

IMPORTANT — if the document is a comprehensive fee study, annual report, or budget book:
- Skip narrative chapters, methodology preambles, executive summaries, recommendation tables, fee tables, and rate-derivation tables
- Focus exclusively on sections titled "Cost Allocation Plan", "Indirect Cost Allocation", "Cost Centers", "Allocation Bases", "Cost Pools", "CAP Inventory", "Indirect Cost Pool Detail", or any tabular section that lists cost centers / allocation bases / cost pools with allocation amounts

FIRST, detect which of the three sections are present in the document. Populate ONLY the arrays whose section is present. Omit arrays (or return them empty) for sections the document does not contain.

Return ONLY this JSON, no prose:

{
  "centers": [
    { "name": "City Manager", "totalCost": 1100000, "confidence": "high" },
    { "name": "Finance & Administrative Services", "totalCost": 1218000, "confidence": "high" }
  ],
  "bases": [
    { "name": "Budgeted FTE", "source": "HRIS budget worksheet", "methodologyNote": "Authorized full-time-equivalent positions across the budget year.", "driverKey": "FTE", "confidence": "high" },
    { "name": "AP invoices",  "source": "Finance ledger",         "driverKey": "EXPEND", "confidence": "high" },
    { "name": "Direct to Parks", "source": "Manual assignment",   "driverKey": "DIRECT", "directTo": "PARKS", "confidence": "low" }
  ],
  "pools": [
    { "center": "City Manager", "pool": "Human Resources", "allocationPercent": 38.62, "amount": 424820, "eligiblePercent": 100, "basis": "Budgeted FTE", "receiving": "All depts", "recoverability": "Fully recoverable", "confidence": "high" },
    { "center": "City Attorney", "pool": "Contract review", "allocationPercent": 12.5, "amount": 22500, "eligiblePercent": 100, "basis": "Contract count", "receiving": "PLAN, BLDG, ENG", "recoverability": "Fully recoverable", "confidence": "high" }
  ]
}

================================================================
SECTION 1 — Cost centers
================================================================

Extract every named INDIRECT cost center with its total dollar cost — the "100%" denominator each pool's allocationPercent is measured against.

- name: the human-readable center name, exactly as written. Common indirect centers include City Manager, City Clerk, Finance & Administrative Services (or Finance), Building Use, Equipment Use, City Attorney, Insurance, Committees, City Council — but accept any name the document uses for an indirect cost center.
- totalCost: the source-department's full budgeted cost for the year — a plain number, NO $ sign, NO commas, NO units. (e.g. "$1,100,000" → 1100000.)
- SKIP pool-level subtotals, grand totals, fund totals, and direct departmental operating budgets (Planning, Building, Engineering, Public Works, Parks, Police, Fire). Those are NOT cost centers — they are receivers, not allocators.
- SKIP rows whose totalCost is zero, missing, or non-numeric.
- confidence: "high" if name and totalCost are unambiguous, "low" otherwise.

================================================================
SECTION 2 — Allocation bases
================================================================

Extract the catalog of named denominators (drivers) the document defines.

- name: the basis name as written (e.g. "Budgeted FTE", "AP invoices", "Agenda item count", "Square footage", "PRA request count"). Use these canonical names when the document's wording matches them; otherwise keep the document's wording verbatim.
- source: the underlying data source quoted in the document (e.g. "HRIS budget worksheet", "Clerk PRA log", "Facilities inventory", "Finance ledger"). If the document does not state a source, infer a short label like "Document".
- methodologyNote: the longer methodology / explanation paragraph if the document provides one. Omit the field if there is no extended note.
- driverKey: the modeling-meaningful classification. MUST be exactly one of:
  * "FTE"      — full-time-equivalent counts (budgeted, actual, time-study %, direct-labor hours)
  * "EXPEND"   — operating expenditures, AP invoices, permit volume, population, anything denominated in spending
  * "EXPEND_X" — operating expenditures excluding development services / fee-modeled depts
  * "PAYROLL"  — payroll transactions, salaries (compensation dollars treated as a count)
  * "ACCT"     — accounting transactions, GL line counts
  * "AGENDA"   — Council / Commission agenda item count
  * "PRA"      — Public Records Act request count
  * "CONTRACT" — number of executed contracts / procurement actions
  * "SQFT"     — square footage occupied
  * "VEHICLE"  — vehicle / fleet depreciation
  * "COMMITS"  — number of standing committees supported
  * "DIRECT"   — a one-to-one direct assignment (the pool routes entirely to one department, bypassing the step-down)
  * "OTHER"    — the basis does not match any key above. Use ONLY as a last resort (see routing rule below).
- driverKey routing: classify by the UNDERLYING DRIVER CONCEPT, not the wording. A novel name that clearly describes a known concept still gets the matching key — e.g. "# of FTE", "Budgeted FTE", and "FY19-20 Personnel Allocations" are all "FTE"; "# of Transactions excluding payroll" is "ACCT"; "Budgeted Expenditures per Fund" is "EXPEND". Use "OTHER" ONLY when the underlying driver is genuinely outside every named key (e.g. "# of Work Stations", "Council Chamber Breakout") — not merely because the wording is unfamiliar. Whenever driverKey is "OTHER", set confidence to "low" so the basis is surfaced for review. Do NOT invent new key values; "OTHER" is the only permitted overflow.
- directTo: ONLY meaningful when driverKey === "DIRECT". The single receiving department's MatrixDeptCode — one of "BLDG_USE", "EQUIP", "COUNCIL", "CMGR", "CLERK", "FAS", "ATTY", "INS", "CMTE", "PLAN", "BLDG", "ENG", "PW", "PARKS", "PD", "FIRE". Omit when driverKey !== "DIRECT".
- SKIP duplicate listings, header rows, and explanatory prose paragraphs that aren't structured basis definitions.
- confidence: "high" if name, source, and driverKey are unambiguous from the document; "low" if driverKey is "OTHER" or any field is uncertain.

================================================================
SECTION 3 — Cost pools
================================================================

Extract every cost-pool row that allocates a slice of an indirect center's budget. A typical row looks like "City Manager · Human Resources — 38.62% — $424,820 — Budgeted FTE".

- center: the cost-center name this pool belongs to (matches a Section 1 center name).
- pool: the human-readable pool / function name (e.g. "Human Resources", "Risk Management", "Contract Review", "Records").
- allocationPercent: the percentage share of the center this pool claims. Range 0–100 as a plain number, NO % sign. (e.g. "38.62%" → 38.62.)
- amount: the dollar amount allocated by this pool. Plain number, NO $ sign, NO commas. (e.g. "$424,820" → 424820.)
- eligiblePercent: the fee-eligible share, 0–100. DEFAULT to 100 (fully fee-eligible). Set lower ONLY when the document explicitly excludes part of the pool from fee-supported allocations. NEVER set above 100.
- basis: the allocation basis name. MUST be either a name from Section 2 of the same document, or one of the canonical seed names ("Budgeted FTE", "Actual FTE", "Salaries", "Payroll transactions", "AP invoices", "Agenda item count", "Contract count", "Square footage", "Direct labor hours", "Permit volume", "Operating expenditures", "Accounting transactions", "Time study %", "Population", "Vehicle depreciation", "Operating expenditures (excl. development)", "PRA request count", "Number of committees", "Direct allocation"). If the document uses a wording that clearly matches one of these, use the canonical name.
- receiving: a short label describing which departments receive this pool (e.g. "All depts", "PLAN, BLDG, ENG", "Multiple departments"). Omit if not stated.
- recoverability: a short policy note quoting the document (e.g. "Fully recoverable", "Partially recoverable", "Excluded — General Fund subsidy"). Omit if not stated.
- SKIP center subtotals, "Total" / "Grand Total" rows, narrative footnotes, blank rows, and any row whose center or pool field is missing.
- SKIP pool rows whose amount is zero or missing.
- confidence: "high" if all required fields (center, pool, allocationPercent, amount, basis) are unambiguous, "low" otherwise.

================================================================
General rules
================================================================

- All monetary values are plain numbers — strip $, commas, whitespace, units.
- All percentages are plain numbers (0–100) — strip the % sign.
- Use the exact names / pool labels / basis names as written in the document.
- Return only the JSON object. No prose, no markdown, no explanation.`;

interface CenterRow {
  name: string;
  totalCost: number;
  confidence: "high" | "low";
}

interface BasisRow {
  name: string;
  source: string;
  methodologyNote?: string;
  driverKey: string;
  directTo?: string;
  confidence: "high" | "low";
}

interface PoolRow {
  center: string;
  pool: string;
  allocationPercent: number;
  amount: number;
  eligiblePercent?: number;
  basis: string;
  receiving?: string;
  recoverability?: string;
  confidence: "high" | "low";
}

interface ParseCapResponse {
  ok: boolean;
  centers?: CenterRow[];
  bases?: BasisRow[];
  pools?: PoolRow[];
  message?: string;
}

function json(body: ParseCapResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function handleAiParseCap(req: Request): Promise<Response> {
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

  console.log(`[ai-parse-cap] Received ${fileName} (${fileSizeKb} KB) — sending to ${MODEL}…`);
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
    console.log(`[ai-parse-cap] Response received in ${elapsed}s (${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens)`);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[ai-parse-cap] No JSON in response. Raw: ${text.slice(0, 300)}`);
      return json({ ok: false, message: `Model returned no JSON. Raw: ${text.slice(0, 200)}` }, { status: 502 });
    }

    let centers: CenterRow[] = [];
    let bases: BasisRow[] = [];
    let pools: PoolRow[] = [];

    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        centers?: CenterRow[]; bases?: BasisRow[]; pools?: PoolRow[];
      };
      if (Array.isArray(parsed.centers)) centers = parsed.centers;
      if (Array.isArray(parsed.bases))   bases   = parsed.bases;
      if (Array.isArray(parsed.pools))   pools   = parsed.pools;
    } catch {
      // Truncated JSON — recover what we can section-by-section. Each row
      // shape carries a distinctive key, so we regex on that key per section.
      const raw = jsonMatch[0];
      const recover = <T>(re: RegExp): T[] => {
        const out: T[] = [];
        for (const m of raw.matchAll(re)) {
          try { out.push(JSON.parse(m[0]) as T); } catch { /* skip malformed */ }
        }
        return out;
      };
      centers = recover<CenterRow>(/\{[^{}]*"totalCost"\s*:[^{}]*\}/g);
      bases   = recover<BasisRow>(/\{[^{}]*"driverKey"\s*:[^{}]*\}/g);
      pools   = recover<PoolRow>(/\{[^{}]*"pool"\s*:[^{}]*\}/g);
      if (centers.length + bases.length + pools.length === 0) {
        return json({ ok: false, message: "Response was truncated and no complete CAP rows could be recovered. Try a shorter document or split it by section." }, { status: 502 });
      }
      console.warn(`[ai-parse-cap] Response truncated — recovered ${centers.length} centers / ${bases.length} bases / ${pools.length} pools`);
    }

    console.log(`[ai-parse-cap] Parsed ${centers.length} centers, ${bases.length} bases, ${pools.length} pools from ${fileName}`);
    return json({ ok: true, centers, bases, pools });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    console.error(`[ai-parse-cap] Error: ${message}`);
    return json({ ok: false, message }, { status: 502 });
  }
}
