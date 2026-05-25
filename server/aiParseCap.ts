import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are extracting Cost Allocation Plan (CAP) data from a municipal document. The document may contain any combination of FIVE sections: (1) cost centers with their source-department total budgets, (2) the allocation-bases catalog with named denominators, (3) basis-level allocation unit schedules, (4) cost pools that allocate a slice of a center's budget, and (5) explicit DIRECT pool allocations.

IMPORTANT — if the document is a comprehensive fee study, annual report, or budget book:
- Skip narrative chapters, methodology preambles, executive summaries, recommendation tables, fee tables, and rate-derivation tables
- Focus exclusively on sections titled "Cost Allocation Plan", "Indirect Cost Allocation", "Cost Centers", "Allocation Bases", "Cost Pools", "CAP Inventory", "Indirect Cost Pool Detail", or any tabular section that lists cost centers / allocation bases / cost pools / per-basis unit schedules with allocation amounts

FIRST, detect which sections are present in the document. Populate ONLY the arrays whose section is present. Omit arrays (or return them empty) for sections the document does not contain.

CRITICAL — non-DIRECT pools no longer carry per-pool receiver schedules. The same receivers + units appear once per BASIS in the "basisUnits" array. The engine derives each pool's per-receiver share as units / Σ units across the basis. If two pools share a basis name, they share its receivers — extract the schedule ONCE, in basisUnits.

DIRECT pools (where the basis's driverKey is "DIRECT") DO carry an explicit per-pool receiver list in "directAllocations" because they have hand-written percent splits, not a denominator.

Return ONLY this JSON, no prose:

{
  "ok": true,
  "centers": [
    { "name": "City Manager", "glCode": "011-1200", "totalCost": 1100000, "confidence": "high" },
    { "name": "Finance & Administrative Services", "glCode": "011-1400", "totalCost": 1218000, "confidence": "high" }
  ],
  "bases": [
    { "name": "Budgeted FTE", "source": "HRIS budget worksheet", "methodologyNote": "Authorized FTEs across the budget year.", "driverKey": "FTE", "confidence": "high" },
    { "name": "AP invoices",  "source": "Finance ledger",         "driverKey": "EXPEND", "confidence": "high" },
    { "name": "Law Enforcement Direct", "source": "Manual assignment", "driverKey": "DIRECT", "confidence": "high" }
  ],
  "basisUnits": [
    {
      "basis": "Budgeted FTE",
      "source": "HRIS budget worksheet",
      "receivers": [
        { "dept": "City Council",    "glCode": "100-10-100", "deptCode": "COUNCIL", "units": 5.85, "confidence": "high" },
        { "dept": "Planning Admin",  "glCode": "011-3100",   "deptCode": "PLAN",    "units": 2.92, "confidence": "high" },
        { "dept": "Building Admin",  "glCode": "011-3200",   "deptCode": "BLDG",    "units": 2.81, "confidence": "high" }
      ]
    }
  ],
  "pools": [
    {
      "center": "City Manager", "pool": "Management Support",
      "allocationPercent": 33, "amount": 777868,
      "personnelCost": 612000, "operatingCost": 215868, "disallowedCost": 50000,
      "basis": "Budgeted FTE",
      "recoverability": "Fully recoverable", "confidence": "high"
    }
  ],
  "directAllocations": [
    {
      "pool": "Law Enforcement Contract Support",
      "center": "City Manager",
      "receivers": [
        { "dept": "Law Enforcement SC Sheriff", "glCode": "100-20-200", "deptCode": "OTHER", "percent": 100, "confidence": "high" }
      ]
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
  * "RECORDS"  — document / records volume counts, including Laserfiche records
  * "EQUAL"    — equal allocation to all listed departments / funds / receivers
  * "MEETING_HOURS" — hours of meetings supported
  * "MEETINGS" — number of meetings supported
  * "APPLICATIONS" — applications, permits, or cases processed
  * "RECRUITMENTS" — recruitment / hiring process counts
  * "CLAIMS"   — claim counts, claim history, or insurance loss history
  * "RENTAL_HOURS" — rental hours or facility-use hours
  * "DIRECT"   — a one-to-one direct assignment (the pool routes entirely to one department, bypassing the step-down)
  * "OTHER"    — the basis does not match any key above. Use ONLY as a last resort (see routing rule below).
- driverKey routing: classify by the UNDERLYING DRIVER CONCEPT, not the wording. A novel name that clearly describes a known concept still gets the matching key — e.g. "# of FTE", "Budgeted FTE", and "FY19-20 Personnel Allocations" are all "FTE"; "# of Transactions excluding payroll" is "ACCT"; "Budgeted Expenditures per Fund" is "EXPEND"; "Budgeted Expenditures (PW Departments Only)" / "Public Works Operating $" → "EXPEND_PW"; "Budgeted Expenditures (excl. Development)" → "EXPEND_X". Use "OTHER" ONLY when the underlying driver is genuinely outside every named key (e.g. "# of Work Stations", "Council Chamber Breakout") — not merely because the wording is unfamiliar. Whenever driverKey is "OTHER", set confidence to "low" so the basis is surfaced for review. Do NOT invent new key values; "OTHER" is the only permitted overflow.
- directTo: optional legacy hint when driverKey === "DIRECT" and there is exactly one receiving InstDeptCode. DIRECT routing is primarily captured in Section 5 directAllocations, so omit directTo when the receiver is a GL-coded budget unit outside the InstDeptCode list or when the pool uses the Section 5 receiver list. Omit when driverKey !== "DIRECT".
- SKIP duplicate listings, header rows, and explanatory prose paragraphs that aren't structured basis definitions.
- confidence: "high" if name, source, and driverKey are unambiguous from the document; "low" if driverKey is "OTHER" or any field is uncertain.

================================================================
SECTION 3 — Basis units
================================================================

Extract one entry per allocation BASIS that has a unit schedule (e.g. an FTE-by-department schedule, a square-footage schedule, an agenda-item-count schedule). The same schedule serves every pool that selects this basis.

- basis: the basis name. MUST match one of the names in Section 2 of the same document (or its canonical seed name).
- source: where the unit counts come from (e.g. "HRIS budget worksheet", "Facilities inventory"). Optional but recommended.
- receivers: the full list of budget units the schedule assigns units to. Each receiver is an object:
  * dept: the receiving budget unit name exactly as written.
  * glCode: REQUIRED. The budget unit's account / GL code exactly as printed — e.g. "011-1200", "100-10-100", "BLDG", "EQUIP". This is the receiver's UNIQUE IDENTIFIER and the engine's routing key. Capture verbatim. If the document does not print a code for a row, SKIP that row entirely — receivers without a glCode are not extractable.
  * deptCode: optional InstDeptCode classification — one of "BLDG_USE", "EQUIP", "COUNCIL", "CMGR", "CLERK", "FAS", "ATTY", "INS", "CMTE", "PLAN", "BLDG", "ENG", "PW", "PARKS", "PD", "FIRE", or "OTHER" (for funds/programs with no matching code). When unknown, set "OTHER" — glCode is the identity, deptCode is just classification metadata.
  * units: REQUIRED. The raw allocation-factor units (FTE count, sq ft, etc.). Plain number, no units suffix. Receivers with zero or missing units should be omitted.
  * confidence: "high" if dept, glCode, and units are unambiguous; "low" otherwise.
- Do NOT include "percent" or "amount" in basis-unit receivers — the engine derives those at run time from units / Σ units across the schedule.
- Extract each basis schedule ONCE even if multiple pools reference it. If the same set of FTE units is published verbatim for several pools, that's a single basisUnits entry.
- Skip schedules whose basis is "DIRECT" — DIRECT pools belong in Section 5, not here.

================================================================
SECTION 4 — Cost pools
================================================================

Extract every cost-pool row that allocates a slice of an indirect center's budget. A typical row looks like "City Manager · Management Support — 33% — $777,868 — Budgeted FTE".

- center: the cost-center name this pool belongs to (matches a Section 1 center name).
- pool: the human-readable pool / function name (e.g. "Management Support", "Records", "Council / Legislative Support").
- allocationPercent: the pool's claimed share of the center, 0–100 plain number, no % sign.
- amount: the net allocable dollar amount this pool distributes. Plain number, no $ or commas. This is the figure after disallowed costs are removed (gross − disallowed), which is what the step-down engine actually distributes.
- personnelCost: the personnel-cost portion the document publishes for this pool — salaries + benefits, taxes, retirement, fringe. Plain number, no $ or commas. Omit when the document does not break out personnel from operating.
- operatingCost: the operating-cost portion the document publishes — non-personnel spend (contracts, supplies, services, equipment). Plain number, no $ or commas. Omit when not broken out.
- disallowedCost: dollars excluded from allocation per the document's policy — typically capital outlay, one-time charges, grant-funded line items, pass-throughs, or any "Disallowed" / "Excluded" / "Non-allocable" column. Plain number, no $ or commas. Omit when the document does not call out an excluded portion.
  - When the document prints both a gross and a net figure with disallowed = gross − net, capture \`amount\` as the net (already excluded) AND capture \`disallowedCost\` as the excluded portion.
  - When the document publishes ONLY a single dollar figure with no exclusions, set \`amount\` to that figure and omit \`disallowedCost\`.
- ZERO-AMOUNT POOLS — when \`amount\` is 0 (internal-service / allocable budget units that publish a redistribution schedule with no own dollars), you MUST STILL populate \`personnelCost\`, \`operatingCost\`, and \`disallowedCost\` if the document shows them. A $0 \`amount\` typically arises because gross personnel + operating happens to equal disallowed (everything excluded by policy), or because the unit purely redistributes incoming costs — either way the underlying cost breakdown is real data the document publishes and must be captured. Do NOT collapse those three fields to 0 or omit them just because \`amount\` is 0. Apply the same omit-only-when-unprinted rule that applies to non-zero pools.
- basis: the allocation basis name (matches Section 2). When this basis appears in Section 3 (basisUnits), the engine uses that schedule. When the basis is DIRECT, the per-pool routing comes from Section 5.
- recoverability: short policy note (e.g. "Fully recoverable", "Excluded — General Fund subsidy"). Optional.
- DO NOT include a "receivers" field on pool rows. The receiver schedule is published once per basis in Section 3 (or per pool in Section 5 for DIRECT pools).
- KEEP zero-amount pool rows for internal-service / allocable budget units that publish a redistribution schedule (their basis still carries unit counts in Section 3).
- SKIP center subtotals, "Total" / "Grand Total" rows, narrative footnotes, blank rows, and any row whose center or pool field is missing.
- confidence: "high" if center, pool, allocationPercent, amount, and basis are unambiguous; "low" otherwise.

================================================================
SECTION 5 — Direct allocations
================================================================

Extract one entry per pool whose basis's driverKey is "DIRECT". DIRECT pools route their full amount through an explicit per-receiver percent split (not via a basis denominator).

- pool: the pool name as it appears in Section 4.
- center: optional disambiguator when two pools share a name across different centers. Omit when the name is unique.
- receivers: explicit list of receiving budget units. Each receiver:
  * dept: the receiving budget unit name as written.
  * glCode: REQUIRED. The receiver's account / GL code. Routing identity for the engine.
  * deptCode: optional InstDeptCode or "OTHER" (defaults to "OTHER" when unknown).
  * percent: receiver's explicit share of the pool, 0–100 plain number. Receivers in one direct allocation should sum to ~100.
  * confidence: "high" if dept, glCode, and percent are unambiguous; "low" otherwise.
- Skip pools that are not DIRECT — those route through Section 3 (basisUnits) instead.

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

interface BasisUnitReceiverRow {
  dept: string;
  /** REQUIRED. Account / GL code — the receiver's routing identity. */
  glCode: string;
  /** Optional classification metadata. */
  deptCode?: string;
  units: number;
  confidence?: "high" | "low";
}

interface BasisUnitsRow {
  basis: string;
  source?: string;
  receivers: BasisUnitReceiverRow[];
}

interface DirectReceiverRow {
  dept: string;
  glCode: string;
  deptCode?: string;
  percent: number;
  confidence?: "high" | "low";
}

interface DirectAllocationsRow {
  pool: string;
  center?: string;
  receivers: DirectReceiverRow[];
}

interface PoolRow {
  center: string;
  pool: string;
  allocationPercent: number;
  amount: number;
  /** Personnel-cost portion (salaries + benefits). Optional. */
  personnelCost?: number;
  /** Operating-cost portion (non-personnel). Optional. */
  operatingCost?: number;
  /** Disallowed / excluded portion (capital, one-time, pass-through). Optional. */
  disallowedCost?: number;
  basis: string;
  /** Free-text receiver caption shown on the source PDF. Optional. */
  receiving?: string;
  recoverability?: string;
  confidence: "high" | "low";
}

interface ParseCapResponse {
  ok: boolean;
  centers?: CenterRow[];
  bases?: BasisRow[];
  basisUnits?: BasisUnitsRow[];
  pools?: PoolRow[];
  directAllocations?: DirectAllocationsRow[];
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
    let basisUnits: BasisUnitsRow[] = [];
    let pools: PoolRow[] = [];
    let directAllocations: DirectAllocationsRow[] = [];

    try {
      const parsed = JSON.parse(jsonMatch[0]) as ParseCapResponse;
      if (Array.isArray(parsed.centers))   centers   = parsed.centers;
      if (Array.isArray(parsed.bases))     bases     = parsed.bases;
      if (Array.isArray(parsed.basisUnits)) basisUnits = parsed.basisUnits;
      if (Array.isArray(parsed.pools))     pools     = parsed.pools;
      if (Array.isArray(parsed.directAllocations)) directAllocations = parsed.directAllocations;
    } catch {
      // Truncated JSON — recover what we can section-by-section. Each
      // top-level row shape carries a distinctive key.
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
      // basisUnits + directAllocations have nested receiver arrays; tolerate
      // one level of nesting in the body match.
      basisUnits = recover<BasisUnitsRow>(/\{(?:[^{}]|\{[^{}]*\})*"basis"\s*:(?:[^{}]|\{[^{}]*\})*"receivers"\s*:(?:[^{}]|\{[^{}]*\}|\[[^\[\]]*\])*\}/g);
      pools   = recover<PoolRow>(/\{[^{}]*"allocationPercent"\s*:[^{}]*\}/g);
      directAllocations = recover<DirectAllocationsRow>(/\{(?:[^{}]|\{[^{}]*\})*"pool"\s*:(?:[^{}]|\{[^{}]*\})*"receivers"\s*:(?:[^{}]|\{[^{}]*\}|\[[^\[\]]*\])*\}/g);
      const recovered = centers.length + bases.length + basisUnits.length + pools.length + directAllocations.length;
      if (recovered === 0) {
        return json({ ok: false, message: "Response was truncated and no complete CAP rows could be recovered. Try a shorter document or split it by section." }, { status: 502 });
      }
      console.warn(`[ai-parse-cap] Response truncated — recovered ${centers.length} centers / ${bases.length} bases / ${basisUnits.length} basisUnits / ${pools.length} pools / ${directAllocations.length} directAllocations`);
    }

    console.log(`[ai-parse-cap] Parsed ${centers.length} centers, ${bases.length} bases, ${basisUnits.length} basisUnits, ${pools.length} pools, ${directAllocations.length} directAllocations from ${fileName}`);
    return json({ ok: true, centers, bases, basisUnits, pools, directAllocations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown model error.";
    console.error(`[ai-parse-cap] Error: ${message}`);
    return json({ ok: false, message }, { status: 502 });
  }
}
