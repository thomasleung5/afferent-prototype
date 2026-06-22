import Anthropic from "@anthropic-ai/sdk";
import { FEE_DEPTS, normalizeDeptName } from "../lib/data/departments";
import type { OpCategory, OpDept } from "../lib/types";
import { OP_CATEGORIES } from "../lib/ai/parseOperating";
import { readPdfUpload } from "./aiUploadValidator";
import { runPdfParser } from "./aiParseRunner";
import { logEvent } from "./logger";
import {
  clusterRows, extractTextItems, type TextItem,
} from "./pdfTableExtract";

const TAG = "ai-parse-operating";
const MODEL = "claude-sonnet-4-6";

const LEGACY_SYSTEM = `You are extracting expenditure line items (both operating AND personnel) from a municipal budget document. The document may be a budget book, an ERP/GL export, a fund-detail report, or a department appendix inside a larger fee study — only the line-item rows matter.

IMPORTANT — if the document is a comprehensive fee study, annual report, or multi-section document:
- Skip narrative chapters, methodology sections, executive summaries, recommendation tables, and revenue/fee tables
- Focus on the expenditure tables: sections titled "Operating Expenditures", "Services & Supplies", "Materials & Services", "Operating Budget Detail", "Expenditure Detail", AND personnel sections titled "Salaries & Benefits", "Personnel", "Personnel Services", "Personnel Budget", "Compensation", or any tabular section listing account-level expenditure lines (operating or personnel) with adopted/budgeted amounts
- In ERP/GL exports, "Salaries & Benefits" may appear as an account_category column value rather than as a section title. Those rows are personnel expenditure line items and MUST be extracted when the department is in scope.
- Do not read or process narrative paragraphs — jump directly to the expenditure tables

Extract every expenditure line item you find — operating AND personnel — and return ONLY this JSON, no prose:

{
  "operating": [
    { "code": "51110", "dept": "PLAN", "sourceDept": "Planning Division", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Other Operational Expenses", "line": "Regular Salaries", "amount": 850000, "include": true, "confidence": "high" },
    { "code": "53120", "dept": "PLAN", "sourceDept": "Planning Division", "fiscalYear": "FY 2025-26", "amountType": "adopted", "category": "Professional & Contractual Services", "line": "Consulting Services", "amount": 620000, "include": true, "confidence": "high" }
  ]
}

Rules:
- dept must be exactly one of: ${FEE_DEPTS.map((dept) => `"${dept}"`).join(", ")}, or "SHARED:CDS" (shared Community Development / Development Services)
- sourceDept must preserve the raw department / division / program name EXACTLY as written in the document (e.g. "Planning Division", "Building & Safety", "Public Works — Development Engineering", "Community Development Department"). Do not normalize or shorten it.
- Department inclusion logic:
  * INCLUDE: any listed fee department when the line item supports a fee-bearing service, including Administration, Clerk, Finance, Planning, Building / Inspection, Code Enforcement, Engineering / Development Engineering, Parks & Recreation, Police, Fire / Fire Prevention, Public Works, Utilities, and any shared Community Development / Development Services umbrella that contains those functions.
  * Public Works rows: when the section or line clearly relates to development engineering, permit review, encroachment permits, grading, inspections, plan check, land development, or fee-supported development services — map dept="ENG" and set confidence as warranted.
  * Out-of-scope departments (streets, parks operations, utilities operations, sewer/water/storm drain, fleet, facilities, refuse, Library, City Manager, HR, IT unless billed to a fee-supported division, etc.): RETURN the row anyway. Map dept to the closest fee-supported code you can justify (or to the listed dept the source document used if it's already in the enum) and set confidence="low". The downstream importer routes uncertain depts to an analyst review queue with source lineage — do not silently drop the row.
- Personnel lines ARE in scope — extract regular salaries, overtime, part-time wages, retirement contributions, PERS, OPEB, health insurance, dental, vision, payroll taxes, Medicare, FICA, workers' comp, life insurance, and similar pay/benefit accounts. Do NOT skip a row just because account_category is "Salaries & Benefits"; extract it and set category="Other". Preserve the source line text exactly (e.g. "Regular Salaries", "Health Insurance", "Retirement (PERS)") — downstream classification reads the line text to tag rows as Salary vs Benefits automatically.
- category must be exactly one of these thirteen values — pick the closest match. For personnel lines (salaries, benefits, retirement, etc.), use "Other Operational Expenses" — the downstream tagger reads the line text directly:
  * "Professional & Contractual Services" — consulting, contract services, legal counsel (non-noticing), plan review services, contract inspection, contract engineering, outside professional services
  * "Software & Subscriptions" — software licenses, SaaS, cloud services, IT subscriptions, technology platforms
  * "Utilities" — electricity, water, sewer, gas, refuse, stormwater utility charges
  * "Communications" — telephone, cellular, internet, data lines, postage, mailing
  * "Insurance" — general liability, property, vehicle liability, umbrella policies (NOT workers' comp — that's personnel)
  * "Repairs & Maintenance" — facility R&M, equipment R&M, HVAC, janitorial supplies, grounds maintenance
  * "Rent & Facilities" — building rent, equipment leases, facility space charges, storage rental
  * "Travel" — mileage, per diem, lodging, airfare, parking, conference travel costs
  * "Training & Professional Development" — conferences, training fees, certifications, CEUs, registrations
  * "Memberships & Dues" — professional memberships, association dues, subscriptions to publications
  * "Vehicles & Fleet" — vehicle purchases below capitalization threshold, fuel, vehicle maintenance, fleet services
  * "Office Supplies" — office supplies, printing, general operating supplies (non-equipment)
  * "Other Operational Expenses" — anything that doesn't clearly fit above, including public hearing / legal noticing, capital outlay (still tagged include=false separately), and personnel lines awaiting downstream classification
- ERP-style category labels translate as follows: "Technology" → "Software & Subscriptions"; "Maintenance" of fleet/vehicles → "Vehicles & Fleet"; "Maintenance" of buildings/facilities → "Repairs & Maintenance"; "Operating Supplies" → "Office Supplies" unless the line clearly describes equipment (then "Vehicles & Fleet"); "Programming" → "Software & Subscriptions"; "Contract Services" / "Professional Services" → "Professional & Contractual Services"; "Legal Noticing" → "Other Operational Expenses"
- amount must be a plain JavaScript number — STRIP any "$" sign, commas, and whitespace ("$620,000" → 620000). Drop any text-formatted ranges, percentages, or footnote markers.
- Zero amounts: RETAIN. A line item with amount=0 is still a real line item the analyst will review (e.g., a placeholder budget line, a category the city intends to fund later). Do not drop it just because the dollar value is 0.
- Negative amounts: RETAIN as a negative JavaScript number (e.g. -12500) and set confidence to "low" so the reviewer sees it on the audit list. Do not skip negatives.
- code is the GL account number / object code if present (e.g. "53120"); omit the field if the document has no account numbers
- line is the human-readable description of the expenditure (e.g. "Consulting Services", "Software Subscriptions")
- fiscalYear: include the fiscal year that the amount belongs to, formatted as "FY 2025-26" (or "FY 2025" for single-year jurisdictions). Omit the field entirely if the document does not make the fiscal year clear for the row's column.
- amountType: include one of "adopted", "proposed", "amended", "actual", "estimated", "budgeted" when the column heading or section title makes the basis clear. Prefer ADOPTED or current-budget amounts when the document presents multiple columns (e.g. Actual / Adopted / Proposed). Omit the field when the basis is ambiguous.
- include defaults to true for recurring operating costs (services & supplies, contracts, software, materials, vehicle maintenance, utilities, professional services, etc.) AND for recurring personnel costs (salaries, wages, retirement, healthcare, payroll taxes, etc.).
- Set include=false (with an excludeReason) — DO NOT drop the row — for any of:
  * Capital outlay; capital improvement project; capital asset / equipment purchase — excludeReason: "capital outlay"
  * Debt service; principal / interest payment; bond / lease principal or interest — excludeReason: "debt service"
  * Interfund / interagency / interdepartmental transfers; "Transfer in/out"; fund transfer — excludeReason: "transfer"
  * Reimbursed pass-throughs; grant pass-throughs; reimbursable cost/expense — excludeReason: "pass-through"
  * Applicant-reimbursed / developer-funded / deposit-funded costs — excludeReason: "applicant reimbursed"
  * Lines the document explicitly marks one-time, non-recurring — excludeReason: "one-time"
- IMPORTANT: when in doubt about whether a line falls into one of these buckets, set include=true. The downstream importer applies the same keyword classifier and will set include=false for any line it recognizes, so you never need to over-exclude.
- confidence: "high" if dept, category, line, and amount are all clear from the document; "low" if any are ambiguous, estimated, or inferred from context (and always "low" when including a negative-amount adjustment)
- Skip totals, subtotals, grand totals, "Department Total" rows, fund totals, and summary rows
- Skip blank rows, header rows, and rows where the line description or required identity fields are missing/unreadable. Retain rows with amount=0 (those are still real line items).
- Use the exact line description as written in the document
- Return only the JSON object, nothing else`;

const SEMANTIC_SYSTEM = `You are identifying operating-budget expenditure tables in a municipal PDF.

Return ONLY this JSON:
{
  "tables": [
    {
      "page": 12,
      "dept": "PLAN",
      "sourceDept": "Planning Division",
      "codeColumnHeader": "Account",
      "lineColumnHeader": "Description",
      "deptColumnHeader": "Department",
      "categoryColumnHeader": "Category",
      "amountColumnHeader": "Adopted Budget",
      "fiscalYear": "FY 2025-26",
      "amountType": "adopted"
    }
  ]
}

Rules:
- Identify account-level expenditure tables: operating expenses, services and supplies, materials and services, salaries and benefits, personnel services, budget detail, or expenditure detail.
- Do not identify revenue tables, fee schedule tables, service catalog tables, volume tables, recommendation tables, or narrative summaries.
- Return page numbers as 1-indexed PDF page numbers.
- lineColumnHeader and amountColumnHeader are required and must be exact printed headers.
- Choose the current/adopted/budgeted amount column when multiple amount columns exist. Do not choose totals that sum multiple years.
- dept must be one of the app's fee-supported department codes or "SHARED:CDS" when inferable. If the table has a department column, dept may be omitted.
- sourceDept should preserve the printed department/program name when a page or section names it.
- amountType may be one of: adopted, proposed, amended, actual, estimated, budgeted.
- Do not extract row values. Only identify table/page/header semantics.`;

type AmountType = "adopted" | "proposed" | "amended" | "actual" | "estimated" | "budgeted";

export interface OperatingRow {
  code?: string;
  dept: string;
  sourceDept?: string;
  fiscalYear?: string;
  amountType?: AmountType;
  category: string;
  line: string;
  amount: number;
  include?: boolean;
  excludeReason?: string;
  confidence: "high" | "low";
}

export interface OperatingTableSemantic {
  page: number;
  dept?: OpDept;
  sourceDept?: string;
  codeColumnHeader?: string;
  lineColumnHeader: string;
  deptColumnHeader?: string;
  categoryColumnHeader?: string;
  amountColumnHeader: string;
  fiscalYear?: string;
  amountType?: AmountType;
}

interface SemanticResponse {
  tables?: unknown;
}

function json(body: { ok: boolean; operating?: OperatingRow[]; message?: string }, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function operatingBudgetHybridEnabled(
  value = process.env.OPERATING_BUDGET_HYBRID,
): boolean {
  return value !== "0";
}

export function parseOperatingTableSemantics(text: string): OperatingTableSemantic[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as SemanticResponse;
    if (!Array.isArray(parsed.tables)) return [];
    return parsed.tables.flatMap((raw): OperatingTableSemantic[] => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const page = Number(row.page);
      const lineColumnHeader = stringField(row.lineColumnHeader);
      const amountColumnHeader = stringField(row.amountColumnHeader);
      if (!Number.isInteger(page) || page < 1 || !lineColumnHeader || !amountColumnHeader) return [];
      const dept = deptField(row.dept);
      return [{
        page,
        ...(dept ? { dept } : {}),
        ...optionalString(row, "sourceDept"),
        ...optionalString(row, "codeColumnHeader"),
        lineColumnHeader,
        ...optionalString(row, "deptColumnHeader"),
        ...optionalString(row, "categoryColumnHeader"),
        amountColumnHeader,
        ...optionalString(row, "fiscalYear"),
        ...optionalAmountType(row.amountType),
      }];
    });
  } catch {
    return [];
  }
}

export function extractOperatingRowsFromPdfTables(
  items: TextItem[],
  semantics: OperatingTableSemantic[],
): OperatingRow[] {
  const out: OperatingRow[] = [];
  const seen = new Set<string>();
  for (const semantic of semantics) {
    const pageItems = items.filter((item) => item.page === semantic.page);
    const rows = clusterRows(pageItems);
    const headerIndex = findHeaderRowIndex(rows, semantic.lineColumnHeader);
    if (headerIndex < 0) continue;
    const anchors = operatingColumnAnchors(rows, headerIndex, semantic);
    if (!anchors.some((anchor) => anchor.key === "line") || !anchors.some((anchor) => anchor.key === "amount")) continue;

    for (const row of rows.slice(headerIndex + 1)) {
      const cells = cellsForAnchors(row, anchors);
      const line = cleanCell(cells.line ?? "");
      if (!line || shouldSkipLine(line)) continue;
      const amount = parseAmountCell(cells.amount);
      if (amount == null) continue;
      const dept = cells.dept ? deptField(cells.dept) : semantic.dept;
      const sourceDept = cleanCell(cells.dept ?? semantic.sourceDept ?? "");
      if (!dept) {
        out.push({
          ...(cleanCode(cells.code) ? { code: cleanCode(cells.code) } : {}),
          dept: sourceDept || cleanCell(cells.dept ?? ""),
          ...(sourceDept ? { sourceDept } : {}),
          ...(semantic.fiscalYear ? { fiscalYear: semantic.fiscalYear } : {}),
          ...(semantic.amountType ? { amountType: semantic.amountType } : {}),
          category: categoryFromSource(cells.category),
          line,
          amount,
          include: true,
          confidence: "low",
        });
        continue;
      }
      const code = cleanCode(cells.code);
      const category = categoryFromSource(cells.category);
      const key = `${semantic.page}|${dept}|${code ?? ""}|${line.toLowerCase()}|${amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...(code ? { code } : {}),
        dept,
        ...(sourceDept ? { sourceDept } : {}),
        ...(semantic.fiscalYear ? { fiscalYear: semantic.fiscalYear } : {}),
        ...(semantic.amountType ? { amountType: semantic.amountType } : {}),
        category,
        line,
        amount,
        include: true,
        confidence: semantic.dept || cells.dept ? "high" : "low",
      });
    }
  }
  return out;
}

export function discoverOperatingTableSemantics(items: TextItem[]): OperatingTableSemantic[] {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const pageItems = byPage.get(item.page) ?? [];
    pageItems.push(item);
    byPage.set(item.page, pageItems);
  }
  const out: OperatingTableSemantic[] = [];
  for (const [page, pageItems] of byPage) {
    const rows = clusterRows(pageItems);
    const pageText = pageItems.map((item) => item.text).join(" ");
    if (looksLikeNonOperatingPage(pageText)) continue;
    const header = findBestOperatingHeader(rows);
    if (!header) continue;
    const inferredDept = inferDeptFromPageText(pageText);
    out.push({
      page,
      ...(inferredDept ? { dept: inferredDept } : {}),
      ...header,
    });
  }
  return out.sort((a, b) => a.page - b.page);
}

export async function handleAiParseOperating(req: Request): Promise<Response> {
  if (!operatingBudgetHybridEnabled()) {
    return runPdfParser(req, {
      tag: TAG,
      rowsKey: "operating",
      rowAnchor: "line",
      rowNoun: "operating",
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
    msg: "operating semantic request start",
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
    const semantics = mergeOperatingSemantics(
      parseOperatingTableSemantics(text),
      discoverOperatingTableSemantics(items),
    );
    const operating = extractOperatingRowsFromPdfTables(items, semantics);

    logEvent({
      tag: TAG,
      msg: "operating deterministic extraction",
      latency_ms: Date.now() - t0,
      semantic_count: semantics.length,
      row_count: operating.length,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });
    return json({ ok: true, operating });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Unknown model error.";
    logEvent({
      level: aborted ? "info" : "error",
      tag: TAG,
      msg: aborted ? "request aborted by client" : "operating hybrid error",
      error: message,
      latency_ms: Date.now() - t0,
    });
    return json({ ok: false, message }, { status: aborted ? 499 : 502 });
  }
}

function mergeOperatingSemantics(
  aiSemantics: OperatingTableSemantic[],
  discovered: OperatingTableSemantic[],
): OperatingTableSemantic[] {
  const byPage = new Map<number, OperatingTableSemantic>();
  for (const row of discovered) byPage.set(row.page, row);
  for (const row of aiSemantics) {
    byPage.set(row.page, { ...(byPage.get(row.page) ?? {}), ...row });
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

function findBestOperatingHeader(rows: TextItem[][]): Omit<OperatingTableSemantic, "page" | "dept"> | null {
  for (const row of rows) {
    const text = rowText([row]);
    if (!/(description|account|object|lineitem|expenditure|expense|category)/.test(text)) continue;
    if (!/(amount|budget|adopted|proposed|actual|amended|estimated|total)/.test(text)) continue;
    const line = row.find((item) => /(description|line\s*item|account\s*name|object\s*name|expenditure|expense)/i.test(item.text));
    const amount = preferredAmountHeader(row);
    if (!line || !amount) continue;
    const code = row.find((item) => /(account|object|gl|code)/i.test(item.text));
    const dept = row.find((item) => /(dept|department|division|program)/i.test(item.text));
    const category = row.find((item) => /(category|type|class|classification)/i.test(item.text));
    return {
      ...(code ? { codeColumnHeader: code.text } : {}),
      lineColumnHeader: line.text,
      ...(dept ? { deptColumnHeader: dept.text } : {}),
      ...(category ? { categoryColumnHeader: category.text } : {}),
      amountColumnHeader: amount.text,
      ...amountTypeFromHeader(amount.text),
    };
  }
  return null;
}

function preferredAmountHeader(row: TextItem[]): TextItem | undefined {
  return row.find((item) => /(adopted|approved|budgeted|current).*budget/i.test(item.text))
    ?? row.find((item) => /adopted|approved|budgeted|current/i.test(item.text))
    ?? row.find((item) => /proposed|amended|estimated|actual/i.test(item.text))
    ?? row.find((item) => /\bamount\b|\bbudget\b|\btotal\b/i.test(item.text));
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(row: Record<string, unknown>, key: keyof OperatingTableSemantic): Partial<OperatingTableSemantic> {
  const value = stringField(row[key]);
  return value ? { [key]: value } : {};
}

function optionalAmountType(value: unknown): Partial<OperatingTableSemantic> {
  const raw = stringField(value).toLowerCase();
  if (raw === "adopted" || raw === "proposed" || raw === "amended" || raw === "actual" || raw === "estimated" || raw === "budgeted") {
    return { amountType: raw };
  }
  return {};
}

function amountTypeFromHeader(header: string): Partial<OperatingTableSemantic> {
  const h = header.toLowerCase();
  if (h.includes("adopted") || h.includes("approved")) return { amountType: "adopted" };
  if (h.includes("proposed")) return { amountType: "proposed" };
  if (h.includes("amended")) return { amountType: "amended" };
  if (h.includes("actual")) return { amountType: "actual" };
  if (h.includes("estimated")) return { amountType: "estimated" };
  if (h.includes("budget")) return { amountType: "budgeted" };
  return {};
}

function deptField(value: unknown): OpDept | undefined {
  const raw = stringField(value);
  const normalized = normalizeDeptName(raw);
  if (normalized) return normalized;
  const upper = raw.trim().toUpperCase();
  if (upper === "SHARED:CDS" || upper === "SHARED" || upper === "CDS") return "SHARED:CDS";
  if (["COMMUNITY DEVELOPMENT", "COMMUNITY DEVELOPMENT DEPARTMENT", "DEVELOPMENT SERVICES"].includes(upper)) return "SHARED:CDS";
  return undefined;
}

function normalizedHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function rowText(rows: TextItem[][]): string {
  return normalizedHeader(rows.flatMap((row) => row.map((item) => item.text)).join(" "));
}

function findHeaderRowIndex(rows: TextItem[][], lineColumnHeader: string): number {
  const target = normalizedHeader(lineColumnHeader);
  let best = -1;
  let bestScore = 0;
  rows.forEach((row, index) => {
    const text = rowText([row]);
    const score = row.some((item) => headerMatches(item.text, lineColumnHeader))
      ? 3
      : text.includes(target) || target.includes(text) ? 2
      : text.includes("description") || text.includes("lineitem") || text.includes("accountname") ? 1
      : 0;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return bestScore > 0 ? best : -1;
}

type OperatingAnchorKey = "code" | "dept" | "category" | "line" | "amount";

interface OperatingColumnAnchor {
  key: OperatingAnchorKey;
  x: number;
  left: number;
  right: number;
}

function operatingColumnAnchors(
  rows: TextItem[][],
  headerIndex: number,
  semantic: OperatingTableSemantic,
): OperatingColumnAnchor[] {
  const headerY = rowY(rows[headerIndex]);
  const headerRows = rows.filter((row) => {
    const y = rowY(row);
    return y >= headerY - 70 && y <= headerY + 16;
  });
  const candidates: Array<{ key: OperatingAnchorKey; header?: string }> = [
    { key: "code", header: semantic.codeColumnHeader },
    { key: "dept", header: semantic.deptColumnHeader },
    { key: "category", header: semantic.categoryColumnHeader },
    { key: "line", header: semantic.lineColumnHeader },
    { key: "amount", header: semantic.amountColumnHeader },
  ];
  const anchors = candidates.flatMap((candidate): OperatingColumnAnchor[] => {
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

function cellsForAnchors(row: TextItem[], anchors: OperatingColumnAnchor[]): Partial<Record<OperatingAnchorKey, string>> {
  const cells = new Map<OperatingAnchorKey, string[]>();
  const sorted = [...anchors].sort((a, b) => a.x - b.x);
  for (const item of row) {
    const itemCenter = item.x + item.width / 2;
    let best: OperatingColumnAnchor | null = null;
    let bestDistance = Infinity;
    for (const anchor of sorted) {
      const probe = anchor.key === "line" ? itemCenter : item.x;
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

function columnBounds(x: number, centers: number[]): Pick<OperatingColumnAnchor, "left" | "right"> {
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
  if ((t.includes("code") || t.includes("account") || t.includes("object")) &&
    (h.includes("code") || h.includes("account") || h.includes("object") || h.includes("gl"))) return 2;
  if (t.includes("dept") && (h.includes("department") || h.includes("dept") || h.includes("division") || h.includes("program"))) return 2;
  if (t.includes("category") && (h.includes("category") || h.includes("type") || h.includes("class"))) return 2;
  if ((t.includes("line") || t.includes("description") || t.includes("name")) &&
    (h.includes("line") || h.includes("description") || h.includes("name") || h.includes("expenditure") || h.includes("expense"))) return 2;
  if ((t.includes("amount") || t.includes("budget") || t.includes("adopted")) &&
    (h.includes("amount") || h.includes("budget") || h.includes("adopted") || h.includes("proposed") || h.includes("actual") || h.includes("total"))) return 2;
  return 0;
}

function cleanCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanCode(value: string | undefined): string | undefined {
  const text = cleanCell(value ?? "");
  if (!text || text.length > 40) return undefined;
  return text;
}

function categoryFromSource(value: string | undefined): OpCategory {
  const raw = cleanCell(value ?? "");
  const match = OP_CATEGORIES.find((category) => category.toLowerCase() === raw.toLowerCase());
  return match ?? "Other Operational Expenses";
}

function shouldSkipLine(line: string): boolean {
  const text = line.trim().toLowerCase();
  if (!text) return true;
  if (/^(totals?|subtotals?|grand total|department total|fund total|description|line item|account name)$/.test(text)) return true;
  if (/\b(total|subtotal)\b/.test(text) && text.length < 80) return true;
  return false;
}

function parseAmountCell(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text || /^[-–—]$/.test(text) || /^n\/?a$/i.test(text)) return undefined;
  if (/%/.test(text) || /\d\s*[-–—]\s*\d/.test(text)) return undefined;
  const negativeByParens = /^\s*\(.*\)\s*$/.test(text);
  const cleaned = text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[()]/g, "")
    .replace(/[$,%]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return undefined;
  return negativeByParens ? -Math.abs(num) : num;
}

function looksLikeNonOperatingPage(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized.includes("fee schedule")
    || normalized.includes("cost recovery analysis")
    || normalized.includes("annual estimated revenue")
    || normalized.includes("estimated volume of activity");
}

function inferDeptFromPageText(text: string): OpDept | undefined {
  const normalized = text.toLowerCase();
  if (normalized.includes("planning department") || normalized.includes("planning division")) return "PLAN";
  if (normalized.includes("building department") || normalized.includes("building division")) return "BLDG";
  if (normalized.includes("engineering department") || normalized.includes("engineering division")) return "ENG";
  if (normalized.includes("finance department") || normalized.includes("finance division")) return "FIN";
  if (normalized.includes("community development")) return "SHARED:CDS";
  return undefined;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
