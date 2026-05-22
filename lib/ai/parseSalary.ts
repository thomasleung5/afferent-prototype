import type { Position } from "@/lib/types";
import type { SourceLineage } from "@/lib/parse/types";
import { FEE_DEPTS } from "@/lib/data/departments";

interface PositionRow {
  title: string;
  dept: string;
  fte: number;
  salary: number;
  benefits: number;
  hours: number;
  confidence: "high" | "low";
}

export interface AiParseSalaryResult {
  ok: boolean;
  positions: PositionRow[];
  message?: string;
}

export async function aiParseSalaryPdf(file: File): Promise<AiParseSalaryResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/ai/parse-salary", { method: "POST", body: form });
  if (!res.ok && res.status !== 502) {
    const text = await res.text().catch(() => "");
    return { ok: false, positions: [], message: text || `HTTP ${res.status}` };
  }
  const body = await res.json() as AiParseSalaryResult;
  return body;
}

export function salaryToExtractionResult(
  rows: PositionRow[],
  fileName: string,
) {
  const now = new Date().toISOString();

  const mapped: { entity: Position; lineage: SourceLineage }[] = [];
  const lowConfidence: { entity: Position; lineage: SourceLineage }[] = [];

  rows.forEach((row, i) => {
    const dept = normDept(row.dept);
    if (!dept) return;

    const lineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: { title: row.title, dept: row.dept, salary: row.salary },
      confidence: row.confidence === "high" ? ("high" as const) : ("review" as const),
      importedAt: now,
    };

    const entity: Position = {
      id: `pos-ai-${Date.now()}-${i}`,
      title: row.title,
      dept,
      fte: row.fte ?? 1,
      salary: row.salary ?? 0,
      benefits: row.benefits ?? 0,
      hours: row.hours ?? 1720,
      source: "imported",
      sourceFile: fileName,
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
      detected: "Salary roster (AI parsed)",
    },
  };
}

function normDept(v: string): Position["dept"] | null {
  const s = v.trim().toUpperCase();
  if ((FEE_DEPTS as readonly string[]).includes(s)) return s as Position["dept"];
  return null;
}
