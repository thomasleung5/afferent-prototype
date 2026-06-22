import Anthropic from "@anthropic-ai/sdk";
import { FEE_DEPTS } from "../lib/data/departments";
import type { DeptCode } from "../lib/types";
import { readPdfUpload } from "./aiUploadValidator";
import { runPdfParser } from "./aiParseRunner";
import { logEvent } from "./logger";
import {
  clusterRows, extractTextItems, type TextItem,
} from "./pdfTableExtract";

const TAG = "ai-parse-labor";
const MODEL = "claude-sonnet-4-6";
const DEFAULT_FTE = 1;
const DEFAULT_HOURS = 1720;

const LEGACY_SYSTEM = `You are extracting the staff position roster (role + dept + FTE + productive hours) from a municipal document. Salary and benefit dollar amounts are NOT in scope — those are extracted separately from the Operating Budget. The document may be a staffing plan, a personnel budget appendix inside a larger fee study, or an annual report — only the position-level identity matters.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip all narrative chapters, methodology sections, executive summaries, and recommendation tables
- Focus exclusively on sections titled "Staffing Plan", "Position Listing", "Staff Roster", appendices labeled "Staffing" or "Labor", or any tabular section that lists individual positions (with or without dollar amounts)
- Do not read or process narrative paragraphs — jump directly to the staffing tables

Extract every position line item you find in those sections and return ONLY this JSON, no prose:

{
  "positions": [
    { "title": "Senior Planner", "dept": "PLAN", "fte": 0.80, "hours": 1720, "confidence": "high" },
    { "title": "Building Inspector II", "dept": "BLDG", "fte": 1.00, "hours": 1720, "confidence": "high" },
    { "title": "Civil Engineer", "dept": "ENG", "fte": 0.50, "hours": 1720, "confidence": "low" },
    { "title": "Utility Billing Specialist", "dept": "FIN", "fte": 1.00, "hours": 1720, "confidence": "high" }
  ]
}

Rules:
- dept must be exactly one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}
- Only include positions assigned to those fee-supported departments — skip positions in unrelated departments.
- fte is the full-time equivalent allocation to fee services (0.0–1.0) — if not stated assume 1.0
- hours is productive hours per year per FTE — default to 1720 if not stated in the document
- Do NOT extract salary, benefits, or any dollar amount — leave those fields off the JSON entirely. The Operating Budget import is the authoritative source for labor cost.
- confidence: "high" if title, dept, FTE, and hours are all clear; "low" if any are ambiguous or estimated
- Skip totals, subtotals, vacant positions, and summary rows
- Use the exact position title as written in the document
- Return only the JSON object, nothing else`;

const SEMANTIC_SYSTEM = `You are identifying staffing / labor roster tables in a municipal PDF.

Return ONLY this JSON:
{
  "tables": [
    {
      "page": 12,
      "dept": "PLAN",
      "titleColumnHeader": "Position",
      "deptColumnHeader": "Department",
      "fteColumnHeader": "FTE",
      "hoursColumnHeader": "Productive Hours"
    }
  ]
}

Rules:
- Identify tables that list staff positions, titles, roles, or labor roster rows.
- Return page numbers as 1-indexed PDF page numbers.
- dept must be one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}. If the table has a department column, dept may be omitted.
- titleColumnHeader is required and must be the exact printed header for the position/title/role column.
- fteColumnHeader and hoursColumnHeader are optional. Include only if the printed table has those columns.
- Do not choose salary, benefits, total compensation, hourly rate, dollar amount, or budget columns as hours.
- Do not extract position rows or numeric values. Only identify table/page/header semantics.`;

export interface PositionRow {
  title: string;
  dept: DeptCode;
  fte: number;
  hours: number;
  confidence: "high" | "low";
}

export interface LaborTableSemantic {
  page: number;
  dept?: DeptCode;
  titleColumnHeader: string;
  deptColumnHeader?: string;
  fteColumnHeader?: string;
  hoursColumnHeader?: string;
}

interface SemanticResponse {
  tables?: unknown;
}

function json(body: { ok: boolean; positions?: PositionRow[]; message?: string }, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function laborRosterHybridEnabled(
  value = process.env.LABOR_ROSTER_HYBRID,
): boolean {
  return value !== "0";
}

export function parseLaborTableSemantics(text: string): LaborTableSemantic[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as SemanticResponse;
    if (!Array.isArray(parsed.tables)) return [];
    return parsed.tables.flatMap((raw): LaborTableSemantic[] => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const page = Number(row.page);
      const titleColumnHeader = stringField(row.titleColumnHeader);
      const dept = deptField(row.dept);
      if (!Number.isInteger(page) || page < 1 || !titleColumnHeader) return [];
      return [{
        page,
        ...(dept ? { dept } : {}),
        titleColumnHeader,
        ...optionalHeader(row, "deptColumnHeader"),
        ...optionalHeader(row, "fteColumnHeader"),
        ...optionalHeader(row, "hoursColumnHeader"),
      }];
    });
  } catch {
    return [];
  }
}

export function extractLaborRowsFromPdfTables(
  items: TextItem[],
  semantics: LaborTableSemantic[],
): PositionRow[] {
  const out: PositionRow[] = [];
  const seen = new Set<string>();
  for (const semantic of semantics) {
    const pageItems = items.filter((item) => item.page === semantic.page);
    const rows = clusterRows(pageItems);
    const headerIndex = findHeaderRowIndex(rows, semantic.titleColumnHeader);
    if (headerIndex < 0) continue;
    const anchors = laborColumnAnchors(rows, headerIndex, semantic);
    if (!anchors.some((anchor) => anchor.key === "title")) continue;

    for (const row of rows.slice(headerIndex + 1)) {
      const cells = cellsForAnchors(row, anchors);
      const title = cleanCell(cells.title ?? "");
      if (!title || shouldSkipTitle(title)) continue;
      const dept = cells.dept ? deptField(cells.dept) : semantic.dept;
      if (!dept) continue;
      const fteParsed = parseFteCell(cells.fte);
      const hoursParsed = parseHoursCell(cells.hours);
      const fte = fteParsed ?? DEFAULT_FTE;
      const hours = hoursParsed ?? DEFAULT_HOURS;
      if (fte <= 0 || hours <= 0) continue;
      const key = `${dept}|${title.toLowerCase()}|${fte}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        title,
        dept,
        fte,
        hours,
        confidence: fteParsed != null && hoursParsed != null ? "high" : "low",
      });
    }
  }
  return out;
}

export function discoverLaborTableSemantics(items: TextItem[]): LaborTableSemantic[] {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const pageItems = byPage.get(item.page) ?? [];
    pageItems.push(item);
    byPage.set(item.page, pageItems);
  }
  const out: LaborTableSemantic[] = [];
  for (const [page, pageItems] of byPage) {
    const rows = clusterRows(pageItems);
    const pageText = pageItems.map((item) => item.text).join(" ");
    const dept = inferDeptFromPageText(pageText);
    const generic = findBestGenericLaborHeader(rows);
    if (generic) {
      out.push({ ...generic, ...(generic.dept || !dept ? {} : { dept }) });
      continue;
    }
    const titleHeader = findPrintedTitleHeader(rows);
    if (dept && titleHeader) {
      out.push({
        page,
        dept,
        titleColumnHeader: titleHeader,
        ...findOptionalLaborHeaders(rows),
      });
    }
  }
  return out.sort((a, b) => a.page - b.page);
}

export async function handleAiParseLabor(req: Request): Promise<Response> {
  if (!laborRosterHybridEnabled()) {
    return runPdfParser(req, {
      tag: TAG,
      rowsKey: "positions",
      rowAnchor: "title",
      rowNoun: "position",
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
    msg: "labor semantic request start",
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
    const semantics = mergeLaborSemantics(
      parseLaborTableSemantics(text),
      discoverLaborTableSemantics(items),
    );
    const positions = extractLaborRowsFromPdfTables(items, semantics);

    logEvent({
      tag: TAG,
      msg: "labor deterministic extraction",
      latency_ms: Date.now() - t0,
      semantic_count: semantics.length,
      position_count: positions.length,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });
    return json({ ok: true, positions });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Unknown model error.";
    logEvent({
      level: aborted ? "info" : "error",
      tag: TAG,
      msg: aborted ? "request aborted by client" : "labor hybrid error",
      error: message,
      latency_ms: Date.now() - t0,
    });
    return json({ ok: false, message }, { status: aborted ? 499 : 502 });
  }
}

function mergeLaborSemantics(
  aiSemantics: LaborTableSemantic[],
  discovered: LaborTableSemantic[],
): LaborTableSemantic[] {
  const byPage = new Map<number, LaborTableSemantic>();
  for (const row of discovered) byPage.set(row.page, row);
  for (const row of aiSemantics) {
    byPage.set(row.page, { ...(byPage.get(row.page) ?? {}), ...row });
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

function findBestGenericLaborHeader(rows: TextItem[][]): LaborTableSemantic | null {
  for (const row of rows) {
    const text = rowText([row]);
    if (!/(position|title|role|classification|job)/.test(text)) continue;
    if (!/(dept|department|division|fte|hours|productive)/.test(text)) continue;
    const title = row.find((item) => /(position|title|role|classification|job)/i.test(item.text));
    if (!title) continue;
    const dept = row.find((item) => /(dept|department|division)/i.test(item.text));
    const fte = row.find((item) => /\bfte\b|full.?time/i.test(item.text));
    const hours = row.find((item) => /(productive|annual|hours|hrs)/i.test(item.text));
    return {
      page: title.page,
      titleColumnHeader: title.text,
      ...(dept ? { deptColumnHeader: dept.text } : {}),
      ...(fte ? { fteColumnHeader: fte.text } : {}),
      ...(hours ? { hoursColumnHeader: hours.text } : {}),
    };
  }
  return null;
}

function findPrintedTitleHeader(rows: TextItem[][]): string | null {
  for (const row of rows) {
    const item = row.find((cell) => /(position|title|role|classification|job)/i.test(cell.text));
    if (item) return item.text;
  }
  return null;
}

function findOptionalLaborHeaders(rows: TextItem[][]): Partial<LaborTableSemantic> {
  for (const row of rows) {
    const text = rowText([row]);
    if (!/(position|title|role|classification|job)/.test(text)) continue;
    const fte = row.find((item) => /\bfte\b|full.?time/i.test(item.text));
    const hours = row.find((item) => /(productive|annual|hours|hrs)/i.test(item.text));
    return {
      ...(fte ? { fteColumnHeader: fte.text } : {}),
      ...(hours ? { hoursColumnHeader: hours.text } : {}),
    };
  }
  return {};
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalHeader(row: Record<string, unknown>, key: keyof LaborTableSemantic): Partial<LaborTableSemantic> {
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

function findHeaderRowIndex(rows: TextItem[][], titleColumnHeader: string): number {
  const target = normalizedHeader(titleColumnHeader);
  let best = -1;
  let bestScore = 0;
  rows.forEach((row, index) => {
    const text = rowText([row]);
    const score = row.some((item) => headerMatches(item.text, titleColumnHeader))
      ? 3
      : text.includes(target) || target.includes(text) ? 2
      : text.includes("position") || text.includes("title") || text.includes("role") || text.includes("classification") ? 1
      : 0;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return bestScore > 0 ? best : -1;
}

type LaborAnchorKey = "title" | "dept" | "fte" | "hours";

interface LaborColumnAnchor {
  key: LaborAnchorKey;
  x: number;
  left: number;
  right: number;
}

function laborColumnAnchors(
  rows: TextItem[][],
  headerIndex: number,
  semantic: LaborTableSemantic,
): LaborColumnAnchor[] {
  const headerY = rowY(rows[headerIndex]);
  const headerRows = rows.filter((row) => {
    const y = rowY(row);
    return y >= headerY - 70 && y <= headerY + 16;
  });
  const candidates: Array<{ key: LaborAnchorKey; header?: string }> = [
    { key: "title", header: semantic.titleColumnHeader },
    { key: "dept", header: semantic.deptColumnHeader },
    { key: "fte", header: semantic.fteColumnHeader },
    { key: "hours", header: semantic.hoursColumnHeader },
  ];
  const anchors = candidates.flatMap((candidate): LaborColumnAnchor[] => {
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

function cellsForAnchors(row: TextItem[], anchors: LaborColumnAnchor[]): Partial<Record<LaborAnchorKey, string>> {
  const cells = new Map<LaborAnchorKey, string[]>();
  const sorted = [...anchors].sort((a, b) => a.x - b.x);
  for (const item of row) {
    const itemCenter = item.x + item.width / 2;
    let best: LaborColumnAnchor | null = null;
    let bestDistance = Infinity;
    for (const anchor of sorted) {
      const probe = anchor.key === "dept" || anchor.key === "fte" || anchor.key === "hours"
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

function columnBounds(x: number, centers: number[]): Pick<LaborColumnAnchor, "left" | "right"> {
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
  if ((t.includes("title") || t.includes("position") || t.includes("role")) &&
    (h.includes("title") || h.includes("position") || h.includes("role") || h.includes("classification") || h.includes("job"))) return 2;
  if (t.includes("dept") && (h.includes("department") || h === "dept" || h.includes("division"))) return 2;
  if (t.includes("fte") && (h.includes("fte") || h.includes("fulltime"))) return 2;
  if ((t.includes("hour") || t.includes("productive")) && (h.includes("hour") || h.includes("hrs") || h.includes("productive"))) return 2;
  return 0;
}

function cleanCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shouldSkipTitle(title: string): boolean {
  const text = title.trim().toLowerCase();
  if (!text) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^(totals?|subtotals?|grand total|department total|position|title|role|classification|job title)$/.test(text)) return true;
  if (text.includes("vacant")) return true;
  if (text.startsWith("nbs - local government") || text.startsWith("web:")) return true;
  return false;
}

function inferDeptFromPageText(text: string): DeptCode | undefined {
  const normalized = text.toLowerCase();
  if (normalized.includes("planning department") || normalized.includes("planning staffing")) return "PLAN";
  if (normalized.includes("building department") || normalized.includes("building staffing")) return "BLDG";
  if (normalized.includes("engineering department") || normalized.includes("engineering staffing")) return "ENG";
  if (normalized.includes("finance department") || normalized.includes("finance staffing")) return "FIN";
  return undefined;
}

function parseFteCell(value: string | undefined): number | undefined {
  const parsed = parseNumericCell(value);
  if (parsed == null) return undefined;
  if (parsed < 0 || parsed > 10) return undefined;
  return parsed;
}

function parseHoursCell(value: string | undefined): number | undefined {
  const parsed = parseNumericCell(value);
  if (parsed == null) return undefined;
  if (parsed <= 0 || parsed > 3000) return undefined;
  return parsed;
}

function parseNumericCell(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text || /^[-–—]$/.test(text) || /^n\/?a$/i.test(text)) return undefined;
  if (/[$%]/.test(text)) return undefined;
  const cleaned = text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]*\)/g, "")
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
