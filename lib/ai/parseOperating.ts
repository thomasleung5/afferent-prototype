import type { CostType, LaborType, OperatingLine, OpCategory, OpDept } from "@/lib/types";
import { normalizeDeptName } from "@/lib/data/departments";
import type { SourceLineage, UnmappedRow } from "@/lib/parse/types";
import { aiApiPost } from "./aiApi";

interface OperatingRow {
  code?: string;
  dept: string;
  /** Raw department / division / program name as written in the source
   *  document, preserved verbatim for audit trace. The normalized
   *  `dept` is what the engine uses; `sourceDept` is what reviewers
   *  see to confirm the model's mapping. */
  sourceDept?: string;
  /** Fiscal year the amount belongs to, e.g. "FY 2025-26". Omitted by
   *  the model when not clear in the document. */
  fiscalYear?: string;
  /** Basis of the amount column when the document distinguishes
   *  multiple bases (Actual / Adopted / Proposed / Amended / Estimated
   *  / Budgeted). Omitted when ambiguous. */
  amountType?: "adopted" | "proposed" | "amended" | "actual" | "estimated" | "budgeted";
  category: string;
  line: string;
  amount: number;
  include?: boolean;
  excludeReason?: string;
  confidence: "high" | "low";
}

interface AiParseOperatingResult {
  ok: boolean;
  operating: OperatingRow[];
  message?: string;
}

export async function aiParseOperatingPdf(file: File): Promise<AiParseOperatingResult> {
  const form = new FormData();
  form.append("file", file);
  const body = await aiApiPost<AiParseOperatingResult>("/api/ai/parse-operating", form);
  if (!body.ok) return { ok: false, operating: [], message: body.message };
  return body;
}

export function operatingToExtractionResult(
  rows: OperatingRow[],
  fileName: string,
) {
  const now = new Date().toISOString();

  const mapped: { entity: OperatingLine; lineage: SourceLineage }[] = [];
  const lowConfidence: { entity: OperatingLine; lineage: SourceLineage }[] = [];
  const unmapped: UnmappedRow[] = [];

  rows.forEach((row, i) => {
    // Skip non-line-items the model occasionally returns (totals,
    // subtotals, narrative rows that survived its rules). These
    // shouldn't ever land in the model — silent skip mirrors the
    // blank-row handling in the Excel mapper.
    if (isOperatingTotalRow(row.line ?? "")) return;

    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        code: row.code ?? null,
        dept: row.dept,
        category: row.category,
        line: row.line,
        amount: row.amount,
      },
      confidence: row.confidence === "high" ? ("high" as const) : ("review" as const),
      importedAt: now,
    };

    const dept = normDept(row.dept);
    if (!dept) {
      // Out-of-scope / unknown department — preserve the row so the
      // analyst sees what the model proposed and can route it via the
      // existing review queue. Previously this branch silently dropped
      // the row, hiding the model's work.
      unmapped.push({
        reason: "ambiguous-dept",
        raw: [
          row.code ?? "",
          row.dept ?? "",
          row.category ?? "",
          row.line ?? "",
          row.amount ?? 0,
        ],
        lineage,
      });
      return;
    }

    const category = normCategory(row.category);
    const costType = classifyCostType(row);

    // Two-stage exclusion decision:
    //   1. Honor the model's call when it set include=false (and use
    //      its excludeReason verbatim when supplied).
    //   2. Otherwise apply the shared classifier so analyst-tagged
    //      exclusions (capital outlay, debt service, transfers, pass-
    //      throughs, applicant-reimbursed, one-time) come back with
    //      include=false even when the model missed them — keeps the
    //      Excel + AI paths in lockstep on identical text.
    let include: boolean;
    let excludeReason: string | undefined;
    if (row.include === false) {
      include = false;
      excludeReason = row.excludeReason?.trim() || classifyOperatingExclusion({
        line: row.line ?? "",
        category,
      }).excludeReason;
    } else {
      const policy = classifyOperatingExclusion({ line: row.line ?? "", category });
      include = policy.include;
      excludeReason = policy.excludeReason;
    }

    const entity: OperatingLine = {
      id: `op-ai-${Date.now()}-${i}`,
      code: row.code?.trim() || "—",
      dept,
      ...(row.sourceDept?.trim() ? { sourceDept: row.sourceDept.trim() } : {}),
      category,
      costType,
      ...(costType === "Labor" ? { laborType: classifyLaborType(row) } : {}),
      line: row.line,
      amount: row.amount ?? 0,
      source: "imported",
      sourceFile: fileName,
      include,
      ...(excludeReason ? { excludeReason } : {}),
    };

    const extracted = { entity, lineage };
    // Negative amounts always get reviewer attention even when the
    // model said "high" — they're ambiguous by policy.
    if (row.confidence === "low" || (typeof row.amount === "number" && row.amount < 0)) {
      lowConfidence.push(extracted);
    } else {
      mapped.push(extracted);
    }
  });

  return {
    mapped,
    lowConfidence,
    unmapped,
    duplicates: [],
    stats: {
      total: rows.length,
      mapped: mapped.length,
      lowConfidence: lowConfidence.length,
      unmapped: unmapped.length,
      duplicates: 0,
      detected: "Operating budget (AI parsed)",
    },
  };
}

function normDept(v: string): OpDept | null {
  const s = v.trim().toUpperCase().replace(/\s+/g, " ");
  const canonical = normalizeDeptName(v);
  if (canonical) return canonical;
  if (s === "SHARED:CDS" || s === "SHARED" || s === "CDS") return "SHARED:CDS";
  if (["COMMUNITY DEVELOPMENT", "COMMUNITY DEVELOPMENT DEPARTMENT", "DEVELOPMENT SERVICES"].includes(s)) return "SHARED:CDS";
  return null;
}

const OP_CATEGORIES: OpCategory[] = [
  "Software & subscriptions",
  "Professional services",
  "Training & travel",
  "Office & supplies",
  "Memberships & dues",
  "Vehicles & equipment",
  "Legal noticing",
  "Capital outlay",
  "Other",
];

function normCategory(v: string): OpCategory {
  const s = v.trim();
  const match = OP_CATEGORIES.find((c) => c.toLowerCase() === s.toLowerCase());
  return match ?? "Other";
}

/** Keyword pattern matching the labor-burden vocabulary cities use in
 *  budget books — salaries/benefits/overtime/payroll tax/workers' comp/
 *  wellness/temp labor/burden. Conservative: if the line text doesn't
 *  hit any of these tokens, classify as Operating. Reviewers can flip
 *  the field by editing the row. */
const LABOR_PATTERNS: RegExp[] = [
  /\bsalar(?:y|ies)\b/i,
  /\bwages?\b/i,
  /\bbenefits?\b/i,
  /\bfringe\b/i,
  /\bovertime\b/i,
  /\bpayroll\s*tax(?:es)?\b/i,
  /\bfica\b/i,
  /\bmedicare\b/i,
  /\boasdi\b/i,
  /\bworkers?(?:'|’)?\s*comp(?:ensation)?\b/i,
  /\bwellness\b/i,
  /\b(?:temp(?:orary)?|part[-\s]?time|seasonal)\s+labor\b/i,
  /\blabor\s+burden\b/i,
  /\bretirement\b/i,
  /\bpension\b/i,
  /\bpers\b/i,
];

function classifyCostType(row: OperatingRow): CostType {
  const text = `${row.line ?? ""} ${row.category ?? ""}`.trim();
  if (!text) return "Operating";
  for (const re of LABOR_PATTERNS) {
    if (re.test(text)) return "Labor";
  }
  return "Operating";
}

/** Pattern matching the Salary side of the two-value LaborType taxonomy:
 *  direct-compensation accounts the cities universally call salaries,
 *  wages, overtime, premium pay, shift pay, temporary pay. Everything
 *  else under costType "Labor" falls through to "Benefits" (the safe
 *  default per the spec — retirement, pension, healthcare, payroll
 *  taxes, workers comp, wellness, leave accruals, labor burden). */
const SALARY_PATTERNS: RegExp[] = [
  /\bsalar(?:y|ies)\b/i,
  /\bwages?\b/i,
  /\bhourly\b/i,
  /\bovertime\b/i,
  /\b(?:temp(?:orary)?|part[-\s]?time|seasonal)\s+(?:labor|pay|wages?)\b/i,
  /\bpremium\s+pay\b/i,
  /\bshift\s+(?:pay|differential)\b/i,
  /\bstipends?\b/i,
];

/** Classify a labor-classified row into the two-value LaborType
 *  taxonomy. Exported so the persisted-state migration can backfill
 *  legacy labor rows that pre-date the field with the same rule the
 *  parser uses on fresh imports. Default Benefits when uncertain. */
export function classifyLaborType(row: { line?: string; category?: string }): LaborType {
  const text = `${row.line ?? ""} ${row.category ?? ""}`.trim();
  if (!text) return "Benefits";
  for (const re of SALARY_PATTERNS) {
    if (re.test(text)) return "Salary";
  }
  return "Benefits";
}

/* ── Operating-line exclusion + total-row detection ───────────────────
 *
 * Retention policy (shared by PDF/AI + Excel imports):
 *  - Every valid expenditure line item is RETAINED.
 *  - Capital outlay, debt service, interfund transfers, pass-throughs,
 *    applicant-reimbursed costs, and analyst-tagged one-time costs are
 *    imported with `include: false` and a clear `excludeReason` so the
 *    audit trail keeps the row visible.
 *  - Zero and negative amounts are NOT excluded by amount alone — they
 *    pass through unless one of the policy patterns above matches.
 *  - Totals / subtotals / grand totals are skipped at the row level so
 *    they don't double-count, the same way blank rows are skipped. */

const CAPITAL_OUTLAY_PATTERNS: RegExp[] = [
  /\bcapital\s+outlay\b/i,
  /\bcapital\s+improvement\b/i,
  /\bcapital\s+(?:project|asset|equipment)\b/i,
  /\bfixed\s+asset\s+purchase\b/i,
];

const DEBT_SERVICE_PATTERNS: RegExp[] = [
  /\bdebt\s+service\b/i,
  /\bprincipal\s+(?:payment|repayment)\b/i,
  /\binterest\s+(?:expense|payment)\b/i,
  /\bbond\s+(?:payment|principal|interest)\b/i,
  /\blease[-\s]+(?:principal|interest)\b/i,
];

const TRANSFER_PATTERNS: RegExp[] = [
  /\binter(?:fund|agency|departmental)\s+transfer\b/i,
  /\btransfer\s+(?:in|out|to|from)\b/i,
  /\bfund\s+transfer\b/i,
];

const PASS_THROUGH_PATTERNS: RegExp[] = [
  /\bpass[-\s]?through\b/i,
  /\breimbursable\s+(?:cost|expense|expenditure)\b/i,
  /\bgrant\s+pass[-\s]?through\b/i,
];

const APPLICANT_REIMBURSED_PATTERNS: RegExp[] = [
  /\bapplicant[-\s]+reimbursed\b/i,
  /\bapplicant[-\s]+deposit\b/i,
  /\bdeveloper[-\s]+(?:funded|reimbursed|deposit)\b/i,
  /\bdeposit[-\s]+funded\b/i,
];

const ONE_TIME_PATTERNS: RegExp[] = [
  /\bone[-\s]?time\b/i,
  /\bnon[-\s]?recurring\b/i,
];

/** Determine whether an imported operating row should land in the model
 *  as `include: true` or `include: false` + `excludeReason`. Detection
 *  is keyword-based against the line description (with capital-outlay
 *  also matching the normalized category). Returns `{ include: true }`
 *  with no `excludeReason` when no policy bucket matches.
 *
 *  Shared by the AI/PDF parser and the Excel mapper so both paths
 *  arrive at the same retention decision on identical text. */
export function classifyOperatingExclusion(
  row: { line: string; category: string },
): { include: boolean; excludeReason?: string } {
  const text = (row.line ?? "").trim();
  const cat = (row.category ?? "").trim();
  if (cat === "Capital outlay") {
    return { include: false, excludeReason: "capital outlay" };
  }
  if (!text) return { include: true };
  if (CAPITAL_OUTLAY_PATTERNS.some((re) => re.test(text))) {
    return { include: false, excludeReason: "capital outlay" };
  }
  if (DEBT_SERVICE_PATTERNS.some((re) => re.test(text))) {
    return { include: false, excludeReason: "debt service" };
  }
  if (TRANSFER_PATTERNS.some((re) => re.test(text))) {
    return { include: false, excludeReason: "transfer" };
  }
  if (PASS_THROUGH_PATTERNS.some((re) => re.test(text))) {
    return { include: false, excludeReason: "pass-through" };
  }
  if (APPLICANT_REIMBURSED_PATTERNS.some((re) => re.test(text))) {
    return { include: false, excludeReason: "applicant reimbursed" };
  }
  if (ONE_TIME_PATTERNS.some((re) => re.test(text))) {
    return { include: false, excludeReason: "one-time" };
  }
  return { include: true };
}

const TOTAL_PATTERNS: RegExp[] = [
  /^\s*total\b/i,                       // "Total Salaries & Benefits"
  /^\s*sub[-\s]?total\b/i,              // "Subtotal: …"
  /^\s*grand\s+total\b/i,
  /\b(?:department|dept|fund|division|program)\s+total\b/i,
  /\btotals?\s*[:.]?\s*$/i,             // "Operating Costs Total"
];

/** Skip-detector for total / subtotal / grand-total rows. These aren't
 *  line items — leaving them in the import would double-count against
 *  the real per-line rows underneath. Same retention rule as blank
 *  rows: increment the skipped counter and move on. */
export function isOperatingTotalRow(line: string): boolean {
  const s = (line ?? "").trim();
  if (!s) return false;
  return TOTAL_PATTERNS.some((re) => re.test(s));
}
