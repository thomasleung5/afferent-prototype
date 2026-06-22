// Deterministic Fee Study table extraction.
//
// Mirrors the CAP hybrid pipeline (server/capDeterministicSchedules.ts):
//
//   1. The primary Fee Study AI parse runs first and returns full rows for
//      each domain present (services/positions/volume/fees), with the AI's
//      own transcribed numeric values. The AI is trustworthy for IDENTITY
//      (name/title, dept) — its numeric transcription is a fine baseline but
//      benefits from a deterministic cross-check.
//   2. A focused semantic AI call asks, per domain present: "what page is
//      the table on, and what's the exact column-header text for each
//      numeric field?"
//   3. This module then reads each field's cell deterministically: locate
//      the table by header-text match, build a column-aligned Table, find
//      each row by NAME match (not glCode — these rows have no coded
//      identifier, just a printed name), and read the requested column's
//      cell.
//
// One deliberate divergence from CAP: CAP resolves exactly one Value column
// per schedule, so a blank cell drops the whole receiver. Fee Study rows can
// have several independent numeric fields (a Services row has hours, volume,
// AND fee) — a blank `volume` cell must not discard a successfully-read
// `fee` on the same row. Resolution here is per FIELD, not per ROW.

import {
  clusterRows, tableFromRows, type TextItem,
} from "./pdfTableExtract";

export type FeeStudyTableDomain = "services" | "positions" | "volume" | "fees";

export interface FeeStudyColumnSemantic {
  domain: FeeStudyTableDomain;
  /** 1-indexed page where this domain's gridded table begins. */
  page: number;
  /** Exact printed column-header text per numeric field this domain
   *  needs, keyed by field name. Fields the table has no dedicated
   *  column for are simply omitted. */
  columns: Partial<Record<string, string>>;
}

interface AnthropicMessageParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{
    role: "user";
    content: Array<{
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
      cache_control?: { type: "ephemeral" };
    }>;
  }>;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

interface AnthropicLike {
  messages: {
    create(
      params: AnthropicMessageParams,
      options?: { signal?: AbortSignal },
    ): Promise<AnthropicMessageResponse>;
  };
}

const DOMAIN_FIELD_GUIDANCE: Record<FeeStudyTableDomain, string> = {
  services: "report columns.hours (Hours/FBHR-hours column), columns.volume (Annual Volume column), columns.fee (Current Fee column)",
  positions: "report columns.fte (FTE column), columns.positionHours (Productive Hours column)",
  volume: "report columns.prior (prior-year column), columns.current (current-year column)",
  fees: "report columns.fee (Current Fee / Adopted Fee column)",
};

export function buildFeeStudySemanticSystem(domains: FeeStudyTableDomain[]): string {
  const sections = domains
    .map((d) => `- ${d}: ${DOMAIN_FIELD_GUIDANCE[d]} — omit any column the table doesn't have a dedicated header for.`)
    .join("\n");
  return `You are identifying which page and column headers carry each section's numeric data in a municipal fee study / cost-of-service PDF.

These documents typically repeat the same data in multiple places (a narrative summary mentioning a number, and ALSO a real gridded table further in the document with one row per service/position/activity and a column per numeric field). You must report the page of the GRIDDED TABLE, not a narrative mention. Identify it by this shape: a header row with several column labels, and data rows below it, each beginning with a service/position name or identity column.

For each section below that is present in the document, report the 1-indexed page where its gridded table begins, and the EXACT column header text (preserve capitalization and punctuation) for each numeric field listed:

${sections}

Return ONLY this JSON:
{
  "schedules": [
    { "domain": "fees", "page": 12, "columns": { "fee": "FY24-25 Adopted Fee" } }
  ]
}

Rules:
- Use the EXACT text as printed.
- Omit a domain entirely if its gridded table cannot be confidently located.
- Omit a column key if that field has no dedicated column in the table.
- Do not invent header text. If unsure, omit.
- Return JSON only, no prose.`;
}

export function parseFeeStudySemanticResponse(text: string): FeeStudyColumnSemantic[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { schedules?: unknown };
    if (!Array.isArray(parsed.schedules)) return [];
    return parsed.schedules.flatMap((row): FeeStudyColumnSemantic[] => {
      if (typeof row !== "object" || row == null) return [];
      const r = row as { domain?: unknown; page?: unknown; columns?: unknown };
      const domain = typeof r.domain === "string" ? r.domain : "";
      if (domain !== "services" && domain !== "positions" && domain !== "volume" && domain !== "fees") return [];
      const page = Number(r.page);
      if (!Number.isInteger(page) || page < 1) return [];
      const columnsRaw = typeof r.columns === "object" && r.columns != null ? r.columns as Record<string, unknown> : {};
      const columns: Partial<Record<string, string>> = {};
      for (const [key, value] of Object.entries(columnsRaw)) {
        if (typeof value === "string" && value.trim()) columns[key] = value.trim();
      }
      return [{ domain, page, columns }];
    });
  } catch {
    return [];
  }
}

/** Ask Anthropic for { page, columns } per domain present. Returns an
 *  empty array on AI failure — the caller falls back to AI-extracted
 *  values for every domain in that case. Reuses the same cached PDF
 *  document block the primary parse call already wrote, so this call
 *  reads from Anthropic's cache instead of re-billing the document. */
export async function aiFeeStudyColumnSemantics(
  client: AnthropicLike,
  model: string,
  pdfBase64: string,
  domains: FeeStudyTableDomain[],
  signal?: AbortSignal,
): Promise<FeeStudyColumnSemantic[]> {
  if (domains.length === 0) return [];
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: buildFeeStudySemanticSystem(domains),
    messages: [{
      role: "user",
      content: [{
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        cache_control: { type: "ephemeral" },
      }],
    }],
  }, signal ? { signal } : undefined);
  const text = response.content.find((c) => c.type === "text")?.text ?? "";
  return parseFeeStudySemanticResponse(text);
}

export function groupItemsByPage(items: TextItem[]): Map<number, TextItem[]> {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const list = byPage.get(item.page);
    if (list) list.push(item);
    else byPage.set(item.page, [item]);
  }
  return byPage;
}

/** Gather text items around a reported page, offsetting each page's Y
 *  coordinates so a multi-page table's continuation rows are visible to
 *  the row clusterer without different pages' rows collapsing together. */
export function itemsAroundPage(
  itemsByPage: Map<number, TextItem[]>,
  page: number,
  opts?: { back?: number; forward?: number },
): TextItem[] {
  const back = opts?.back ?? 0;
  const forward = opts?.forward ?? 4;
  const Y_OFFSET = 10000;
  const out: TextItem[] = [];
  for (let off = -back; off <= forward; off += 1) {
    const p = page + off;
    if (p < 1) continue;
    const itemsOnPage = itemsByPage.get(p);
    if (!itemsOnPage) continue;
    for (const it of itemsOnPage) {
      out.push({ ...it, y: it.y + (off + back) * Y_OFFSET });
    }
  }
  return out;
}

/** Find a table row whose identity-column text matches a row's printed
 *  name. Simpler than CAP's findReceiverRow: there is no coded
 *  identifier to match first (services/volume/fees/positions rows are
 *  identified purely by their printed name text), so this cascade starts
 *  one tier looser than CAP's.
 *
 *   1. Normalized strict substring (lowercase, non-alphanumeric stripped)
 *   2. Qualifier-stripped substring — strips trailing parenthetical/dash
 *      annotations (" (typ.)", " - SFR") before normalizing, handling
 *      "Building Permit - New SFR" (AI) vs "Building Permit (New SFR)" (PDF)
 *   3. All-significant-tokens-present AND uniquely matching exactly one
 *      row — refuse (return -1) if ambiguous, never guess.
 *
 *  Returns -1 when no row matches uniquely. */
export function findRowByName(
  tableRows: string[][],
  name: string,
  identityColumnEnd = Number.POSITIVE_INFINITY,
): number {
  const targetStrict = normalizeNameText(name);
  if (!targetStrict) return -1;
  const rowsNorm = tableRows.map((row) => normalizeNameText(row.slice(0, identityColumnEnd).join(" ")));
  const strictMatches = matchIndices(rowsNorm, (cell) => cell.includes(targetStrict));
  if (strictMatches.length === 1) return strictMatches[0];
  if (strictMatches.length > 1) return -1;

  const targetStripped = normalizeNameTextStripped(name);
  if (targetStripped.length >= 3) {
    const rowsStripped = tableRows.map((row) => normalizeNameTextStripped(row.slice(0, identityColumnEnd).join(" ")));
    const strippedMatches = matchIndices(rowsStripped, (cell) => cell.includes(targetStripped));
    if (strippedMatches.length === 1) return strippedMatches[0];
    if (strippedMatches.length > 1) return -1;
  }

  const targetTokens = nameTokens(name);
  if (targetTokens.length === 0) return -1;
  const tokenMatches: number[] = [];
  for (let r = 0; r < tableRows.length; r += 1) {
    const rowTokens = nameTokens(tableRows[r].slice(0, identityColumnEnd).join(" "));
    if (targetTokens.every((token) => rowTokens.includes(token))) tokenMatches.push(r);
  }
  return tokenMatches.length === 1 ? tokenMatches[0] : -1;
}

function matchIndices(values: string[], pred: (v: string) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (pred(values[i])) out.push(i);
  }
  return out;
}

function normalizeNameText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Strips trailing parenthetical/dash qualifiers before normalizing —
 *  tuned for service/fee names, not CAP's dept-suffix stripper. */
function normalizeNameTextStripped(text: string): string {
  const stripped = text
    .replace(/\([^)]*\)/g, "")
    .replace(/[-–—]\s*[a-z0-9./ ]+$/i, "")
    .trim();
  return normalizeNameText(stripped);
}

function nameTokens(text: string): string[] {
  return normalizeNameTextStripped(text)
    .match(/[a-z0-9]+/g)
    ?.filter((t) => t.length >= 3) ?? [];
}

/** Parse a numeric cell. Returns null on blank, dash, or non-numeric
 *  content. Strips currency / thousands separators. */
export function parseNumericCell(cell: string): number | null {
  const trimmed = cell.trim();
  if (!trimmed) return null;
  if (trimmed === "-" || trimmed === "—" || trimmed === "–") return null;
  const cleaned = trimmed.replace(/[\s,$]/g, "");
  if (!cleaned) return null;
  if (/^\(.*\)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeHeaderText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface ResolveFieldsRow {
  /** Row identity used for matching — the printed name/title. */
  name: string;
}

export interface ResolveFieldsInput {
  /** Text items from the page(s) where this domain's table lives. */
  pageItems: TextItem[];
  /** Map of field name -> exact column header text, from the semantics
   *  call. Only fields present here are candidates for override. */
  columns: Partial<Record<string, string>>;
  rows: ResolveFieldsRow[];
}

export interface ResolvedFieldValue {
  rowIndex: number;
  field: string;
  value: number;
}

export interface ResolveFieldsResult {
  resolved: ResolvedFieldValue[];
  /** Row indices whose name could not be uniquely matched to a PDF row —
   *  every field on these rows stays AI-only. */
  unmatchedRowIndices: number[];
  /** The deterministically-read table, exposed so callers can run a
   *  grand-total backstop (e.g. Volume) without re-extracting it. */
  table: { headers: string[]; rows: string[][] };
  /** field -> resolved column index in `table`, exposed so callers can
   *  locate a specific field's column for a backstop check (e.g. Volume's
   *  grand-total check needs the `current` column index). */
  fieldColumnIndex: Record<string, number>;
}

/** Locate a domain's table by column header text, then for every input
 *  row find its PDF row by name and read each requested field's cell.
 *  Returns null only when NO requested column header can be located on
 *  the page at all — callers then keep the AI values for the whole
 *  domain. Per-row or per-field misses inside a located table do not
 *  return null; they're reported via `unmatchedRowIndices` / simply
 *  absent from `resolved`, and the caller keeps the AI value for just
 *  that row/field. */
export function resolveDeterministicFields(
  input: ResolveFieldsInput,
): ResolveFieldsResult | null {
  const { pageItems, columns, rows } = input;
  if (pageItems.length === 0 || rows.length === 0) return null;

  const fieldEntries = Object.entries(columns).filter(([, header]) => !!header) as [string, string][];
  if (fieldEntries.length === 0) return null;

  const clustered = clusterRows(pageItems);
  if (clustered.length < 2) return null;

  // Find the header row: the row containing the most requested column
  // headers (normalized substring match against each cell).
  const normalizedTargets = fieldEntries.map(([field, header]) => [field, normalizeHeaderText(header)] as const);
  let bestRowIndex = -1;
  let bestHitCount = 0;
  for (let r = 0; r < clustered.length; r += 1) {
    const cellsNorm = clustered[r].map((it) => normalizeHeaderText(it.text));
    let hits = 0;
    for (const [, normTarget] of normalizedTargets) {
      if (cellsNorm.some((c) => c === normTarget || (normTarget.length >= 3 && c.includes(normTarget)))) hits += 1;
    }
    if (hits > bestHitCount) {
      bestHitCount = hits;
      bestRowIndex = r;
    }
  }
  if (bestRowIndex < 0 || bestHitCount === 0) return null;

  const table = tableFromRows(clustered, bestRowIndex);
  if (table.headers.length === 0) return null;

  const headersNorm = table.headers.map(normalizeHeaderText);
  const fieldColumnIndex = new Map<string, number>();
  for (const [field, normTarget] of normalizedTargets) {
    let idx = headersNorm.findIndex((h) => h === normTarget);
    if (idx < 0) idx = headersNorm.findIndex((h) => normTarget.length >= 3 && h.includes(normTarget));
    if (idx >= 0) fieldColumnIndex.set(field, idx);
  }
  if (fieldColumnIndex.size === 0) return null;

  // Identity columns end where the first resolved value column begins —
  // names/titles never appear past that point, which keeps row matching
  // from accidentally matching against numeric cell text.
  const identityColumnEnd = Math.min(...fieldColumnIndex.values());

  const resolved: ResolvedFieldValue[] = [];
  const unmatchedRowIndices: number[] = [];
  rows.forEach((row, rowIndex) => {
    const matchedRow = findRowByName(table.rows, row.name, identityColumnEnd);
    if (matchedRow < 0) {
      unmatchedRowIndices.push(rowIndex);
      return;
    }
    let anyResolved = false;
    for (const [field, colIndex] of fieldColumnIndex) {
      const cell = table.rows[matchedRow][colIndex] ?? "";
      const value = parseNumericCell(cell);
      if (value != null) {
        resolved.push({ rowIndex, field, value });
        anyResolved = true;
      }
    }
    if (!anyResolved) unmatchedRowIndices.push(rowIndex);
  });

  return {
    resolved, unmatchedRowIndices, table,
    fieldColumnIndex: Object.fromEntries(fieldColumnIndex),
  };
}

/** Volume-only backstop: look for a "Total" row immediately following the
 *  data rows in the deterministically-read table and compare it against
 *  the sum of resolved `current` values, with the same tolerance as CAP's
 *  printedTotal validator. Not implemented for services/positions/fees —
 *  those domains don't reliably print a meaningful grand total of
 *  fees/hours/FTE across unrelated line items, so there's no real signal
 *  to validate against. Returns null when no total row is found (nothing
 *  to check, not a failure). */
export function volumeGrandTotalCheck(
  table: { headers: string[]; rows: string[][] },
  currentColumnIndex: number,
  resolvedCurrentSum: number,
): { matches: boolean; printedTotal: number } | null {
  const totalRow = table.rows.find((row) => row.some((cell) => /\btotal\b/i.test(cell)));
  if (!totalRow) return null;
  const printedTotal = parseNumericCell(totalRow[currentColumnIndex] ?? "");
  if (printedTotal == null || printedTotal <= 0) return null;
  const tolerance = Math.max(1, Math.abs(printedTotal) * 0.005);
  return { matches: Math.abs(resolvedCurrentSum - printedTotal) <= tolerance, printedTotal };
}
