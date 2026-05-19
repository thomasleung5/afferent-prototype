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
    { "name": "City Manager", "glCode": "011-1200", "totalCost": 1100000, "confidence": "high" },
    { "name": "Finance & Administrative Services", "glCode": "011-1400", "totalCost": 1218000, "confidence": "high" }
  ],
  "bases": [
    { "name": "Budgeted FTE", "source": "HRIS budget worksheet", "methodologyNote": "Authorized full-time-equivalent positions across the budget year.", "driverKey": "FTE", "confidence": "high" },
    { "name": "AP invoices",  "source": "Finance ledger",         "driverKey": "EXPEND", "confidence": "high" },
    { "name": "Direct to Parks", "source": "Manual assignment",   "driverKey": "DIRECT", "directTo": "PARKS", "confidence": "low" }
  ],
  "pools": [
    {
      "center": "City Manager", "pool": "Human Resources",
      "allocationPercent": 38.62, "amount": 424820, "eligiblePercent": 100,
      "basis": "Budgeted FTE",
      "receivers": [
        { "dept": "Planning Admin", "glCode": "011-3100", "deptCode": "PLAN", "units": 2.92, "percent": 18.79, "amount": 22930, "firstAllocation": 19500, "secondAllocation": 3430, "total": 22930, "confidence": "high" },
        { "dept": "Building Admin", "glCode": "011-3200", "deptCode": "BLDG", "units": 2.81, "percent": 18.08, "amount": 22066, "firstAllocation": 18750, "secondAllocation": 3316, "total": 22066, "confidence": "high" }
      ],
      "recoverability": "Fully recoverable", "confidence": "high"
    }
  ]
}

================================================================
SECTION 1 — Cost centers
================================================================

Extract every named INDIRECT cost center with its total dollar cost — the "100%" denominator each pool's allocationPercent is measured against.

- name: the human-readable center name, exactly as written. Common indirect centers include City Manager, City Clerk, Finance & Administrative Services (or Finance), Building Use, Equipment Use, City Attorney, Insurance, Committees, City Council — but accept any name the document uses for an indirect cost center.
- glCode: the center's account / GL code exactly as printed in the document — e.g. "011-1200", "061-4300", "BLDG", "EQUIP". This is the center's UNIQUE IDENTIFIER within the document; two centers never share a glCode. Capture it verbatim, including fund/division segments. Omit this field ONLY when the document prints no code for the unit.
- totalCost: the source-department's full budgeted cost for the year — a plain number, NO $ sign, NO commas, NO units. (e.g. "$1,100,000" → 1100000.)
- SKIP pool-level subtotals, grand totals, fund totals, and direct departmental operating budgets (Planning, Building, Engineering, Public Works, Parks, Police, Fire). Those are NOT cost centers — they are receivers, not allocators.
- KEEP rows whose totalCost is zero IF the row appears in the document's Allocation Inventory or ALLOCABLE BUDGET UNITS list — these are internal-service / allocable budget units (e.g. "Fringe Benefits Allocation", "Town Center Operations", "Corp Yard Operations", "Vehicle / Equipment Operations") that have no own dollars but publish a redistribution schedule. A $0 totalCost is NEVER a reason to drop the center or to skip its pools / receivers downstream — the schedule's per-receiver dollars still carry real allocation values that flow into other departments. SKIP rows whose totalCost is missing or non-numeric.
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
  * "EXPEND_PW"— operating expenditures of Public Works departments only (e.g. "Budgeted Expenditures (PW Departments Only)" — restricts denominator to PW-classed depts such as Storm Drain, Street Operations, Pathway Operations)
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
- driverKey routing: classify by the UNDERLYING DRIVER CONCEPT, not the wording. A novel name that clearly describes a known concept still gets the matching key — e.g. "# of FTE", "Budgeted FTE", and "FY19-20 Personnel Allocations" are all "FTE"; "# of Transactions excluding payroll" is "ACCT"; "Budgeted Expenditures per Fund" is "EXPEND"; "Budgeted Expenditures (PW Departments Only)" / "Public Works Operating $" → "EXPEND_PW"; "Budgeted Expenditures (excl. Development)" → "EXPEND_X". Use "OTHER" ONLY when the underlying driver is genuinely outside every named key (e.g. "# of Work Stations", "Council Chamber Breakout") — not merely because the wording is unfamiliar. Whenever driverKey is "OTHER", set confidence to "low" so the basis is surfaced for review. Do NOT invent new key values; "OTHER" is the only permitted overflow.
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
- receivers: the full list of budget units that receive a non-zero share of this pool, taken from the pool's allocation-detail schedule (the "X - Allocations" pages). Each receiver is an object:
  * dept: the receiving budget unit name exactly as written.
  * glCode: the budget unit's account / GL code exactly as printed in the document — e.g. "011-1200", "061-4300", "BLDG", "EQUIP". This is the receiver's UNIQUE IDENTIFIER within the document; two receivers never share a glCode. Capture it verbatim, including fund/division segments. Omit this field ONLY when the document prints no code for the unit.
  * deptCode: the receiver's MatrixDeptCode — one of "BLDG_USE", "EQUIP", "COUNCIL", "CMGR", "CLERK", "FAS", "ATTY", "INS", "CMTE", "PLAN", "BLDG", "ENG", "PW", "PARKS", "PD", "FIRE", or "OTHER" if the receiver is a fund/program with no matching code (CIP funds, grant funds, "All Other"). Set the receiver's confidence to "low" whenever deptCode is "OTHER".
  * units: the raw allocation-factor units for this receiver (the "Allocation Units" column), plain number. Omit if no unit count shown.
  * percent: the receiver's share of the pool, 0-100, plain number, no % sign (the "Allocated Percent" column).
  * amount: the dollar amount allocated to this receiver — DERIVE FROM THE SCHEDULE ITSELF, NOT FROM THE POOL-LEVEL \`amount\` FIELD. Order of preference:
      1. If the schedule prints a per-receiver dollar column for this row (any of "Total", "Amount", "Gross Allocation", or "First Allocation" + "Second Allocation" summed), use that printed dollar verbatim.
      2. Otherwise multiply the receiver's \`percent\` by the SCHEDULE'S OWN published total — i.e. the schedule's "Total" / "Total Costs to be Allocated" / sum-of-receiver-dollars line printed at the bottom of the allocation-detail page. NEVER multiply by the pool's headline \`amount\` field.
    When the pool's headline \`amount\` is $0 but the schedule lists real dollar receivers (typical for internal-service / allocable budget units like Fringe Benefits Allocation, Town Center Operations, Corp Yard Operations, Vehicle / Equipment Operations — whose own budget is $0 but which redistribute incoming dollars), capture each receiver's REAL schedule dollars unchanged. NEVER collapse receivers to $0 just because the pool-level \`amount\` is $0; the schedule's own total is the source of truth.
    Plain number, no $ or commas. Round to whole dollars and assign any rounding residual to the largest receiver so receivers sum exactly to the schedule's published total.
  * grossAllocation, directBilled, firstAllocation, secondAllocation, total: the document's own published per-receiver dollar columns from a full-cost CAP schedule. Capture each ONLY when the document prints it for this receiver. These are for reconciliation/display — the engine derives its own pass results from the percent schedule. Plain numbers, no $ or commas. Omit any field the document does not print.
  * confidence: "high" if dept, percent, and amount are unambiguous; "low" otherwise.
- KEEP receiver rows whose allocated amount is zero IF the receiver appears as an allocable budget unit elsewhere — zero rows still document the redistribution path. A $0 pool-level \`amount\`, a $0 center \`totalCost\`, or a zero \`allocationPercent\` NEVER justifies dropping receivers; always extract the FULL receiver list from the schedule and assign each receiver the dollars the schedule actually prints (per the amount rule above).
- Allocation schedules list BOTH "ALLOCABLE BUDGET UNITS" (other indirect cost centers — these receive during the step-down) and "RECEIVING BUDGET UNITS" (direct departments). Include BOTH: in a two-step CAP, indirect centers receive from each other before the second pass pushes costs to direct departments, so omitting the allocable-budget-unit rows drops real receivers and leaves the receiver percents summing below 100.
- Receivers' amount values must sum (within rounding) to the SCHEDULE'S published total — for ordinary pools this equals the pool's headline \`amount\`, but for zero-amount internal-service pools it equals the schedule's own "Total" / "Total Costs to be Allocated" line (which is the incoming dollars being redistributed, NOT $0). Receivers' percent values must sum to ~100 in every case.
- recoverability: a short policy note quoting the document (e.g. "Fully recoverable", "Partially recoverable", "Excluded — General Fund subsidy"). Omit if not stated.
- SKIP center subtotals, "Total" / "Grand Total" rows, narrative footnotes, blank rows, and any row whose center or pool field is missing.
- KEEP pool rows whose amount is zero IF the row carries an allocation schedule for an internal-service / allocable budget unit (the row exists so the unit's redistribution receivers can be captured). In every such zero-amount pool row you MUST still extract the FULL receivers array from the schedule, and each receiver's \`amount\` MUST carry the schedule's real dollar value per the amount rule above — NEVER $0 derived from the pool's $0 headline. SKIP pool rows whose amount is missing entirely AND which carry no allocation schedule.
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
  /** Document's own account code. Unique within a single document; use as
   *  the receiver/center identity key. Stable within one city + fiscal
   *  year — NOT a cross-city join key. */
  glCode?: string;
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

interface ReceiverRow {
  dept: string;
  /** Document's own account code. Unique within a single document; use as
   *  the receiver/center identity key. Stable within one city + fiscal
   *  year — NOT a cross-city join key. */
  glCode?: string;
  /** MatrixDeptCode (BLDG_USE / EQUIP / COUNCIL / CMGR / CLERK / FAS / ATTY /
   *  INS / CMTE / PLAN / BLDG / ENG / PW / PARKS / PD / FIRE), or "OTHER"
   *  when the receiver is a fund/program with no matching code.
   *  Classification, NOT identity — multiple receivers can share a deptCode
   *  (e.g. several Public Works divisions). Use glCode for per-row identity. */
  deptCode: string;
  units?: number;
  percent: number;
  amount: number;
  /** Published allocation columns from full-cost CAP schedules — captured
   *  for reconciliation/display, not for engine math. */
  grossAllocation?: number;
  directBilled?: number;
  firstAllocation?: number;
  secondAllocation?: number;
  total?: number;
  confidence: "high" | "low";
}

interface PoolRow {
  center: string;
  pool: string;
  allocationPercent: number;
  amount: number;
  eligiblePercent?: number;
  basis: string;
  /** Per-receiver allocation breakdown lifted from the pool's allocation-
   *  detail schedule. Receivers' `amount` values sum to the pool's `amount`. */
  receivers?: ReceiverRow[];
  /** Legacy free-text receiver label. Kept for back-compat with extracts
   *  produced before the structured `receivers` array existed; new prompts
   *  no longer populate it. */
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
      // 32k output ceiling — a full CAP returns ~17 pools × up to ~30
      // receivers each ≈ 500 structured rows. The default 8192 budget
      // truncates partway through the receivers array on real documents;
      // 32k leaves headroom for the worst-case shape plus the centers /
      // bases sections in the same response.
      max_tokens: 32000,
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
      // Pools may carry a nested `receivers: [{...}, {...}]` array, so the
      // simple `[^{}]*` body used above fails as soon as receivers exist.
      // This pattern tolerates one level of nested objects (good enough for
      // receivers, which are themselves flat). If truncation lands mid-
      // receivers the outer pool won't match and is dropped — that's the
      // right call: a partial pool would otherwise sum incorrectly.
      pools   = recover<PoolRow>(/\{(?:[^{}]|\{[^{}]*\})*"pool"\s*:(?:[^{}]|\{[^{}]*\})*\}/g);
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
