import Anthropic from "@anthropic-ai/sdk";
import { FEE_DEPTS } from "../lib/data/departments";
import type { DeptCode } from "../lib/types";
import { readPdfUpload } from "./aiUploadValidator";
import { runPdfParser } from "./aiParseRunner";
import { logEvent } from "./logger";
import {
  clusterRows, extractTextItems, type TextItem,
} from "./pdfTableExtract";

const TAG = "ai-parse-volume";
const MODEL = "claude-sonnet-4-6";

const LEGACY_SYSTEM = `You are extracting service-volume / workload counts from a municipal document. The document may be an annual report, a permit-volume table, an application-count summary, a year-over-year activity table, or a workload appendix inside a fee study — only the rows that COUNT units of service activity matter.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip narrative chapters, methodology sections, executive summaries, recommendation tables, financial tables, fee tables, revenue summaries, and rate-derivation tables
- Focus exclusively on sections titled "Volume of Activity", "Workload", "Service Volumes", "Annual Activity", "Permit Volume", "Application Counts", "Transactions", "Activity Report", "Year-over-Year Activity", appendices labeled "Volume of Activity", "Workload" or "Activity", or any tabular section that lists individual services with annual unit counts

Extract every row that reports a count of services performed and return ONLY this JSON, no prose:

{
  "items": [
    { "name": "Building Permit — Single-Family Residential", "dept": "BLDG", "prior": 142, "current": 165, "unit": "permits", "confidence": "high" },
    { "name": "Conditional Use Permit", "dept": "PLAN", "prior": null, "current": 12, "unit": "applications", "confidence": "high" },
    { "name": "Encroachment Permit", "dept": "ENG", "prior": 158, "current": 169, "unit": "permits", "confidence": "low" },
    { "name": "Returned Check Fee", "dept": "FIN", "prior": 45, "current": 52, "unit": "transactions", "confidence": "high" }
  ]
}

Rules:
- dept must be exactly one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}
- ONLY include rows whose department is one of those fee-supported departments. SKIP every row for unrelated departments such as City Manager, Library, Streets, Water, Sewer, HR, IT, or general Public Works operations not tied to fee-supported engineering services.
- name must be the EXACT service description as written in the document. Do NOT abbreviate, expand, paraphrase, or reword — downstream client-side matching depends on the name matching the catalog character-for-character.
- prior is the prior-year (or baseline) volume as a plain integer with commas stripped ("1,245" → 1245). If only one year is reported, set prior to null.
- current is the current-year (or most-recent) volume as a plain integer with commas stripped. If only one year is reported, populate current and leave prior null.
- SKIP rows whose volume cell is a range (e.g. "12-20"), a percentage ("8.4%"), a year-over-year delta ("+12"), text ("Various"), or non-numeric. Skip rows whose volume is zero or missing.
- unit is a short noun describing what is being counted: "permits", "applications", "reviews", "inspections", "hearings", "transactions", "encroachments", etc. Default to "units" only when the document does not state one.
- confidence: "high" only when name, dept, and at least one of prior/current are unambiguous; "low" if any field is ambiguous, estimated, inferred from context, or footnoted
- SKIP totals, subtotals, grand totals, "Department Total" rows, fund totals, percent-change rows, header rows, and blank rows
- SKIP narrative-style rows (single sentences without a tabular count) and rows that describe a service without giving a count
- Return only the JSON object, nothing else`;

const SEMANTIC_SYSTEM = `You are identifying service-volume / workload tables in a municipal PDF.

Return ONLY this JSON:
{
  "tables": [
    {
      "page": 24,
      "dept": "PLAN",
      "serviceColumnHeader": "Fee Name",
      "deptColumnHeader": "Department",
      "unitColumnHeader": "Fee Type / Unit",
      "priorColumnHeader": "Prior Year Volume",
      "currentColumnHeader": "Estimated Volume of Activity"
    }
  ]
}

Rules:
- Identify tables that list individual service/activity rows with annual counts, workload counts, or permit/application volumes.
- Return page numbers as 1-indexed PDF page numbers.
- dept must be one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}. If the table has a department column, dept may be omitted.
- serviceColumnHeader is required and must be the exact printed header for the service/activity description column.
- currentColumnHeader is required unless priorColumnHeader is present and clearly carries the latest count.
- Other column headers are optional. Include them only when the printed table has that column.
- Do not extract volume rows or numeric values. Only identify table/page/header semantics.`;

export interface VolumeItem {
  name: string;
  dept: DeptCode;
  prior?: number | null;
  current?: number | null;
  unit?: string;
  confidence: "high" | "low";
}

export interface VolumeTableSemantic {
  page: number;
  dept?: DeptCode;
  serviceColumnHeader: string;
  deptColumnHeader?: string;
  unitColumnHeader?: string;
  priorColumnHeader?: string;
  currentColumnHeader?: string;
}

interface SemanticResponse {
  tables?: unknown;
}

function json(body: { ok: boolean; items?: VolumeItem[]; message?: string }, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function volumeCatalogHybridEnabled(
  value = process.env.VOLUME_CATALOG_HYBRID,
): boolean {
  return value !== "0";
}

export function parseVolumeTableSemantics(text: string): VolumeTableSemantic[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as SemanticResponse;
    if (!Array.isArray(parsed.tables)) return [];
    return parsed.tables.flatMap((raw): VolumeTableSemantic[] => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const page = Number(row.page);
      const serviceColumnHeader = stringField(row.serviceColumnHeader);
      const dept = deptField(row.dept);
      if (!Number.isInteger(page) || page < 1 || !serviceColumnHeader) return [];
      return [{
        page,
        ...(dept ? { dept } : {}),
        serviceColumnHeader,
        ...optionalHeader(row, "deptColumnHeader"),
        ...optionalHeader(row, "unitColumnHeader"),
        ...optionalHeader(row, "priorColumnHeader"),
        ...optionalHeader(row, "currentColumnHeader"),
      }];
    });
  } catch {
    return [];
  }
}

export function extractVolumeRowsFromPdfTables(
  items: TextItem[],
  semantics: VolumeTableSemantic[],
): VolumeItem[] {
  const out: VolumeItem[] = [];
  const seen = new Set<string>();
  for (const semantic of semantics) {
    const pageItems = items.filter((item) => item.page === semantic.page);
    const rows = clusterRows(pageItems);
    const headerIndex = findHeaderRowIndex(rows, semantic.serviceColumnHeader);
    if (headerIndex < 0) continue;
    const anchors = volumeColumnAnchors(rows, headerIndex, semantic);
    const serviceAnchor = anchors.find((anchor) => anchor.key === "service");
    if (!serviceAnchor) continue;
    const hasVolumeColumns = anchors.some((anchor) => anchor.key === "prior" || anchor.key === "current");
    if (!hasVolumeColumns) continue;
    const context = { section: "", parent: "" };

    for (const row of rows.slice(headerIndex + 1)) {
      const cells = cellsForAnchors(row, anchors);
      const name = cleanCell(cells.service ?? "");
      if (!name || shouldSkipName(name)) continue;
      const dept = cells.dept ? deptField(cells.dept) : semantic.dept;
      if (!dept) continue;
      const prior = parseCountCell(cells.prior);
      const current = parseCountCell(cells.current);
      const unit = cleanUnit(cells.unit);
      if (prior == null && current == null) {
        if (!unit) updateContext(context, name);
        continue;
      }
      const fullName = contextualName(context, name);
      if (!fullName) continue;
      const key = `${dept}|${fullName.toLowerCase()}|${prior ?? ""}|${current ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: fullName,
        dept,
        prior: prior ?? null,
        current: current ?? null,
        ...(unit ? { unit } : {}),
        confidence: "high",
      });
    }
  }
  return out;
}

export function discoverVolumeTableSemantics(items: TextItem[]): VolumeTableSemantic[] {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const pageItems = byPage.get(item.page) ?? [];
    pageItems.push(item);
    byPage.set(item.page, pageItems);
  }
  const out: VolumeTableSemantic[] = [];
  for (const [page, pageItems] of byPage) {
    const rows = clusterRows(pageItems);
    const pageText = pageItems.map((item) => item.text).join(" ");
    const dept = inferDeptFromPageText(pageText);
    const feeScheduleHeader = findHeaderRowIndex(rows, "Fee Name");
    if (dept && feeScheduleHeader >= 0 && rowText(rows.slice(Math.max(0, feeScheduleHeader - 4), feeScheduleHeader + 5)).includes("volume")) {
      out.push({
        page,
        dept,
        serviceColumnHeader: "Fee Name",
        unitColumnHeader: "Fee Type / Unit",
        currentColumnHeader: "Estimated Volume of Activity",
      });
      continue;
    }
    const serviceHeader = findBestGenericVolumeHeader(rows);
    if (serviceHeader) out.push(serviceHeader);
  }
  return out.sort((a, b) => a.page - b.page);
}

export async function handleAiParseVolume(req: Request): Promise<Response> {
  if (!volumeCatalogHybridEnabled()) {
    return runPdfParser(req, {
      tag: TAG,
      rowsKey: "items",
      rowAnchor: "name",
      rowNoun: "volume",
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
    msg: "volume semantic request start",
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
    const semantics = mergeVolumeSemantics(
      parseVolumeTableSemantics(text),
      discoverVolumeTableSemantics(items),
    );
    const volumeItems = extractVolumeRowsFromPdfTables(items, semantics);

    logEvent({
      tag: TAG,
      msg: "volume deterministic extraction",
      latency_ms: Date.now() - t0,
      semantic_count: semantics.length,
      item_count: volumeItems.length,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });
    return json({ ok: true, items: volumeItems });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Unknown model error.";
    logEvent({
      level: aborted ? "info" : "error",
      tag: TAG,
      msg: aborted ? "request aborted by client" : "volume hybrid error",
      error: message,
      latency_ms: Date.now() - t0,
    });
    return json({ ok: false, message }, { status: aborted ? 499 : 502 });
  }
}

function mergeVolumeSemantics(
  aiSemantics: VolumeTableSemantic[],
  discovered: VolumeTableSemantic[],
): VolumeTableSemantic[] {
  const byPage = new Map<number, VolumeTableSemantic>();
  for (const row of discovered) byPage.set(row.page, row);
  for (const row of aiSemantics) {
    byPage.set(row.page, { ...(byPage.get(row.page) ?? {}), ...row });
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

function findBestGenericVolumeHeader(rows: TextItem[][]): VolumeTableSemantic | null {
  for (const row of rows) {
    const text = rowText([row]);
    if (!/(service|activity|description|fee\s*name)/.test(text)) continue;
    if (!/(volume|count|current|annual|fy|year)/.test(text)) continue;
    const service = row.find((item) => /(service|activity|description|fee\s*name)/i.test(item.text));
    const current = row.find((item) => /(current|annual|volume|count|this\s*year)/i.test(item.text));
    if (!service || !current) continue;
    return {
      page: service.page,
      serviceColumnHeader: service.text,
      currentColumnHeader: current.text,
      ...(row.some((item) => /(dept|department|division)/i.test(item.text))
        ? { deptColumnHeader: row.find((item) => /(dept|department|division)/i.test(item.text))?.text }
        : {}),
      ...(row.some((item) => /(prior|previous|last\s*year)/i.test(item.text))
        ? { priorColumnHeader: row.find((item) => /(prior|previous|last\s*year)/i.test(item.text))?.text }
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

function optionalHeader(row: Record<string, unknown>, key: keyof VolumeTableSemantic): Partial<VolumeTableSemantic> {
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

type VolumeAnchorKey = "service" | "dept" | "unit" | "prior" | "current";

interface VolumeColumnAnchor {
  key: VolumeAnchorKey;
  x: number;
  left: number;
  right: number;
}

function volumeColumnAnchors(
  rows: TextItem[][],
  headerIndex: number,
  semantic: VolumeTableSemantic,
): VolumeColumnAnchor[] {
  const headerY = rowY(rows[headerIndex]);
  const headerRows = rows.filter((row) => {
    const y = rowY(row);
    return y >= headerY - 70 && y <= headerY + 16;
  });
  const candidates: Array<{ key: VolumeAnchorKey; header?: string }> = [
    { key: "service", header: semantic.serviceColumnHeader },
    { key: "dept", header: semantic.deptColumnHeader },
    { key: "unit", header: semantic.unitColumnHeader },
    { key: "prior", header: semantic.priorColumnHeader },
    { key: "current", header: semantic.currentColumnHeader },
  ];
  const anchors = candidates.flatMap((candidate): VolumeColumnAnchor[] => {
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
  if (normalizedTarget.includes("volume") || normalizedTarget.includes("count")) {
    let volumeBest: { score: number; x: number } | null = null;
    for (const row of rows) {
      for (const item of row) {
        const h = normalizedHeader(item.text);
        if (!h.includes("volume") && !h.includes("count")) continue;
        const score = headerAliasScore(item.text, target) + h.length;
        if (score <= 0) continue;
        const x = item.x + item.width / 2;
        if (!volumeBest || score > volumeBest.score) volumeBest = { score, x };
      }
    }
    if (volumeBest) return volumeBest.x;
  }
  let best: { score: number; x: number } | null = null;
  for (const row of rows) {
    for (const item of row) {
      const score = headerItemScore(item.text, target);
      if (score <= 0) continue;
      const x = item.x + item.width / 2;
      if (!best || score > best.score) best = { score, x };
    }
  }
  return best?.x ?? null;
}

function headerItemScore(header: string, target: string): number {
  if (headerMatches(header, target)) {
    return normalizedHeader(header).length + 100;
  }
  return headerAliasScore(header, target);
}

function cellsForAnchors(row: TextItem[], anchors: VolumeColumnAnchor[]): Partial<Record<VolumeAnchorKey, string>> {
  const cells = new Map<VolumeAnchorKey, string[]>();
  const sorted = [...anchors].sort((a, b) => a.x - b.x);
  for (const item of row) {
    const itemCenter = item.x + item.width / 2;
    let best: VolumeColumnAnchor | null = null;
    let bestDistance = Infinity;
    for (const anchor of sorted) {
      const probe = anchor.key === "dept" || anchor.key === "current" || anchor.key === "prior"
        ? item.x
        : itemCenter;
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

function columnBounds(x: number, centers: number[]): Pick<VolumeColumnAnchor, "left" | "right"> {
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
  if (t.includes("prior") && (h.includes("prior") || h.includes("previous") || h.includes("lastyear"))) return 2;
  if ((t.includes("current") || t.includes("volume") || t.includes("count")) &&
    (h.includes("current") || h.includes("volume") || h.includes("count") || h.includes("activity"))) return 2;
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

function parseCountCell(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text || /^[-–—]$/.test(text) || /^n\/?a$/i.test(text)) return undefined;
  if (/%/.test(text) || /\d\s*[-–—]\s*\d/.test(text) || /^\+/.test(text)) return undefined;
  const cleaned = text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[$,%]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
