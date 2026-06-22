import Anthropic from "@anthropic-ai/sdk";
import { FEE_DEPTS } from "../lib/data/departments";
import type { DeptCode } from "../lib/types";
import { readPdfUpload } from "./aiUploadValidator";
import { runPdfParser } from "./aiParseRunner";
import { logEvent } from "./logger";
import {
  clusterRows, extractTextItems, type TextItem,
} from "./pdfTableExtract";

const TAG = "ai-parse-fees";
const MODEL = "claude-sonnet-4-6";

const LEGACY_SYSTEM = `You are parsing a municipal fee schedule PDF. Extract every fee line item and return ONLY this JSON, no prose. The fields you extract are limited to the fee identity (name, dept), the pricing unit, and the current adopted amount — downstream software calculates Fee #, Cost, Recommended rate, Recovery %, and Impact, so do NOT attempt to surface those.

{
  "fees": [
    { "name": "Site Development Hearing Review", "dept": "PLAN", "unit": "each", "fee": 4160, "confidence": "high" },
    { "name": "Building Permit — New SFR", "dept": "BLDG", "unit": "per $1,000 valuation", "fee": 13500, "confidence": "high" },
    { "name": "Erosion Control Inspections", "dept": "ENG", "unit": "per hour", "fee": 210, "confidence": "low" },
    { "name": "Research Fee", "dept": "FIN", "unit": "per 1/2 hour", "fee": 99, "confidence": "high" }
  ]
}

Rules:
- dept must be exactly one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}
- unit is the FEE PRICING unit as written in the document — verbatim short label like "each", "per hour", "per $1,000 valuation", "deposit", "per page", "per parcel". Omit the field if the document does not specify one.
- fee is the current adopted fee as a plain number — no $ or commas
- Do NOT extract or invent the following — they are software-determined downstream:
  * Fee # (auto-numbered)
  * Cost (calculated from cost-of-service)
  * Recommended rate (calculated)
  * Recovery % (calculated)
  * Impact (annual uplift, calculated)
  * Peer-city comparison values
  * Recovery target %
- confidence: "high" if name, dept, and amount are all clear; "low" if any are ambiguous
- Skip section headers, subtotals, grand totals, notes, and blank rows
- Use the exact fee name as written in the document
- Return only the JSON object, nothing else`;

const SEMANTIC_SYSTEM = `You are identifying current-fee columns in municipal fee schedule tables.

Return ONLY this JSON:
{
  "tables": [
    {
      "page": 24,
      "dept": "PLAN",
      "serviceColumnHeader": "Fee Name",
      "unitColumnHeader": "Fee Type / Unit",
      "feeColumnHeader": "Current Fee / Deposit"
    }
  ]
}

Rules:
- Identify tables that list individual current/adopted fee amounts.
- Return page numbers as 1-indexed PDF page numbers.
- dept must be one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}. If the table has a department column, dept may be omitted.
- serviceColumnHeader is required and must be the exact printed header for the fee/service description column.
- feeColumnHeader is required and must be the exact printed header for the CURRENT ADOPTED fee/deposit column.
- Do not choose cost-of-service, recommended fee, recovery %, annual revenue, proposed fee, or comparison columns.
- Other column headers are optional. Include them only when the printed table has that column.
- Do not extract fee rows or numeric values. Only identify table/page/header semantics.`;

export interface FeeRow {
  name: string;
  dept: DeptCode;
  unit?: string;
  fee: number;
  confidence: "high" | "low";
}

export interface FeeTableSemantic {
  page: number;
  dept?: DeptCode;
  serviceColumnHeader: string;
  deptColumnHeader?: string;
  unitColumnHeader?: string;
  feeColumnHeader: string;
}

interface SemanticResponse {
  tables?: unknown;
}

function json(body: { ok: boolean; fees?: FeeRow[]; message?: string }, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function feeScheduleHybridEnabled(
  value = process.env.FEE_SCHEDULE_HYBRID,
): boolean {
  return value !== "0";
}

export function parseFeeTableSemantics(text: string): FeeTableSemantic[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as SemanticResponse;
    if (!Array.isArray(parsed.tables)) return [];
    return parsed.tables.flatMap((raw): FeeTableSemantic[] => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const page = Number(row.page);
      const serviceColumnHeader = stringField(row.serviceColumnHeader);
      const feeColumnHeader = stringField(row.feeColumnHeader);
      const dept = deptField(row.dept);
      if (!Number.isInteger(page) || page < 1 || !serviceColumnHeader || !feeColumnHeader) return [];
      return [{
        page,
        ...(dept ? { dept } : {}),
        serviceColumnHeader,
        feeColumnHeader,
        ...optionalHeader(row, "deptColumnHeader"),
        ...optionalHeader(row, "unitColumnHeader"),
      }];
    });
  } catch {
    return [];
  }
}

export function extractFeeRowsFromPdfTables(
  items: TextItem[],
  semantics: FeeTableSemantic[],
): FeeRow[] {
  const out: FeeRow[] = [];
  const seen = new Set<string>();
  for (const semantic of semantics) {
    const pageItems = items.filter((item) => item.page === semantic.page);
    const rows = clusterRows(pageItems);
    const headerIndex = findHeaderRowIndex(rows, semantic.serviceColumnHeader);
    if (headerIndex < 0) continue;
    const anchors = feeColumnAnchors(rows, headerIndex, semantic);
    if (!anchors.some((anchor) => anchor.key === "service") || !anchors.some((anchor) => anchor.key === "fee")) continue;
    const context = { section: "", parent: "" };

    for (const row of rows.slice(headerIndex + 1)) {
      const cells = cellsForAnchors(row, anchors);
      const name = cleanCell(cells.service ?? "");
      if (!name || shouldSkipName(name)) continue;
      const dept = cells.dept ? deptField(cells.dept) : semantic.dept;
      if (!dept) continue;
      const unit = cleanUnit(cells.unit);
      const fee = parseFeeCell(cells.fee);
      if (fee == null) {
        if (!unit) updateContext(context, name);
        continue;
      }
      const fullName = contextualName(context, name);
      if (!fullName) continue;
      const key = `${dept}|${fullName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: fullName,
        dept,
        ...(unit ? { unit } : {}),
        fee,
        confidence: "high",
      });
    }
  }
  return out;
}

export function discoverFeeTableSemantics(items: TextItem[]): FeeTableSemantic[] {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const pageItems = byPage.get(item.page) ?? [];
    pageItems.push(item);
    byPage.set(item.page, pageItems);
  }
  const out: FeeTableSemantic[] = [];
  for (const [page, pageItems] of byPage) {
    const rows = clusterRows(pageItems);
    const pageText = pageItems.map((item) => item.text).join(" ");
    const dept = inferDeptFromPageText(pageText);
    const feeScheduleHeader = findHeaderRowIndex(rows, "Fee Name");
    const headerBand = feeScheduleHeader >= 0
      ? rowText(rows.slice(Math.max(0, feeScheduleHeader - 4), feeScheduleHeader + 5))
      : "";
    if (dept && feeScheduleHeader >= 0 && headerBand.includes("currentfee")) {
      out.push({
        page,
        dept,
        serviceColumnHeader: "Fee Name",
        unitColumnHeader: "Fee Type / Unit",
        feeColumnHeader: "Current Fee / Deposit",
      });
      continue;
    }
    const generic = findBestGenericFeeHeader(rows);
    if (generic) out.push(generic);
  }
  return out.sort((a, b) => a.page - b.page);
}

export async function handleAiParseFees(req: Request): Promise<Response> {
  if (!feeScheduleHybridEnabled()) {
    return runPdfParser(req, {
      tag: TAG,
      rowsKey: "fees",
      rowAnchor: "name",
      rowNoun: "fee",
    }, () => LEGACY_SYSTEM);
  }

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
  const { fileName, fileSizeKb, base64: pdfBase64, buffer } = upload;
  const client = new Anthropic({ apiKey, timeout: 10 * 60 * 1000 });
  const t0 = Date.now();

  logEvent({
    tag: TAG,
    msg: "fee schedule semantic request start",
    file: fileName,
    file_kb: fileSizeKb,
    model: MODEL,
  });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SEMANTIC_SYSTEM,
      messages: [{
        role: "user",
        content: [{
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        }],
      }],
    }, { signal: req.signal });

    const text = response.content.find((content) => content.type === "text")?.text ?? "";
    const items = await extractTextItems(new Uint8Array(buffer.slice(0)));
    const semantics = mergeFeeSemantics(
      parseFeeTableSemantics(text),
      discoverFeeTableSemantics(items),
    );
    const fees = extractFeeRowsFromPdfTables(items, semantics);

    logEvent({
      tag: TAG,
      msg: "fee schedule deterministic extraction",
      latency_ms: Date.now() - t0,
      semantic_count: semantics.length,
      fee_count: fees.length,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });
    return json({ ok: true, fees });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Unknown model error.";
    logEvent({
      level: aborted ? "info" : "error",
      tag: TAG,
      msg: aborted ? "request aborted by client" : "fee schedule hybrid error",
      error: message,
      latency_ms: Date.now() - t0,
    });
    return json({ ok: false, message }, { status: aborted ? 499 : 502 });
  }
}

function mergeFeeSemantics(
  aiSemantics: FeeTableSemantic[],
  discovered: FeeTableSemantic[],
): FeeTableSemantic[] {
  const byPage = new Map<number, FeeTableSemantic>();
  for (const row of discovered) byPage.set(row.page, row);
  for (const row of aiSemantics) {
    byPage.set(row.page, { ...(byPage.get(row.page) ?? {}), ...row });
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

function findBestGenericFeeHeader(rows: TextItem[][]): FeeTableSemantic | null {
  for (const row of rows) {
    const text = rowText([row]);
    if (!/(service|activity|description|fee\s*name)/.test(text)) continue;
    if (!/(current|adopted|existing|fee|deposit|amount)/.test(text)) continue;
    const service = row.find((item) => /(service|activity|description|fee\s*name)/i.test(item.text));
    const fee = row.find((item) => /(current|adopted|existing).*(fee|deposit)|fee|amount/i.test(item.text));
    if (!service || !fee) continue;
    return {
      page: service.page,
      serviceColumnHeader: service.text,
      feeColumnHeader: fee.text,
      ...(row.some((item) => /(dept|department|division)/i.test(item.text))
        ? { deptColumnHeader: row.find((item) => /(dept|department|division)/i.test(item.text))?.text }
        : {}),
      ...(row.some((item) => /(unit|basis|type)/i.test(item.text))
        ? { unitColumnHeader: row.find((item) => /(unit|basis|type)/i.test(item.text))?.text }
        : {}),
    };
  }
  return null;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalHeader(row: Record<string, unknown>, key: keyof FeeTableSemantic): Partial<FeeTableSemantic> {
  const value = stringField(row[key]);
  return value ? { [key]: value } : {};
}

function deptField(value: unknown): DeptCode | undefined {
  const raw = stringField(value).toUpperCase();
  if (!raw) return undefined;
  return (FEE_DEPTS as readonly string[]).includes(raw) ? raw as DeptCode : undefined;
}

function normalizedHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function rowText(rows: TextItem[][]): string {
  return normalizedHeader(rows.flatMap((row) => row.map((item) => item.text)).join(" "));
}

function findHeaderRowIndex(rows: TextItem[][], serviceColumnHeader: string): number {
  const target = normalizedHeader(serviceColumnHeader);
  let best = -1;
  let bestScore = 0;
  rows.forEach((row, index) => {
    const text = rowText([row]);
    const score = row.some((item) => headerMatches(item.text, serviceColumnHeader))
      ? 3
      : text.includes(target) || target.includes(text) ? 2
      : text.includes("servicename") || text.includes("feename") || text.includes("activity") || text.includes("description") ? 1
      : 0;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return bestScore > 0 ? best : -1;
}

type FeeAnchorKey = "service" | "dept" | "unit" | "fee";

interface FeeColumnAnchor {
  key: FeeAnchorKey;
  x: number;
  left: number;
  right: number;
}

function feeColumnAnchors(
  rows: TextItem[][],
  headerIndex: number,
  semantic: FeeTableSemantic,
): FeeColumnAnchor[] {
  const headerY = rowY(rows[headerIndex]);
  const headerRows = rows.filter((row) => {
    const y = rowY(row);
    return y >= headerY - 70 && y <= headerY + 16;
  });
  const candidates: Array<{ key: FeeAnchorKey; header?: string }> = [
    { key: "service", header: semantic.serviceColumnHeader },
    { key: "dept", header: semantic.deptColumnHeader },
    { key: "unit", header: semantic.unitColumnHeader },
    { key: "fee", header: semantic.feeColumnHeader },
  ];
  const anchors = candidates.flatMap((candidate): FeeColumnAnchor[] => {
    if (!candidate.header) return [];
    const x = findHeaderX(headerRows, candidate.header);
    if (x == null) return [];
    return [{ key: candidate.key, x, left: -Infinity, right: Infinity }];
  });
  const centers = clusteredHeaderCenters(headerRows);
  return anchors
    .map((anchor) => ({ ...anchor, ...columnBounds(anchor.x, centers) }))
    .sort((a, b) => a.x - b.x);
}

function rowY(row: TextItem[]): number {
  return row.length === 0 ? 0 : median(row.map((item) => item.y + item.height / 2));
}

function findHeaderX(rows: TextItem[][], target: string): number | null {
  const normalizedTarget = normalizedHeader(target);
  if (normalizedTarget.includes("currentfee") || normalizedTarget.includes("adoptedfee")) {
    let bestCurrent: { score: number; x: number; width: number } | null = null;
    for (const row of rows) {
      for (const item of row) {
        const h = normalizedHeader(item.text);
        if (!h.includes("currentfee") && !h.includes("adoptedfee")) continue;
        const score = h.length + 100;
        const x = item.x + item.width / 2;
        if (!bestCurrent || score > bestCurrent.score) {
          bestCurrent = { score, x, width: item.width };
        }
      }
    }
    if (bestCurrent) return bestCurrent.width < 45 ? bestCurrent.x + bestCurrent.width / 2 + 10 : bestCurrent.x;
  }
  let best: { score: number; x: number; width: number } | null = null;
  for (const row of rows) {
    for (const item of row) {
      const score = headerItemScore(item.text, target);
      if (score <= 0) continue;
      const x = item.x + item.width / 2;
      if (!best || score > best.score) best = { score, x, width: item.width };
    }
  }
  if (!best) return null;
  if (normalizedTarget.includes("currentfeedeposit") && best.width < 45) {
    return best.x + best.width / 2 + 10;
  }
  return best.x;
}

function headerItemScore(header: string, target: string): number {
  if (headerMatches(header, target)) {
    return normalizedHeader(header).length + 100;
  }
  return headerAliasScore(header, target);
}

function cellsForAnchors(row: TextItem[], anchors: FeeColumnAnchor[]): Partial<Record<FeeAnchorKey, string>> {
  const cells = new Map<FeeAnchorKey, string[]>();
  const sorted = [...anchors].sort((a, b) => a.x - b.x);
  for (const item of row) {
    const itemCenter = item.x + item.width / 2;
    let best: FeeColumnAnchor | null = null;
    let bestDistance = Infinity;
    for (const anchor of sorted) {
      const probe = anchor.key === "dept" || anchor.key === "fee" ? item.x : itemCenter;
      if (probe < anchor.left || probe > anchor.right) continue;
      const distance = Math.abs(probe - anchor.x);
      if (distance < bestDistance) {
        best = anchor;
        bestDistance = distance;
      }
    }
    if (!best) continue;
    if (best.key === "service" && /^\d+$/.test(item.text.trim()) && item.x < best.x) continue;
    const parts = cells.get(best.key) ?? [];
    parts.push(item.text);
    cells.set(best.key, parts);
  }
  return Object.fromEntries([...cells.entries()].map(([key, parts]) => [key, parts.join(" ")]));
}

function clusteredHeaderCenters(rows: TextItem[][]): number[] {
  const centers = rows
    .flatMap((row) => row.map((item) => item.x + item.width / 2))
    .sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const center of centers) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(center - median(last)) > 24) clusters.push([center]);
    else last.push(center);
  }
  return clusters.map(median).sort((a, b) => a - b);
}

function columnBounds(x: number, centers: number[]): Pick<FeeColumnAnchor, "left" | "right"> {
  const sorted = [...centers.filter((center) => Math.abs(center - x) > 12), x].sort((a, b) => a - b);
  const index = sorted.indexOf(x);
  const left = sorted[index - 1] == null ? -Infinity : (sorted[index - 1] + x) / 2;
  const right = sorted[index + 1] == null ? Infinity : (sorted[index + 1] + x) / 2;
  return { left, right };
}

function headerMatches(header: string, target: string): boolean {
  const h = normalizedHeader(header);
  const t = normalizedHeader(target);
  return !!h && !!t && (h === t || h.includes(t) || t.includes(h));
}

function headerAliasScore(header: string, target: string): number {
  const h = normalizedHeader(header);
  const t = normalizedHeader(target);
  if (!h || !t) return 0;
  if ((t.includes("service") || t.includes("fee") || t.includes("activity")) &&
    (h.includes("servicename") || h.includes("feename") || h.includes("activity") || h.includes("description") || h === "name")) return 2;
  if (t.includes("dept") && (h.includes("department") || h === "dept")) return 2;
  if (t.includes("unit") && (h.includes("unit") || h.includes("basis") || h.includes("type"))) return 2;
  if ((t.includes("current") || t.includes("adopted")) && h.includes("current") && h.includes("fee")) return 2;
  if ((t.includes("fee") || t.includes("amount")) && (h.includes("fee") || h.includes("amount"))) return 1;
  return 0;
}

function cleanCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanUnit(value: string | undefined): string | undefined {
  const text = cleanCell(value ?? "");
  if (!text || /^\[[^\]]+\]$/.test(text)) return undefined;
  return text.length > 48 ? undefined : text;
}

function shouldSkipName(name: string): boolean {
  const text = name.trim().toLowerCase();
  if (!text) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^(totals?|subtotals?|grand total|department total|notes?|fee name|service name|description|schedule\))$/.test(text)) return true;
  if (/^(planning|building|engineering)\s+fee\s+schedule/.test(text)) return true;
  if (text.startsWith("nbs - local government") || text.startsWith("web:")) return true;
  return false;
}

function updateContext(context: { section: string; parent: string }, name: string): void {
  if (/^[A-Z]\.\s+/.test(name)) {
    context.parent = stripOutlinePrefix(name);
    return;
  }
  if (!/^[ivx]+\.\s+/i.test(name)) {
    context.section = stripOutlinePrefix(name);
    context.parent = "";
  }
}

function contextualName(context: { section: string; parent: string }, name: string): string {
  const stripped = stripOutlinePrefix(name);
  if (!stripped) return "";
  if (/^[ivx]+\.\s+/i.test(name)) {
    return uniqueNameParts([context.section, context.parent, stripped]).join(" - ");
  }
  if (/^[A-Z]\.\s+/.test(name)) {
    context.parent = stripped;
    return uniqueNameParts([context.section, stripped]).join(" - ");
  }
  return uniqueNameParts([context.section, context.parent, stripped]).join(" - ");
}

function uniqueNameParts(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const clean = part.trim();
    if (!clean) continue;
    if (out[out.length - 1]?.toLowerCase() === clean.toLowerCase()) continue;
    out.push(clean);
  }
  return out;
}

function stripOutlinePrefix(name: string): string {
  return name
    .replace(/^[A-Z]\.\s+/, "")
    .replace(/^[ivx]+\.\s+/i, "")
    .trim();
}

function inferDeptFromPageText(text: string): DeptCode | undefined {
  const normalized = text.toLowerCase();
  if (normalized.includes("planning fee schedule") || normalized.includes("appendix a.1")) return "PLAN";
  if (normalized.includes("building permit fees") || normalized.includes("appendix a.2")) return "BLDG";
  if (normalized.includes("engineering") || normalized.includes("appendix a.3")) return "ENG";
  return undefined;
}

function parseFeeCell(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text || /^[-–—]$/.test(text) || /^n\/?a$/i.test(text)) return undefined;
  if (/no\s+charge/i.test(text)) return 0;
  if (/%/.test(text)) return undefined;
  const cleaned = text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[$,%]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
