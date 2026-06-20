import Anthropic from "@anthropic-ai/sdk";
import { readPdfUpload } from "./aiUploadValidator";
import {
  aiBasisColumnSemantics,
  extractReceiverUnitsFromPdf,
  loadPdfItemsByPage,
  type DeterministicScheduleResult,
} from "./capDeterministicSchedules";
import {
  capDocumentProfileGuidance,
  detectCapDocumentProfileFromText,
  type CapDocumentProfile,
} from "./capDocumentProfiles";
import { extractPdfTextPreview, type TextItem } from "./pdfTableExtract";
import { logEvent } from "./logger";

const TAG = "ai-parse-cap";

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are extracting Cost Allocation Plan (CAP) data from a municipal document. The document may contain any combination of FIVE sections: (1) cost centers with their source-department total budgets, (2) the allocation-bases catalog with named denominators, (3) basis-level allocation unit schedules, (4) cost pools that allocate a slice of a center's budget, and (5) explicit per-pool direct allocations (when a pool is split by a hand-written percent list rather than a denominator).

IMPORTANT — if the document is a comprehensive fee study, annual report, or budget book:
- Skip narrative chapters, methodology preambles, executive summaries, recommendation tables, fee tables, and rate-derivation tables
- Focus exclusively on sections titled "Cost Allocation Plan", "Indirect Cost Allocation", "Cost Centers", "Allocation Bases", "Cost Pools", "CAP Inventory", "Indirect Cost Pool Detail", or any tabular section that lists cost centers / allocation bases / cost pools / per-basis unit schedules with allocation amounts

FIRST, detect which sections are present in the document. Populate ONLY the arrays whose section is present. Omit arrays (or return them empty) for sections the document does not contain.

CRITICAL — denominator-driven pools (FTE, expenditures, agenda items, square footage, etc.) do not carry per-pool receiver schedules. The same receivers + units appear once per BASIS in the "basisUnits" array. The engine derives each pool's per-receiver share as units / Σ units across the basis. If two pools share a basis name, they share its receivers — extract the schedule ONCE, in basisUnits.

Pools whose document publishes a hand-written percent split — typically "Direct" assignments with no denominator (e.g. "Law Enforcement Contract Support — 100% to Sheriff") — carry an explicit per-pool receiver list in "directAllocations". On import these are folded into per-pool basis schedules automatically; you do not need to mint a placeholder "DIRECT" basis row when the document doesn't define one.

CRITICAL — allocation-factor inventory exhibits often print several independent bases as parallel column groups over the same receiver rows. Emit a separate "bases" row AND a separate "basisUnits" entry for EVERY named Value column. Never merge parallel bases or select only one. In particular, "Gross Operating Expenses", "Modified Operating Expenses", "City Manager Service Areas", "Assistant City Manager Service Areas", and "Deputy City Manager Service Areas" are five distinct bases with five distinct schedules.

Return ONLY this JSON, no prose:

{
  "ok": true,
  "centers": [
    { "name": "City Manager", "glCode": "011-1200", "totalCost": 1100000, "confidence": "high" },
    { "name": "Finance & Administrative Services", "glCode": "011-1400", "totalCost": 1218000, "confidence": "high" }
  ],
  "bases": [
    { "name": "Budgeted FTE", "source": "HRIS budget worksheet", "methodologyNote": "Authorized FTEs across the budget year.", "confidence": "high" },
    { "name": "AP invoices",  "source": "Finance ledger",         "confidence": "high" }
  ],
  "basisUnits": [
    {
      "basis": "Budgeted FTE",
      "source": "HRIS budget worksheet",
      "printedTotal": 372.92,
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
- DUAL ROLE WARNING: in allocation-factor inventory exhibits (Section 3), the SAME row that names an indirect center (e.g. "City Council", "City Manager", "Information Technology") ALSO publishes that center's Value under each parallel basis column (Modified Operating Expenses, Gross Operating Expenses, Assigned Square Footage, etc.). Extracting a row into "centers" here does NOT excuse you from also extracting that identical row as a receiver in EVERY basisUnits schedule on that page in Section 3. Treat the two extractions as fully independent passes over the same source rows — finishing Section 1 must not cause you to skip or "already used" those rows when you build Section 3.

================================================================
SECTION 2 — Allocation bases
================================================================

Extract the catalog of named denominators (drivers) the document defines.

- name: the basis name as written (e.g. "Budgeted FTE", "AP invoices", "Agenda item count", "Square footage", "PRA request count"). Keep the document's wording verbatim — do not paraphrase or normalize. Novel / custom basis names are fine.
- source: the underlying data source quoted in the document (e.g. "HRIS budget worksheet", "Clerk PRA log", "Facilities inventory", "Finance ledger"). If the document does not state a source, infer a short label like "Document".
- methodologyNote: the longer methodology / explanation paragraph if the document provides one. Omit the field if there is no extended note.
- driverKey: OPTIONAL legacy classification metadata. The engine no longer reads this field — pools route by basis name and the schedule in Section 3. Omit unless the document itself uses a recognizable short classification (e.g. "FTE", "EXPEND", "DIRECT"). Never invent or guess a key; never reject or reword a basis name because it doesn't match a known classification.
- directTo: OPTIONAL legacy hint when the basis is hand-written direct routing. Direct pool routing is captured in Section 5 directAllocations; omit unless the document publishes a single named InstDeptCode receiver.
- SKIP duplicate listings, header rows, and explanatory prose paragraphs that aren't structured basis definitions.
- NAME ALIASES: When the bases catalog and the column header in the allocation-factor exhibit use slightly different wording for the same basis, use the column header wording as the canonical \`name\` — that is what pool rows and basisUnits entries must match. Specifically, "Purchasing Staff Time Analysis" (catalog wording) and "Purchasing Time Analysis" (column header wording) refer to the same basis; record it as "Purchasing Time Analysis" throughout.
- confidence: "high" if name + source are unambiguous from the document; "low" only when a field is uncertain.

================================================================
SECTION 3 — Basis units
================================================================

Extract one entry per allocation BASIS that has a unit schedule (e.g. an FTE-by-department schedule, a square-footage schedule, an agenda-item-count schedule). The same schedule serves every pool that selects this basis.

- basis: the basis name. MUST match one of the names in Section 2 of the same document (or its canonical seed name).
- source: where the unit counts come from (e.g. "HRIS budget worksheet", "Facilities inventory"). Optional but recommended.
- printedTotal: OPTIONAL. When the schedule prints a Grand Total row under
  the requested basis column, capture it as a plain number. Omit when the
  document does not print a total for this basis. Never invent or compute it.
  IMPORTANT — some exhibits print TWO grand total rows per basis column:
  "Grand Total: All Services" and "Grand Total: Only to Direct Services".
  When both are present, capture the "Grand Total: All Services" value as
  printedTotal. The receiver schedules import ALL positive receiver rows,
  including central-service / internal-service receivers, so the all-services
  total is the correct verification target. Never capture the
  "Only to Direct Services" total when an "All Services" total is also present
  on the same page.
- receivers: the full list of budget units the schedule assigns units to. Each receiver is an object:
  * dept: the receiving budget unit name exactly as written.
  * glCode: REQUIRED. The budget unit's account / GL code exactly as printed when the document provides one combined code — e.g. "011-1200", "100-10-100", "BLDG", "EQUIP". When identity is printed in separate Fund, Department / Organization, and Division / Cost Pool number columns, construct one stable code by joining the printed numeric segments with hyphens in that order (e.g. Fund 100 + Department 512 + Division 0 becomes "100-512-0"). Preserve zero segments because they distinguish organization and fund-total rows. If the document prints no usable identity segments, SKIP that receiver.
  * deptCode: optional InstDeptCode classification — one of "BLDG_USE", "EQUIP", "COUNCIL", "CMGR", "CLERK", "FAS", "ATTY", "INS", "CMTE", "PLAN", "BLDG", "ENG", "PW", "PARKS", "PD", "FIRE", or "OTHER" (for funds/programs with no matching code). When unknown, set "OTHER" — glCode is the identity, deptCode is just classification metadata.
  * units: REQUIRED. The raw allocation-factor units (FTE count, sq ft, etc.). Plain number, no units suffix. Receivers with zero or missing units should be omitted.
  * confidence: "high" if dept, glCode, and units are unambiguous; "low" otherwise.
- Do NOT include "percent" or "amount" in basis-unit receivers — the engine derives those at run time from units / Σ units across the schedule.
- Extract each basis schedule ONCE even if multiple pools reference it. If the same set of FTE units is published verbatim for several pools, that's a single basisUnits entry.
- A schedule spanning multiple consecutive pages is still ONE basisUnits entry. Continue collecting receivers until that named basis's Grand Total row or until a new allocation-factor group begins.
- In parallel-column exhibits, use only the raw "Value" as units. Ignore "Distribution to All Services" and "Distribution Only to Direct Services" percentages because the engine derives percentages from units.
- Zero / dash values may be omitted from receivers. Retain every positive printed Value, including rows for central services, indirect/internal services, and other non-direct receivers. Rows under a "Central Services in the General Fund" (or equivalent) heading are NOT exempt — even though those same rows also populate Section 1's centers array, they MUST still appear as receivers here for every basis column where they print a positive Value. Do not drop a row from a basisUnits schedule just because it was already captured in Section 1.
- Skip schedules for pools that publish a hand-written percent split — those go in Section 5 (directAllocations), not here.
- COLUMN AND ROW VERIFICATION (parallel-column / detached-label PDFs):
  Allocation-factor exhibits frequently print several independent bases as
  parallel "Value" columns sharing one receiver-row spine. PDF text layers
  often emit the receiver-label column and the numeric columns as separate
  text blocks, which makes it easy to shift a numeric row onto the wrong
  receiver. Apply ALL of the following:
  * Identify the requested basis column by matching its header text to this
    basis's name — never by position ("middle column", "third column"), since
    column order varies by document.
  * Extract ONLY the Value printed under that exact basis header. Never
    borrow a number from an adjacent basis column even if it looks more
    plausible for the receiver, and never substitute a value from the row
    above or below.
  * When the receiver labels and numeric values are emitted as separate
    text blocks, preserve the visual row order. Align each numeric row to
    the receiver label that occupies the same printed visual row — not the
    nearest non-blank label and not the previous receiver.
  * Do not assign a numeric row to a section header, a blank row, or the
    prior receiver. If you are not sure which receiver a numeric row
    belongs to, omit it rather than guess.
  * If the printed Value for a receiver under the requested basis is a
    dash, blank, or 0, omit that receiver entirely — even when the next
    row down or an adjacent basis column has a positive value that would
    "fit" this receiver.
  * Before emitting each receiver, re-confirm its units are on the same
    printed visual row as that receiver's department label and code.

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
- When a pool's allocation basis is "Purchasing Staff Time Analysis", normalize it to "Purchasing Time Analysis" to match the column header used in the allocation-factor exhibit.
- recoverability: short policy note (e.g. "Fully recoverable", "Excluded — General Fund subsidy"). Optional.
- DO NOT include a "receivers" field on pool rows. The receiver schedule is published once per basis in Section 3 (or per pool in Section 5 for DIRECT pools).
- KEEP zero-amount pool rows for internal-service / allocable budget units that publish a redistribution schedule (their basis still carries unit counts in Section 3).
- SKIP center subtotals, "Total" / "Grand Total" rows, narrative footnotes, blank rows, and any row whose center or pool field is missing.
- confidence: "high" if center, pool, allocationPercent, amount, and basis are unambiguous; "low" otherwise.

================================================================
SECTION 5 — Direct allocations
================================================================

Extract one entry per pool whose document publishes an explicit per-receiver percent split rather than referencing a basis denominator. These are typically labeled "Direct", "Direct Assignment", or simply show a 100% receiver row alongside the pool. On import the split is converted into a per-pool basis schedule — you do not need to mint a placeholder basis in Section 2 for it.

- pool: the pool name as it appears in Section 4.
- center: optional disambiguator when two pools share a name across different centers. Omit when the name is unique.
- receivers: explicit list of receiving budget units. Each receiver:
  * dept: the receiving budget unit name as written.
  * glCode: REQUIRED. The receiver's account / GL code. Routing identity for the engine.
  * deptCode: optional InstDeptCode or "OTHER" (defaults to "OTHER" when unknown).
  * percent: receiver's explicit share of the pool, 0–100 plain number. Receivers in one direct allocation should sum to ~100.
  * confidence: "high" if dept, glCode, and percent are unambiguous; "low" otherwise.
- Skip pools that are denominator-driven — those route through Section 3 (basisUnits) instead.

================================================================
General rules
================================================================

- All monetary values are plain numbers — strip $, commas, whitespace, units.
- All percentages are plain numbers (0–100) — strip the % sign.
- Use the exact names / pool labels / basis names as written in the document.
- Every basis referenced by a pool MUST appear in "bases" (unless the pool is captured in Section 5 directAllocations, which is folded into a per-pool basis at import time). When the document publishes a receiver Value schedule for a basis, that schedule MUST also appear in "basisUnits".
- NUMERIC RECONSTRUCTION: The PDF text layer sometimes splits a single number across two or more adjacent tokens on the same visual row — either because a dollar sign lands in a separate character run ("$" + "6" + "31,378" = $631,378) or because the leading digit is isolated ("2" + "81,728" = 281,728). Before recording any numeric value, scan all tokens on the same visual row at the same x-cluster and concatenate any digit-only fragments that are adjacent to the main number token. A token qualifies as a fragment if it contains only digits and appears immediately left of a comma-formatted number at the same vertical position.
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
  /** Optional printed Grand Total under the basis's Value column, when the
   *  document publishes one. Used downstream to verify the extracted
   *  receiver sum matches the source PDF. */
  printedTotal?: number;
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

const SCHEDULE_BATCH_SIZE = 1;

function systemForProfile(profile: CapDocumentProfile): string {
  return `${SYSTEM}

${capDocumentProfileGuidance(profile)}`;
}

function scheduleSystem(basisNames: string[], profile: CapDocumentProfile): string {
  return `You are extracting ONLY allocation-factor receiver schedules from a municipal Cost Allocation Plan PDF.

${capDocumentProfileGuidance(profile)}

Return ONLY this JSON:
{
  "basisUnits": [
    {
      "basis": "Exact requested basis name",
      "source": "Document section or source note",
      "printedTotal": 372.92,
      "receivers": [
        { "dept": "Department name", "glCode": "100-512-0", "deptCode": "PLAN", "units": 2030145, "confidence": "high" }
      ]
    }
  ]
}

Extract schedules for exactly these requested bases:
${basisNames.map((name) => `- ${name}`).join("\n")}

For each basis, search for a column whose header text matches the basis name (allowing minor wording variation). These columns are often printed in groups of 2-4 parallel "Value" columns sharing one header row, sometimes repeated across multiple page groups for different funds/orgs — collect all such rows for the matching basis. For every receiver, verify the value is on the same printed visual row as that receiver's name and code; omit rows where the value is "-", blank, or 0.

Rules:
- Search allocation-factor inventory exhibits and derivation schedules, including multi-page tables.
- Return a separate basisUnits entry for every requested named Value column whose schedule is printed.
- Use only the raw Value column as units. Ignore distribution percentages.
- Identify the requested basis column purely by matching its header text to the requested name — never by position ("middle column", "third column"), since column order varies by document.
- Extract only the Value printed under the matched header. Never borrow a number from an adjacent basis column even if it looks more plausible for the receiver, and never substitute a value from the row above or below.
- When the PDF text layer emits receiver labels and numeric values as separate text blocks, preserve visual row order. Align each numeric row to the receiver label that occupies the same printed visual row, not the nearest non-blank label and not the previous receiver. Do not assign a numeric row to a section header, a blank row, or a prior receiver.
- If the printed Value under the requested basis for a receiver is "-", blank, or 0, omit that receiver entirely — even if the next row or an adjacent basis column has a positive value that would "fit" this receiver.
- When Fund, Department / Organization, and Division / Cost Pool numbers are separate, join them in that order with hyphens. Preserve zero segments: Fund 100 + Department 512 + Division 0 becomes "100-512-0".
- dept is the receiving unit name exactly as printed.
- deptCode is optional; use "OTHER" when no listed application code fits.
- Include every positive Value row, including central services, indirect/internal services, and other non-direct receivers. Omit zero / dash rows, headers, subtotals, and grand totals.
- Continue across consecutive pages until the schedule's Grand Total or the next allocation-factor group.
- Keep the requested basis spelling exactly. Do not rename, merge, or classify bases.
- If a requested schedule is not printed, omit that basisUnits entry.
- printedTotal: OPTIONAL. When the schedule prints a Grand Total / Total under the requested basis column, capture it as a plain number. Omit when the document does not print a total for this basis. Never invent or compute it.
- PRINTED TOTAL SELECTION: Some exhibits print two Grand Total rows per basis column: "Grand Total: All Services" and "Grand Total: Only to Direct Services". When both are present, capture the "Grand Total: All Services" value as \`printedTotal\`, not the "Only to Direct Services" value. The receiver schedules extracted here include all positive receiver rows, including central-service / internal-service rows, so the all-services total is the correct verification target.
- NUMERIC RECONSTRUCTION: The PDF text layer sometimes splits a single number across two or more adjacent tokens on the same visual row — either because a dollar sign lands in a separate character run ("$" + "6" + "31,378" = $631,378) or because the leading digit is isolated ("2" + "81,728" = 281,728). Before recording any unit value or printedTotal, scan all tokens on the same visual row at the same x-cluster and concatenate any digit-only fragments that are adjacent to the main number token. A token qualifies as a fragment if it contains only digits and appears immediately left of a comma-formatted number at the same vertical position.
- Before returning, if the extracted receiver sum does not match the printed Grand Total for that basis (when one is printed), re-check for row shift or adjacent-column leakage and correct the schedule before returning.
- Avoid document-specific hardcoded hints — only the requested basis names above are special.
- Return JSON only, without prose or markdown.`;
}

function scanTopLevelArrayObjects(text: string, key: string): unknown[] {
  const keyAt = text.indexOf(`"${key}"`);
  if (keyAt < 0) return [];
  const arrayAt = text.indexOf("[", keyAt);
  if (arrayAt < 0) return [];

  const rows: unknown[] = [];
  let inString = false;
  let escaped = false;
  let objectDepth = 0;
  let objectStart = -1;
  for (let i = arrayAt + 1; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (objectDepth === 0) objectStart = i;
      objectDepth += 1;
      continue;
    }
    if (char === "}") {
      objectDepth -= 1;
      if (objectDepth === 0 && objectStart >= 0) {
        try {
          rows.push(JSON.parse(text.slice(objectStart, i + 1)));
        } catch {
          // Skip malformed or truncated rows; complete rows still recover.
        }
        objectStart = -1;
      }
      continue;
    }
    if (char === "]" && objectDepth === 0) break;
  }
  return rows;
}

export function parseBasisUnitsResponse(text: string): BasisUnitsRow[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { basisUnits?: unknown };
      if (Array.isArray(parsed.basisUnits)) return parsed.basisUnits as BasisUnitsRow[];
    } catch {
      // Fall through to complete-row recovery.
    }
  }
  return scanTopLevelArrayObjects(text, "basisUnits") as BasisUnitsRow[];
}

function validSchedule(row: BasisUnitsRow): boolean {
  return !!row.basis?.trim() && Array.isArray(row.receivers)
    && row.receivers.some((receiver) =>
      !!receiver.dept?.trim()
      && !!receiver.glCode?.trim()
      && Number.isFinite(Number(receiver.units))
      && Number(receiver.units) > 0);
}

function basisNameKey(name: string): string {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (key === "purchasingstafftimeanalysis") return "purchasingtimeanalysis";
  return key;
}

export function alignRecoveredBasisNames(
  recovered: BasisUnitsRow[],
  requested: string[],
): BasisUnitsRow[] {
  if (recovered.length === 1 && requested.length === 1) {
    return [{ ...recovered[0], basis: requested[0] }];
  }
  const requestedByKey = new Map(
    requested.map((name) => [basisNameKey(name), name]),
  );
  return recovered.map((row) => {
    const requestedName = requestedByKey.get(basisNameKey(row.basis));
    return requestedName ? { ...row, basis: requestedName } : row;
  });
}

export function receiverTotalMatchesPrintedTotal(
  row: Pick<BasisUnitsRow, "printedTotal">,
  receivers: Array<{ units: number }>,
): boolean {
  const printedTotal = Number(row.printedTotal);
  if (!Number.isFinite(printedTotal) || printedTotal <= 0) return false;
  const extractedTotal = receivers.reduce((sum, receiver) => sum + receiver.units, 0);
  // Per-receiver integer rounding error is bounded by ±0.5, so total drift
  // across N receivers cannot exceed N × 0.5 from rounding alone. Schedules
  // where many small allocations round to 0 (e.g. percentage bases with long
  // tails of sub-1% receivers) legitimately undercount by several units.
  const tolerance = Math.max(
    1,
    Math.abs(printedTotal) * 0.005,
    receivers.length * 0.5,
  );
  return Math.abs(extractedTotal - printedTotal) <= tolerance;
}

export type DeterministicTrustDecision =
  | { trust: true }
  | { trust: false; reason: "unmatched-receivers" | "total-mismatch" | "no-resolved-receivers" };

/** Single gate for "should we keep this basis's deterministic PDF read, or
 *  fall back to the AI-extracted receivers?" All callers must go through
 *  this function rather than inspecting `DeterministicScheduleResult`
 *  fields directly — `unmatchedReceivers` is NOT a reliable completeness
 *  signal on its own: `evaluatePdfReceiverGroup` (used whenever
 *  `deriveReceiversFromPdf: true`, which is every call site today) always
 *  returns it empty, since that path derives receivers from PDF rows
 *  rather than matching against an AI-supplied candidate list. The
 *  printed-total reconciliation is the strong signal and is checked
 *  whenever a printed total is available; "no unmatched receivers" alone
 *  is not sufficient to trust a result. */
export function evaluateDeterministicResult(
  row: Pick<BasisUnitsRow, "printedTotal">,
  result: Pick<DeterministicScheduleResult, "receivers" | "unmatchedReceivers">,
): DeterministicTrustDecision {
  if (result.unmatchedReceivers.length > 0) {
    return { trust: false, reason: "unmatched-receivers" };
  }
  const printedTotal = Number(row.printedTotal);
  const hasPrintedTotal = Number.isFinite(printedTotal) && printedTotal > 0;
  if (hasPrintedTotal && !receiverTotalMatchesPrintedTotal(row, result.receivers)) {
    return { trust: false, reason: "total-mismatch" };
  }
  if (result.receivers.length === 0) {
    return { trust: false, reason: "no-resolved-receivers" };
  }
  return { trust: true };
}

export function missingScheduleBasisNames(
  bases: BasisRow[],
  basisUnits: BasisUnitsRow[],
  pools: PoolRow[],
  directAllocations: DirectAllocationsRow[] = [],
): string[] {
  // A basis is direct-routed iff (a) the model labeled it driverKey "DIRECT"
  // (legacy classification metadata), OR (b) any pool that selects it
  // appears in directAllocations. Both signals skip schedule recovery —
  // direct routing is captured in directAllocations, not basisUnits.
  const directBasisNames = new Set(
    bases
      .filter((basis) => basis.driverKey?.trim().toUpperCase() === "DIRECT")
      .map((basis) => basisNameKey(basis.name)),
  );
  const directPoolNames = new Set(
    directAllocations
      .map((row) => row.pool?.trim().toLowerCase())
      .filter((s): s is string => Boolean(s)),
  );
  const validNames = new Set(
    basisUnits.filter(validSchedule).map((row) => basisNameKey(row.basis)),
  );
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const pool of pools) {
    const name = pool.basis?.trim();
    if (!name) continue;
    const key = basisNameKey(name);
    if (directPoolNames.has(pool.pool?.trim().toLowerCase() ?? "")) continue;
    if (directBasisNames.has(key) || validNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push(name);
  }
  return missing;
}

export function mergeBasisUnits(
  primary: BasisUnitsRow[],
  recovered: BasisUnitsRow[],
): BasisUnitsRow[] {
  const byName = new Map<string, BasisUnitsRow>();
  for (const row of [...primary, ...recovered]) {
    if (!validSchedule(row)) continue;
    byName.set(basisNameKey(row.basis), row);
  }
  return [...byName.values()];
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
    logEvent({
      level: "error", tag: TAG,
      msg: "ANTHROPIC_API_KEY not configured — refusing request",
    });
    return json({
      ok: false,
      message: "AI parsing is temporarily unavailable. Please try again later.",
    }, { status: 503 });
  }

  const upload = await readPdfUpload(req);
  if (upload instanceof Response) return upload;
  const { fileName, fileSizeKb, base64: pdfBase64, buffer: pdfBuffer } = upload;
  let profile = detectCapDocumentProfileFromText("");
  try {
    profile = detectCapDocumentProfileFromText(
      await extractPdfTextPreview(new Uint8Array(pdfBuffer.slice(0))),
    );
  } catch (err) {
    logEvent({
      level: "warn",
      tag: TAG,
      msg: "cap profile preview failed",
      error: err instanceof Error ? err.message : "Unknown preview error",
    });
  }

  logEvent({
    tag: TAG, msg: "anthropic request start",
    file: fileName,
    file_kb: fileSizeKb,
    model: MODEL,
    cap_profile: profile.id,
    cap_vendor: profile.vendor,
  });
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
      system: systemForProfile(profile),
      messages: [{
        role: "user",
        content: [{
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        }],
      }],
    }, {
      // Stop billing for output tokens once the client disconnects.
      signal: req.signal,
    });

    const elapsed_ms = Date.now() - t0;
    const text = response.content.find((c) => c.type === "text")?.text ?? "";
    logEvent({
      tag: TAG, msg: "anthropic response",
      latency_ms: elapsed_ms,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      stop_reason: response.stop_reason,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logEvent({
        level: "error", tag: TAG, msg: "no JSON in model response",
        raw_preview: text.slice(0, 300),
      });
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
      logEvent({
        level: "warn", tag: TAG, msg: "response truncated, partial recovery",
        centers: centers.length, bases: bases.length,
        basisUnits: basisUnits.length, pools: pools.length,
        directAllocations: directAllocations.length,
      });
    }

    // Deterministic schedule verification (gated rollout).
    //
    // When CAP_DETERMINISTIC_SCHEDULES=1, replace AI-extracted basis-unit
    // receiver lists with coordinate-based reads from the PDF for any
    // schedule the deterministic path can resolve. This structurally
    // prevents the row-shift class of bugs (Recreation's FTE landing on
    // Housing because Housing's cell is blank) by matching receivers via
    // dept-text identity rather than zipped row order.
    //
    // The flag defaults off so existing CAP imports are unchanged until
    // the path has been verified against real exhibits. The printedTotal
    // validator already shipped (lib/ai/parseCap.ts) remains the
    // import-layer backstop regardless of which path produced the units.
    if (process.env.CAP_DETERMINISTIC_SCHEDULES === "1" && basisUnits.length > 0) {
      try {
        const basisNamesForSemantics = basisUnits
          .map((row) => row.basis?.trim())
          .filter((s): s is string => Boolean(s));
        const semantics = await aiBasisColumnSemantics(
          client,
          MODEL,
          pdfBase64,
          basisNamesForSemantics,
          req.signal,
        );
        const semanticByBasis = new Map(
          semantics.map((s) => [basisNameKey(s.basis), s]),
        );
        const itemsByPage = await loadPdfItemsByPage(new Uint8Array(pdfBuffer.slice(0)));

        let resolvedCount = 0;
        let fallbackCount = 0;
        const nextBasisUnits: BasisUnitsRow[] = [];
        for (const row of basisUnits) {
          const basisName = row.basis?.trim() ?? "";
          const semantic = semanticByBasis.get(basisNameKey(basisName));
          if (!semantic) {
            fallbackCount += 1;
            nextBasisUnits.push(row);
            logEvent({
              tag: TAG,
              msg: "deterministic schedule per-basis",
              basis: basisName,
              path: "ai-fallback",
              reason: "no-semantic",
            });
            continue;
          }
          // CAP allocation-factor schedules routinely span 4-8 pages of
          // receiver rows under one header. Scan a window around the AI's
          // reported page so continuation rows are visible to the matcher.
          // Per-page Y offsetting keeps rows from different pages from
          // collapsing into one cluster (each page's Y restarts at 0).
          const PAGE_WINDOW_BACK = 1;
          const PAGE_WINDOW_FORWARD = 8;
          const PAGE_Y_OFFSET = 10000;
          const pageItems: TextItem[] = [];
          for (let off = -PAGE_WINDOW_BACK; off <= PAGE_WINDOW_FORWARD; off += 1) {
            const p = semantic.page + off;
            if (p < 1) continue;
            const itemsOnPage = itemsByPage.get(p);
            if (!itemsOnPage) continue;
            for (const it of itemsOnPage) {
              pageItems.push({ ...it, y: it.y + (off + PAGE_WINDOW_BACK) * PAGE_Y_OFFSET });
            }
          }
          const aiReceiverCount = Array.isArray(row.receivers) ? row.receivers.length : 0;
          const result = extractReceiverUnitsFromPdf({
            pageItems,
            basisColumnHeader: semantic.basisColumnHeader,
            basisName,
            expectedTotal: row.printedTotal,
            deriveReceiversFromPdf: true,
            receivers: (row.receivers ?? []).map((r) => ({
              dept: r.dept ?? "",
              glCode: r.glCode ?? "",
              deptCode: r.deptCode,
            })),
          });
          if (!result) {
            fallbackCount += 1;
            nextBasisUnits.push(row);
            logEvent({
              tag: TAG,
              msg: "deterministic schedule per-basis",
              basis: basisName,
              path: "ai-fallback",
              reason: "no-header",
              page: semantic.page,
              column_header: semantic.basisColumnHeader,
              ai_receivers: aiReceiverCount,
            });
            continue;
          }
          const deterministicTotal = result.receivers.reduce((sum, receiver) => sum + receiver.units, 0);
          // The schedule's own printed "Grand Total: All Services" row
          // (read deterministically from the same column as the
          // receivers) is more trustworthy than the primary AI parse's
          // printedTotal field for reconciliation — a mis-read AI total
          // would otherwise cause an already-correct deterministic result
          // to be rejected as a "total-mismatch" false positive.
          const reconciliationRow = result.printedTotalFromPdf != null
            ? { ...row, printedTotal: result.printedTotalFromPdf }
            : row;
          const printedTotal = Number(reconciliationRow.printedTotal);
          const hasPrintedTotal = Number.isFinite(printedTotal) && printedTotal > 0;
          const decision = evaluateDeterministicResult(reconciliationRow, result);
          if (!decision.trust) {
            fallbackCount += 1;
            nextBasisUnits.push(row);
            logEvent({
              tag: TAG,
              msg: "deterministic schedule per-basis",
              basis: basisName,
              path: "ai-fallback",
              reason: decision.reason,
              page: semantic.page,
              column_header: semantic.basisColumnHeader,
              ai_receivers: aiReceiverCount,
              resolved_receivers: result.receivers.length,
              blank_receivers: result.blankReceivers.length,
              unmatched_receivers: result.unmatchedReceivers.length,
              deterministic_total: deterministicTotal,
              printed_total: hasPrintedTotal ? printedTotal : undefined,
            });
            continue;
          }
          resolvedCount += 1;
          nextBasisUnits.push({
            ...reconciliationRow,
            source: row.source ?? "Deterministic PDF extraction",
            receivers: result.receivers.map((r) => ({
              dept: r.dept,
              glCode: r.glCode,
              ...(r.deptCode ? { deptCode: r.deptCode } : {}),
              units: r.units,
              confidence: "high" as const,
            })),
          });
          logEvent({
            tag: TAG,
            msg: "deterministic schedule per-basis",
            basis: basisName,
            path: "deterministic",
            page: semantic.page,
            column_header: semantic.basisColumnHeader,
            ai_receivers: aiReceiverCount,
            resolved_receivers: result.receivers.length,
            blank_receivers: result.blankReceivers.length,
            unmatched_receivers: result.unmatchedReceivers.length,
          });
        }
        basisUnits = nextBasisUnits;
        logEvent({
          tag: TAG,
          msg: "deterministic schedule verification",
          resolved_count: resolvedCount,
          fallback_count: fallbackCount,
          semantic_count: semantics.length,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        // Any failure in the deterministic path is non-fatal — fall
        // through to the existing AI path. The flag-gated rollout means
        // we'd rather log and continue than break the existing import.
        logEvent({
          level: "warn",
          tag: TAG,
          msg: "deterministic schedule verification failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const missingSchedules = missingScheduleBasisNames(
      bases, basisUnits, pools, directAllocations,
    );
    if (missingSchedules.length > 0) {
      logEvent({
        tag: TAG,
        msg: "basis schedule recovery start",
        missing_schedule_count: missingSchedules.length,
      });
      for (let i = 0; i < missingSchedules.length; i += SCHEDULE_BATCH_SIZE) {
        const batch = missingSchedules.slice(i, i + SCHEDULE_BATCH_SIZE);
        try {
          const scheduleResponse = await client.messages.create({
            model: MODEL,
            max_tokens: 32000,
            system: scheduleSystem(batch, profile),
            messages: [{
              role: "user",
              content: [{
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              }],
            }],
          }, { signal: req.signal });
          const scheduleText =
            scheduleResponse.content.find((content) => content.type === "text")?.text ?? "";
          const recovered = alignRecoveredBasisNames(
            parseBasisUnitsResponse(scheduleText),
            batch,
          );
          basisUnits = mergeBasisUnits(basisUnits, recovered);
          logEvent({
            tag: TAG,
            msg: "basis schedule recovery batch",
            requested_count: batch.length,
            recovered_count: recovered.filter(validSchedule).length,
            output_tokens: scheduleResponse.usage.output_tokens,
            stop_reason: scheduleResponse.stop_reason,
          });
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw err;
          logEvent({
            level: "warn",
            tag: TAG,
            msg: "basis schedule recovery failed",
            requested_count: batch.length,
            error: err instanceof Error ? err.message : "Unknown recovery error",
          });
        }
      }
    }

    logEvent({
      tag: TAG, msg: "parsed bundle",
      centers: centers.length, bases: bases.length,
      basisUnits: basisUnits.length, pools: pools.length,
      directAllocations: directAllocations.length,
      file: fileName,
      cap_profile: profile.id,
    });
    return json({ ok: true, centers, bases, basisUnits, pools, directAllocations });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Unknown model error.";
    logEvent({
      level: aborted ? "info" : "error",
      tag: TAG,
      msg: aborted ? "request aborted by client" : "anthropic error",
      error: message,
      latency_ms: Date.now() - t0,
    });
    return json({ ok: false, message }, { status: aborted ? 499 : 502 });
  }
}
