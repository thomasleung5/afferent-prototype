import Anthropic from "@anthropic-ai/sdk";
import { FEE_DEPTS } from "../lib/data/departments";
import type { DeptCode } from "../lib/types";
import { readPdfUpload } from "./aiUploadValidator";
import { runPdfParser } from "./aiParseRunner";
import { logEvent } from "./logger";
import {
  clusterRows, extractTextItems, type TextItem,
} from "./pdfTableExtract";

const TAG = "ai-parse-services";
const MODEL = "claude-sonnet-4-6";

const LEGACY_SYSTEM = `You are parsing a municipal cost-of-service study or fee study PDF. Extract every service line item and return ONLY this JSON, no prose:

{
  "services": [
    { "name": "Site Development Hearing Review", "dept": "PLAN", "hours": 3.5, "volume": 45, "fee": 4160, "target": 100, "confidence": "high" },
    { "name": "Building Permit — New SFR", "dept": "BLDG", "hours": 8.0, "volume": 120, "fee": 13500, "confidence": "high" },
    { "name": "Erosion Control Inspections", "dept": "ENG", "hours": 1.5, "volume": 80, "fee": 210, "confidence": "low" },
    { "name": "Business License Application Processing Fee", "dept": "FIN", "hours": 0.5, "volume": 250, "fee": 50, "confidence": "high" }
  ]
}

Rules:
- dept must be exactly one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}
- hours is staff hours per service occurrence (fully-burdened hours, not clock hours)
- volume is annual service count or permit count — plain number, no commas
- fee is the current adopted fee as a plain number — no $ or commas
- target is recovery % as 0–100 (e.g. 100 = full cost recovery), omit if not stated
- confidence: "high" if certain, "low" if dept, hours, or volume is ambiguous or estimated
- Skip section headers, subtotals, grand totals, notes, and blank rows
- If hours are not shown but a unit cost and FBHR are shown, compute hours = unit_cost / FBHR
- Return only the JSON object, nothing else`;

const SEMANTIC_SYSTEM = `You are identifying service-catalog tables in a municipal fee study PDF.

Return ONLY this JSON:
{
  "tables": [
    {
      "page": 24,
      "dept": "PLAN",
      "serviceColumnHeader": "Fee Name",
      "deptColumnHeader": "Department",
      "hoursColumnHeader": "Estimated Average Labor Time Per Activity (hours)",
      "volumeColumnHeader": "Estimated Volume of Activity",
      "feeColumnHeader": "Current Fee / Deposit"
    }
  ]
}

Rules:
- Identify tables that list individual services/fees, not narrative summaries.
- Return page numbers as 1-indexed PDF page numbers.
- dept must be one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}. If the table itself has a department column, dept may be omitted.
- serviceColumnHeader is required and must be the exact printed header for the service/fee description column.
- Other column headers are optional. Include them only when the printed table has that column.
- Do not extract service rows or numeric values. Only identify table/page/header semantics.`;

export interface ServiceRow {
  name: string;
  dept: DeptCode;
  hours?: number;
  volume?: number;
  fee?: number;
  target?: number;
  confidence: "high" | "low";
}

export interface ServiceTableSemantic {
  page: number;
  dept?: DeptCode;
  serviceColumnHeader: string;
  deptColumnHeader?: string;
  hoursColumnHeader?: string;
  volumeColumnHeader?: string;
  feeColumnHeader?: string;
  targetColumnHeader?: string;
}

interface SemanticResponse {
  tables?: unknown;
}

function buildLegacySystem(catalogEntries: { name: string; dept: string }[]): string {
  if (catalogEntries.length === 0) return LEGACY_SYSTEM;
  const list = catalogEntries.map((e) => `  - ${e.name} (${e.dept})`).join("\n");
  return `${LEGACY_SYSTEM}

IMPORTANT — existing service catalog (you MUST use these exact names when there is a match):
${list}

When a row in the PDF clearly corresponds to a catalog entry, use the catalog name verbatim in your output even if the PDF spells it differently. Only use a name from the PDF directly when there is no reasonable catalog match.`;
}

function json(body: { ok: boolean; services?: ServiceRow[]; message?: string }, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function serviceCatalogHybridEnabled(
  value = process.env.SERVICE_CATALOG_HYBRID,
): boolean {
  return value !== "0";
}

export function parseServiceTableSemantics(text: string): ServiceTableSemantic[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as SemanticResponse;
    if (!Array.isArray(parsed.tables)) return [];
    return parsed.tables.flatMap((raw): ServiceTableSemantic[] => {
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
        ...optionalHeader(row, "hoursColumnHeader"),
        ...optionalHeader(row, "volumeColumnHeader"),
        ...optionalHeader(row, "feeColumnHeader"),
        ...optionalHeader(row, "targetColumnHeader"),
      }];
    });
  } catch {
    return [];
  }
}

export function extractServiceRowsFromPdfTables(
  items: TextItem[],
  semantics: ServiceTableSemantic[],
): ServiceRow[] {
  const out: ServiceRow[] = [];
  const seen = new Set<string>();
  for (const semantic of semantics) {
    const pageItems = items.filter((item) => item.page === semantic.page);
    const rows = clusterRows(pageItems);
    const headerIndex = findHeaderRowIndex(rows, semantic.serviceColumnHeader);
    if (headerIndex < 0) continue;
    const anchors = serviceColumnAnchors(rows, headerIndex, semantic);
    const serviceAnchor = anchors.find((anchor) => anchor.key === "service");
    if (!serviceAnchor) continue;
    const hasNumericColumns = anchors.some((anchor) =>
      anchor.key === "hours" || anchor.key === "volume" || anchor.key === "fee" || anchor.key === "target");
    const context = { section: "", parent: "" };

    for (const row of rows.slice(headerIndex + 1)) {
      const cells = cellsForAnchors(row, anchors);
      const name = cleanServiceName(cells.service ?? "");
      if (!name || shouldSkipServiceName(name)) continue;
      const dept = cells.dept ? deptField(cells.dept) : semantic.dept;
      if (!dept) continue;
      const hours = parseNumericCell(cells.hours);
      const volume = parseNumericCell(cells.volume);
      const fee = parseNumericCell(cells.fee);
      const target = parsePercentCell(cells.target);
      const hasValues = hasAnyOptionalValue({ hours, volume, fee, target });
      if (!hasValues) {
        if (hasNumericColumns) updateServiceContext(context, name);
        if (hasNumericColumns || hasOnlySectionLikeName(name)) continue;
      }
      const fullName = contextualServiceName(context, name);
      if (!fullName) continue;
      const key = `${dept}|${fullName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: fullName,
        dept,
        ...(hours != null ? { hours } : {}),
        ...(volume != null ? { volume } : {}),
        ...(fee != null ? { fee } : {}),
        ...(target != null ? { target } : {}),
        confidence: hours != null || volume != null || fee != null ? "high" : "low",
      });
    }
  }
  return out;
}

export function discoverServiceTableSemantics(items: TextItem[]): ServiceTableSemantic[] {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const pageItems = byPage.get(item.page) ?? [];
    pageItems.push(item);
    byPage.set(item.page, pageItems);
  }
  const out: ServiceTableSemantic[] = [];
  for (const [page, pageItems] of byPage) {
    const rows = clusterRows(pageItems);
    const headerIndex = findHeaderRowIndex(rows, "Fee Name");
    if (headerIndex < 0) continue;
    const pageText = pageItems.map((item) => item.text).join(" ");
    const dept = inferDeptFromPageText(pageText);
    if (!dept) continue;
    out.push({
      page,
      dept,
      serviceColumnHeader: "Fee Name",
      hoursColumnHeader: "Estimated Average Labor Time Per Activity (hours)",
      volumeColumnHeader: "Estimated Volume of Activity",
      feeColumnHeader: "Current Fee / Deposit",
    });
  }
  return out.sort((a, b) => a.page - b.page);
}

export async function handleAiParseServices(req: Request): Promise<Response> {
  if (!serviceCatalogHybridEnabled()) {
    return runPdfParser(req, {
      tag: TAG,
      rowsKey: "services",
      rowAnchor: "name",
      rowNoun: "service",
    }, (form) => {
      const catalogRaw = form.get("catalog");
      const catalog = typeof catalogRaw === "string" && catalogRaw
        ? JSON.parse(catalogRaw) as { name: string; dept: string }[]
        : [];
      return buildLegacySystem(catalog);
    });
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
    msg: "service catalog semantic request start",
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
    const semantics = withoutTargetRecoveryColumns(mergeServiceSemantics(
      parseServiceTableSemantics(text),
      discoverServiceTableSemantics(items),
    ));
    const services = extractServiceRowsFromPdfTables(items, semantics);

    logEvent({
      tag: TAG,
      msg: "service catalog deterministic extraction",
      latency_ms: Date.now() - t0,
      semantic_count: semantics.length,
      service_count: services.length,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });
    return json({ ok: true, services });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Unknown model error.";
    logEvent({
      level: aborted ? "info" : "error",
      tag: TAG,
      msg: aborted ? "request aborted by client" : "service catalog hybrid error",
      error: message,
      latency_ms: Date.now() - t0,
    });
    return json({ ok: false, message }, { status: aborted ? 499 : 502 });
  }
}

function mergeServiceSemantics(
  aiSemantics: ServiceTableSemantic[],
  discovered: ServiceTableSemantic[],
): ServiceTableSemantic[] {
  const byPage = new Map<number, ServiceTableSemantic>();
  for (const row of discovered) byPage.set(row.page, row);
  for (const row of aiSemantics) {
    byPage.set(row.page, { ...(byPage.get(row.page) ?? {}), ...row });
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

function withoutTargetRecoveryColumns(semantics: ServiceTableSemantic[]): ServiceTableSemantic[] {
  return semantics.map(({ targetColumnHeader: _targetColumnHeader, ...semantic }) => semantic);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalHeader(row: Record<string, unknown>, key: keyof ServiceTableSemantic): Partial<ServiceTableSemantic> {
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

function findHeaderRowIndex(rows: TextItem[][], serviceColumnHeader: string): number {
  const target = normalizedHeader(serviceColumnHeader);
  let best = -1;
  let bestScore = 0;
  rows.forEach((row, index) => {
    const rowText = normalizedHeader(row.map((item) => item.text).join(" "));
    const score = row.some((item) => headerMatches(item.text, serviceColumnHeader))
      ? 3
      : rowText.includes(target) || target.includes(rowText) ? 2
      : rowText.includes("servicename") || rowText.includes("feename") || rowText.includes("description") ? 1
      : 0;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return bestScore > 0 ? best : -1;
}

type ServiceAnchorKey = "service" | "dept" | "hours" | "volume" | "fee" | "target";

interface ServiceColumnAnchor {
  key: ServiceAnchorKey;
  x: number;
  left: number;
  right: number;
}

function serviceColumnAnchors(
  rows: TextItem[][],
  headerIndex: number,
  semantic: ServiceTableSemantic,
): ServiceColumnAnchor[] {
  const headerY = rowY(rows[headerIndex]);
  const headerRows = rows.filter((row) => {
    const y = rowY(row);
    return y >= headerY - 70 && y <= headerY + 16;
  });
  const candidates: Array<{ key: ServiceAnchorKey; header?: string }> = [
    { key: "service", header: semantic.serviceColumnHeader },
    { key: "dept", header: semantic.deptColumnHeader },
    { key: "hours", header: semantic.hoursColumnHeader },
    { key: "volume", header: semantic.volumeColumnHeader },
    { key: "fee", header: semantic.feeColumnHeader },
    { key: "target", header: semantic.targetColumnHeader },
  ];
  const anchors = candidates.flatMap((candidate): ServiceColumnAnchor[] => {
    if (!candidate.header) return [];
    const x = findHeaderX(headerRows, candidate.header);
    if (x == null) return [];
    return [{ key: candidate.key, x, left: -Infinity, right: Infinity }];
  });
  const headerCenters = clusteredHeaderCenters(headerRows);
  return anchors
    .map((anchor) => ({ ...anchor, ...columnBounds(anchor.x, headerCenters) }))
    .sort((a, b) => a.x - b.x);
}

function rowY(row: TextItem[]): number {
  return row.length === 0 ? 0 : median(row.map((item) => item.y + item.height / 2));
}

function findHeaderX(rows: TextItem[][], target: string): number | null {
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
  if (normalizedHeader(target).includes("currentfeedeposit") && best.width < 45) {
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

function cellsForAnchors(row: TextItem[], anchors: ServiceColumnAnchor[]): Partial<Record<ServiceAnchorKey, string>> {
  const cells = new Map<ServiceAnchorKey, string[]>();
  const sorted = [...anchors].sort((a, b) => a.x - b.x);
  for (const item of row) {
    const itemCenter = item.x + item.width / 2;
    let best: ServiceColumnAnchor | null = null;
    let bestDistance = Infinity;
    for (const anchor of sorted) {
      const probe = anchor.key === "dept" ? item.x : itemCenter;
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

function columnBounds(x: number, centers: number[]): Pick<ServiceColumnAnchor, "left" | "right"> {
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
  if ((t.includes("service") || t.includes("fee")) && (h.includes("servicename") || h.includes("feename") || h === "name")) return 2;
  if (t.includes("dept") && (h.includes("department") || h === "dept")) return 2;
  if (t.includes("hour") && h.includes("hour")) return 2;
  if (t.includes("volume") && h.includes("volume")) return 2;
  if ((t.includes("fee") || t.includes("current")) && h.includes("current") && h.includes("fee")) return 2;
  if ((t.includes("target") || t.includes("recovery")) && h.includes("recovery")) return 2;
  return 0;
}

function cleanServiceName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shouldSkipServiceName(name: string): boolean {
  const text = name.trim().toLowerCase();
  if (!text) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^(totals?|subtotals?|notes?|fee name|service name|description|schedule\))$/.test(text)) return true;
  if (/^(planning|building|engineering)\s+fee\s+schedule/.test(text)) return true;
  if (text.startsWith("nbs - local government") || text.startsWith("web:")) return true;
  return false;
}

function hasOnlySectionLikeName(name: string): boolean {
  return /^[0-9]+$/.test(name) || /^[A-Z]\.\s+/.test(name) || /^[ivx]+\.\s+/i.test(name);
}

function updateServiceContext(context: { section: string; parent: string }, name: string): void {
  if (/^[A-Z]\.\s+/.test(name)) {
    context.parent = stripOutlinePrefix(name);
    return;
  }
  if (!/^[ivx]+\.\s+/i.test(name)) {
    context.section = stripOutlinePrefix(name);
    context.parent = "";
  }
}

function contextualServiceName(
  context: { section: string; parent: string },
  name: string,
): string {
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

function parseNumericCell(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text || /^[-–—]$/.test(text) || /^n\/?a$/i.test(text)) return undefined;
  if (/no\s+charge/i.test(text)) return 0;
  const cleaned = text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[$,%]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function parsePercentCell(value: string | undefined): number | undefined {
  return parseNumericCell(value);
}

function hasAnyOptionalValue(values: {
  hours?: number; volume?: number; fee?: number; target?: number;
}): boolean {
  return values.hours != null || values.volume != null || values.fee != null || values.target != null;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
