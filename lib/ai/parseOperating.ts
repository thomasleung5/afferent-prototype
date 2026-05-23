import type { OperatingLine, OpCategory, OpDept } from "@/lib/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import type { SourceLineage } from "@/lib/parse/types";

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
  const res = await fetch("/api/ai/parse-operating", { method: "POST", body: form });
  if (!res.ok && res.status !== 502) {
    const text = await res.text().catch(() => "");
    return { ok: false, operating: [], message: text || `HTTP ${res.status}` };
  }
  const body = await res.json() as AiParseOperatingResult;
  return body;
}

export function operatingToExtractionResult(
  rows: OperatingRow[],
  fileName: string,
) {
  const now = new Date().toISOString();

  const mapped: { entity: OperatingLine; lineage: SourceLineage }[] = [];
  const lowConfidence: { entity: OperatingLine; lineage: SourceLineage }[] = [];

  rows.forEach((row, i) => {
    const dept = normDept(row.dept);
    if (!dept) return; // skip rows the model returned with depts outside FEE_DEPTS / SHARED:CDS

    const lineage = {
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

    const entity: OperatingLine = {
      id: `op-ai-${Date.now()}-${i}`,
      code: row.code?.trim() || "—",
      dept,
      ...(row.sourceDept?.trim() ? { sourceDept: row.sourceDept.trim() } : {}),
      category: normCategory(row.category),
      line: row.line,
      amount: row.amount ?? 0,
      source: "imported",
      sourceFile: fileName,
      include: row.include !== false,
      ...(row.include === false && row.excludeReason
        ? { excludeReason: row.excludeReason }
        : {}),
    };

    const extracted = { entity, lineage };
    if (row.confidence === "low") lowConfidence.push(extracted);
    else mapped.push(extracted);
  });

  return {
    mapped,
    lowConfidence,
    unmapped: [],
    duplicates: [],
    stats: {
      total: rows.length,
      mapped: mapped.length,
      lowConfidence: lowConfidence.length,
      unmapped: 0,
      duplicates: 0,
      detected: "Operating budget (AI parsed)",
    },
  };
}

function normDept(v: string): OpDept | null {
  const s = v.trim().toUpperCase();
  if ((FEE_DEPTS as readonly string[]).includes(s)) return s as OpDept;
  if (s === "SHARED:CDS" || s === "SHARED" || s === "CDS") return "SHARED:CDS";
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
