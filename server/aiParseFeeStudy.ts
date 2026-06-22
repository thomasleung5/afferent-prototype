/* Composite "Fee Study" PDF importer.
 *
 * Fee Study is not a new data domain — it's an optional composite upload
 * surface for one PDF that may mix Services, Staffing, Volume, and Fee
 * Schedule data in a single document. This route extracts all four
 * sections in one pass and hands each section's rows back in EXACTLY the
 * wire shape the four existing single-domain endpoints already return
 * (`ServiceRow[]`, `PositionRow[]`, `VolumeItem[]`, `FeeRow[]`), so the
 * client applies them through the existing converters/merges — never a
 * parallel calc/merge path.
 *
 * Hybrid pipeline, same philosophy as server/aiParseCap.ts +
 * server/capDeterministicSchedules.ts:
 *   1. One primary AI call extracts full rows (identity + AI-transcribed
 *      values) for every section present. This alone is a complete,
 *      correct AI-only extraction — the deterministic pass below is a
 *      pure accuracy upgrade layered on top, never a replacement.
 *   2. Behind FEE_STUDY_DETERMINISTIC=1, a small follow-up call asks only
 *      "what page, what column header" per section present (reuses the
 *      cached PDF — no re-billing).
 *   3. Deterministic coordinate-reading (server/feeStudyDeterministicTables)
 *      overrides individual numeric FIELDS when it can confidently resolve
 *      them; every failure point falls back to the AI's own value. */

import Anthropic from "@anthropic-ai/sdk";
import { readPdfUpload } from "./aiUploadValidator";
import { extractTextItems, type TextItem } from "./pdfTableExtract";
import {
  aiFeeStudyColumnSemantics, groupItemsByPage, itemsAroundPage,
  resolveDeterministicFields, volumeGrandTotalCheck,
  type FeeStudyTableDomain, type ResolveFieldsResult,
} from "./feeStudyDeterministicTables";
import { logEvent } from "./logger";

const TAG = "ai-parse-fee-study";
const MODEL = "claude-sonnet-4-6";

interface ServiceRow {
  name: string;
  dept: string;
  hours: number;
  volume?: number;
  fee?: number;
  target?: number;
  confidence: "high" | "low";
}

interface PositionRow {
  title: string;
  dept: string;
  fte: number;
  hours: number;
  confidence: "high" | "low";
}

interface VolumeItem {
  name: string;
  dept: string;
  prior?: number | null;
  current?: number | null;
  unit?: string;
  confidence: "high" | "low";
}

interface FeeRow {
  name: string;
  dept: string;
  unit?: string;
  fee: number;
  confidence: "high" | "low";
}

const DEPT_ENUM = `"ADMIN" (Administration), "CLK" (Clerk), "FIN" (Finance), "HR" (Human Resources), "IT" (Information Technology), "LEGAL" (Legal), "BLDG" (Building), "PLAN" (Planning), "ENG" (Engineering), "CODE" (Code Enforcement), "FIRE" (Fire), "PW" (Public Works), "TRANS" (Transportation), "ENV" (Environmental Services), "UTIL" (Utilities), "PD" (Police), "PARKS" (Parks & Recreation), "LIB" (Library), "ANIMAL" (Animal Services), "HOUSING" (Housing), "ECON" (Economic Development), "HEALTH" (Public Health), "COMMUNITY" (Community Services), "AIR_HARBOR" (Airport / Harbor), or "GEN_GOV" (General Government)`;

const BASE_SYSTEM = `You are extracting FOUR independent sections from a municipal fee study, cost-of-service study, or annual report PDF. The document may contain some or all of these sections — populate ONLY the arrays for sections present; omit (return an empty array) for sections that are absent. Sections never share rows: a services row, a positions row, a volume row, and a fees row are never the same printed line.

================================================================
SECTION 1 — Services (services[])
================================================================
Extract every service line item. Each row:
{ "name": "Site Development Hearing Review", "dept": "PLAN", "hours": 3.5, "volume": 45, "fee": 4160, "target": 100, "confidence": "high" }
- dept must be exactly one of: ${DEPT_ENUM}
- hours is staff hours per service occurrence (fully-burdened hours, not clock hours)
- volume is annual service count or permit count — plain number, no commas
- fee is the current adopted fee as a plain number — no $ or commas
- target is recovery % as 0-100 (e.g. 100 = full cost recovery), omit if not stated
- confidence: "high" if certain, "low" if dept, hours, or volume is ambiguous or estimated
- Skip section headers, subtotals, grand totals, notes, and blank rows
- If hours are not shown but a unit cost and FBHR are shown, compute hours = unit_cost / FBHR

================================================================
SECTION 2 — Staffing / Positions (positions[])
================================================================
Extract the staff position roster (role + dept + FTE + productive hours) — salary/benefit dollar amounts are NOT in scope, those are extracted separately from the Operating Budget. Skip narrative chapters, methodology sections, executive summaries, and recommendation tables; focus on sections titled "Staffing Plan", "Position Listing", "Staff Roster", appendices labeled "Staffing" or "Labor", or any tabular section listing individual positions. Each row:
{ "title": "Senior Planner", "dept": "PLAN", "fte": 0.80, "hours": 1720, "confidence": "high" }
- dept must be exactly one of: ${DEPT_ENUM}
- Only include positions assigned to those fee-supported departments — skip positions in unrelated departments.
- fte is the full-time equivalent allocation to fee services (0.0-1.0) — if not stated assume 1.0
- hours is productive hours per year per FTE — default to 1720 if not stated
- Do NOT extract salary, benefits, or any dollar amount — leave those fields off entirely.
- confidence: "high" if title, dept, FTE, and hours are all clear; "low" if any are ambiguous or estimated
- Skip totals, subtotals, vacant positions, and summary rows
- Use the exact position title as written

================================================================
SECTION 3 — Volume of Activity (items[])
================================================================
Extract service-volume / workload counts — only rows that COUNT units of service activity. Skip narrative chapters, methodology sections, executive summaries, recommendation tables, financial tables, fee tables, revenue summaries, and rate-derivation tables; focus on sections titled "Volume of Activity", "Workload", "Service Volumes", "Annual Activity", "Permit Volume", "Application Counts", "Transactions", "Activity Report", "Year-over-Year Activity", or any tabular section listing individual services with annual unit counts. Each row:
{ "name": "Building Permit — Single-Family Residential", "dept": "BLDG", "prior": 142, "current": 165, "unit": "permits", "confidence": "high" }
- dept must be exactly one of: ${DEPT_ENUM}
- ONLY include rows whose department is one of those fee-supported departments.
- name must be the EXACT service description as written in the document. Do NOT abbreviate, expand, paraphrase, or reword — downstream client-side matching depends on the name matching the catalog character-for-character.
- prior is the prior-year (or baseline) volume as a plain integer with commas stripped. If only one year is reported, set prior to null.
- current is the current-year (or most-recent) volume as a plain integer with commas stripped. If only one year is reported, populate current and leave prior null.
- SKIP rows whose volume cell is a range, a percentage, a year-over-year delta, text, or non-numeric. Skip rows whose volume is zero or missing.
- unit is a short noun describing what is being counted ("permits", "applications", "reviews", "inspections", "hearings", "transactions", "encroachments", etc). Default to "units" only when the document does not state one.
- confidence: "high" only when name, dept, and at least one of prior/current are unambiguous; "low" if any field is ambiguous, estimated, inferred, or footnoted
- SKIP totals, subtotals, grand totals, "Department Total" rows, fund totals, percent-change rows, header rows, and blank rows
- SKIP narrative-style rows (single sentences without a tabular count)

================================================================
SECTION 4 — Fee Schedule (fees[])
================================================================
Extract every fee line item. The fields you extract are limited to the fee identity (name, dept), the pricing unit, and the current adopted amount — downstream software calculates Fee #, Cost, Recommended rate, Recovery %, and Impact, so do NOT attempt to surface those. Each row:
{ "name": "Site Development Hearing Review", "dept": "PLAN", "unit": "each", "fee": 4160, "confidence": "high" }
- dept must be exactly one of: ${DEPT_ENUM}
- unit is the FEE PRICING unit as written in the document — verbatim short label like "each", "per hour", "per $1,000 valuation", "deposit", "per page", "per parcel". Omit the field if the document does not specify one.
- fee is the current adopted fee as a plain number — no $ or commas
- Do NOT extract or invent Fee #, Cost, Recommended rate, Recovery %, Impact, peer-city comparison values, or recovery target % — those are software-determined downstream.
- confidence: "high" if name, dept, and amount are all clear; "low" if any are ambiguous
- Skip section headers, subtotals, grand totals, notes, and blank rows
- Use the exact fee name as written

Return ONLY this JSON, no prose:
{ "services": [...], "positions": [...], "items": [...], "fees": [...] }`;

function buildSystem(catalogEntries: { name: string; dept: string }[]): string {
  if (catalogEntries.length === 0) return BASE_SYSTEM;
  const list = catalogEntries.map((e) => `  - ${e.name} (${e.dept})`).join("\n");
  return `${BASE_SYSTEM}

IMPORTANT — existing service catalog (you MUST use these exact names in Section 1 when there is a match):
${list}

When a row in the PDF clearly corresponds to a catalog entry, use the catalog name verbatim in your "services" output even if the PDF spells it differently. Only use a name from the PDF directly when there is no reasonable catalog match.`;
}

interface FeeStudySections {
  services: unknown[];
  positions: unknown[];
  items: unknown[];
  fees: unknown[];
}

function sectionSpan(text: string, key: string, nextKeys: string[]): string {
  const startMatch = text.match(new RegExp(`"${key}"\\s*:`));
  if (!startMatch || startMatch.index == null) return "";
  const start = startMatch.index + startMatch[0].length;
  let end = text.length;
  for (const nextKey of nextKeys) {
    const m = text.slice(start).match(new RegExp(`"${nextKey}"\\s*:`));
    if (m && m.index != null) {
      const candidate = start + m.index;
      if (candidate < end) end = candidate;
    }
  }
  return text.slice(start, end);
}

function parseSectionOrRecover(text: string, key: string, anchor: string, nextKeys: string[]): unknown[] {
  const span = sectionSpan(text, key, nextKeys);
  if (!span) return [];
  const arrayMatch = span.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to per-row recovery */
    }
  }
  const anchorPattern = new RegExp(`\\{[^{}]*"${anchor}"\\s*:[^{}]*\\}`, "g");
  const rows: unknown[] = [];
  for (const m of span.matchAll(anchorPattern)) {
    try { rows.push(JSON.parse(m[0])); } catch { /* skip malformed */ }
  }
  return rows;
}

/** Parse the combined 4-section response. Tries a single whole-object
 *  parse first (the common case); falls back to per-section scoped
 *  recovery only when that fails (truncation). Each section is recovered
 *  independently — a truncated `fees` array doesn't void an intact
 *  `services` array. Exported for fixture testing. */
export function parseFeeStudyResponse(text: string): FeeStudySections | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  const whole = jsonMatch[0];
  try {
    const parsed = JSON.parse(whole) as Record<string, unknown>;
    return {
      services: Array.isArray(parsed.services) ? parsed.services : [],
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      fees: Array.isArray(parsed.fees) ? parsed.fees : [],
    };
  } catch {
    /* truncated — recover per section below */
  }
  const recovered: FeeStudySections = {
    services: parseSectionOrRecover(whole, "services", "name", ["positions", "items", "fees"]),
    positions: parseSectionOrRecover(whole, "positions", "title", ["items", "fees"]),
    items: parseSectionOrRecover(whole, "items", "name", ["fees"]),
    fees: parseSectionOrRecover(whole, "fees", "name", []),
  };
  const total = recovered.services.length + recovered.positions.length
    + recovered.items.length + recovered.fees.length;
  return total > 0 ? recovered : null;
}

type RowWithConfidence = { confidence: "high" | "low"; [key: string]: unknown };

interface FieldAccessor {
  get: (row: RowWithConfidence) => number | null | undefined;
  set: (row: RowWithConfidence, value: number) => void;
}

function numericAccessor(field: string): FieldAccessor {
  return {
    get: (row) => {
      const v = row[field];
      return typeof v === "number" ? v : null;
    },
    set: (row, value) => { row[field] = value; },
  };
}

const FIELD_ACCESSORS: Record<FeeStudyTableDomain, Record<string, FieldAccessor>> = {
  services: {
    hours: numericAccessor("hours"),
    volume: numericAccessor("volume"),
    fee: numericAccessor("fee"),
  },
  positions: {
    fte: numericAccessor("fte"),
    // The semantics prompt asks for "positionHours" (distinct key from
    // services' "hours") to avoid ambiguity in the AI's own reasoning even
    // though each domain's columns map is independent — maps back onto
    // the PositionRow's `hours` field here.
    positionHours: numericAccessor("hours"),
  },
  volume: {
    prior: numericAccessor("prior"),
    current: numericAccessor("current"),
  },
  fees: {
    fee: numericAccessor("fee"),
  },
};

/** Apply resolved deterministic field values onto the AI rows, in place.
 *  When a deterministic value disagrees with the AI's own transcribed
 *  value for the same field by more than a generous tolerance, downgrade
 *  that row's confidence to "low" (independent reads disagreeing is a
 *  signal worth surfacing) — the deterministic value still wins, since it
 *  comes from reading the cell directly rather than asking a model to
 *  transcribe it. Rows with no AI value to compare against are applied
 *  without a disagreement check. */
function applyDeterministicOverrides(
  domain: FeeStudyTableDomain,
  rows: RowWithConfidence[],
  result: ResolveFieldsResult,
): void {
  const accessors = FIELD_ACCESSORS[domain];
  for (const r of result.resolved) {
    const accessor = accessors[r.field];
    if (!accessor) continue;
    const row = rows[r.rowIndex];
    if (!row) continue;
    const aiValue = accessor.get(row);
    if (typeof aiValue === "number" && Number.isFinite(aiValue)) {
      const tolerance = Math.max(1, Math.abs(aiValue) * 0.01);
      if (Math.abs(r.value - aiValue) > tolerance) {
        row.confidence = "low";
        logEvent({
          level: "warn", tag: TAG, msg: "fee-study value disagreement",
          domain, field: r.field, ai_value: aiValue, deterministic_value: r.value,
        });
      }
    }
    accessor.set(row, r.value);
  }
}

function rowName(domain: FeeStudyTableDomain, row: Record<string, unknown>): string {
  const raw = domain === "positions" ? row.title : row.name;
  return typeof raw === "string" ? raw : "";
}

function json(body: Record<string, unknown>, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function handleAiParseFeeStudy(req: Request): Promise<Response> {
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
  const { form, fileName, fileSizeKb, base64: pdfBase64, buffer: pdfBuffer } = upload;

  const catalogRaw = form.get("catalog");
  const catalog = typeof catalogRaw === "string" && catalogRaw
    ? JSON.parse(catalogRaw) as { name: string; dept: string }[]
    : [];
  const system = buildSystem(catalog);

  const deterministicEnabled = process.env.FEE_STUDY_DETERMINISTIC === "1";

  logEvent({
    tag: TAG, msg: "anthropic request start",
    file: fileName, file_kb: fileSizeKb, model: MODEL,
  });
  const t0 = Date.now();

  const client = new Anthropic({ apiKey, timeout: 10 * 60 * 1000 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{
        role: "user",
        content: [{
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          // Re-sent to the column-semantics call below — caching this
          // document block lets that call read it from Anthropic's cache
          // instead of re-billing the full document as fresh input tokens.
          cache_control: { type: "ephemeral" },
        }],
      }],
    }, { signal: req.signal });

    const elapsed_ms = Date.now() - t0;
    const text = response.content.find((c) => c.type === "text")?.text ?? "";
    logEvent({
      tag: TAG, msg: "anthropic response",
      latency_ms: elapsed_ms,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    const sections = parseFeeStudyResponse(text);
    if (!sections) {
      logEvent({
        level: "error", tag: TAG, msg: "no recoverable sections in model response",
        raw_preview: text.slice(0, 300),
      });
      return json({
        ok: false,
        message: "Response was truncated and no complete rows could be recovered. Try a shorter document.",
      }, { status: 502 });
    }

    const services = sections.services as ServiceRow[];
    const positions = sections.positions as PositionRow[];
    const items = sections.items as VolumeItem[];
    const fees = sections.fees as FeeRow[];

    logEvent({
      tag: TAG, msg: "parsed sections", file: fileName,
      services: services.length, positions: positions.length,
      volume: items.length, fees: fees.length,
    });

    if (deterministicEnabled) {
      try {
        let pdfItemsPromise: Promise<TextItem[]> | null = null;
        const getPdfItems = (): Promise<TextItem[]> => {
          pdfItemsPromise ??= extractTextItems(new Uint8Array(pdfBuffer.slice(0)));
          return pdfItemsPromise;
        };

        const domainRows: Record<FeeStudyTableDomain, RowWithConfidence[]> = {
          services: services as unknown as RowWithConfidence[],
          positions: positions as unknown as RowWithConfidence[],
          volume: items as unknown as RowWithConfidence[],
          fees: fees as unknown as RowWithConfidence[],
        };
        const domainsPresent = (Object.keys(domainRows) as FeeStudyTableDomain[])
          .filter((d) => domainRows[d].length > 0);

        const semantics = await aiFeeStudyColumnSemantics(
          client, MODEL, pdfBase64, domainsPresent, req.signal,
        );
        const semanticByDomain = new Map(semantics.map((s) => [s.domain, s]));
        const itemsByPage = groupItemsByPage(await getPdfItems());

        for (const domain of domainsPresent) {
          const semantic = semanticByDomain.get(domain);
          if (!semantic) {
            logEvent({ tag: TAG, msg: "deterministic fee-study per-domain", domain, path: "ai-fallback", reason: "no-semantic" });
            continue;
          }
          const pageItems = itemsAroundPage(itemsByPage, semantic.page, { back: 0, forward: 4 });
          const rows = domainRows[domain];
          const result = resolveDeterministicFields({
            pageItems,
            columns: semantic.columns,
            rows: rows.map((r) => ({ name: rowName(domain, r) })),
          });
          if (!result) {
            logEvent({
              tag: TAG, msg: "deterministic fee-study per-domain", domain,
              path: "ai-fallback", reason: "no-header", page: semantic.page,
            });
            continue;
          }

          applyDeterministicOverrides(domain, rows, result);

          if (domain === "volume" && result.fieldColumnIndex.current != null) {
            const currentSum = result.resolved
              .filter((r) => r.field === "current")
              .reduce((sum, r) => sum + r.value, 0);
            const check = volumeGrandTotalCheck(result.table, result.fieldColumnIndex.current, currentSum);
            if (check && !check.matches) {
              for (const r of result.resolved.filter((r) => r.field === "current")) {
                rows[r.rowIndex].confidence = "low";
              }
              logEvent({
                level: "warn", tag: TAG, msg: "fee-study volume total mismatch",
                printed_total: check.printedTotal, resolved_total: currentSum,
              });
            }
          }

          logEvent({
            tag: TAG, msg: "deterministic fee-study per-domain", domain,
            path: "deterministic", page: semantic.page,
            resolved: result.resolved.length, unmatched: result.unmatchedRowIndices.length,
          });
        }
      } catch (err) {
        // Deterministic pass is a pure accuracy upgrade — any failure in
        // it (pdfjs error, malformed semantics response) falls back to
        // the AI-only rows already in hand, never a hard error.
        logEvent({
          level: "warn", tag: TAG, msg: "deterministic fee-study pass failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return json({ ok: true, services, positions, items, fees });
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
