import type { Service } from "@/lib/types";
import type { SourceLineage } from "@/lib/parse/types";

interface FeeRow {
  name: string;
  dept: string;
  fee: number;
  peer?: number;
  target?: number;
  confidence: "high" | "low";
}

export interface AiParseFeesResult {
  ok: boolean;
  fees: FeeRow[];
  message?: string;
}

export async function aiParseFeesPdf(file: File): Promise<AiParseFeesResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/ai/parse-fees", { method: "POST", body: form });
  if (!res.ok && res.status !== 502) {
    const text = await res.text().catch(() => "");
    return { ok: false, fees: [], message: text || `HTTP ${res.status}` };
  }
  const body = await res.json() as AiParseFeesResult;
  return body;
}

/** Convert AI fee rows into the ExtractionResult shape mergeFeeSchedule expects. */
export function feesToExtractionResult(
  fees: FeeRow[],
  existing: Service[],
  fileName: string,
) {
  const existingByName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
  const now = new Date().toISOString();

  const mapped: { entity: Service; lineage: SourceLineage }[] = [];
  const lowConfidence: { entity: Service; lineage: SourceLineage }[] = [];
  const duplicates: { entity: Service; lineage: SourceLineage }[] = [];

  fees.forEach((row, i) => {
    const dept = normDept(row.dept);
    if (!dept) return;

    const lineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: { name: row.name, dept: row.dept, fee: row.fee },
      confidence: row.confidence === "high" ? ("high" as const) : ("review" as const),
      importedAt: now,
    };

    const existingSvc = existingByName.get(row.name.toLowerCase());
    const entity: Service = existingSvc
      ? { ...existingSvc, fee: row.fee, peer: row.peer ?? existingSvc.peer, target: row.target ?? existingSvc.target }
      : {
          id: `svc-ai-${i}`,
          name: row.name,
          dept,
          fee: row.fee,
          peer: row.peer ?? 0,
          target: row.target ?? 100,
          hours: 0,
          volume: 0,
          cost: 0,
          source: "imported",
          sourceFile: fileName,
        };

    const extracted = { entity, lineage };
    if (existingSvc) duplicates.push(extracted);
    else if (row.confidence === "low") lowConfidence.push(extracted);
    else mapped.push(extracted);
  });

  return {
    mapped,
    lowConfidence,
    unmapped: [],
    duplicates,
    stats: {
      total: fees.length,
      mapped: mapped.length,
      lowConfidence: lowConfidence.length,
      unmapped: 0,
      duplicates: duplicates.length,
      detected: "Fee schedule (AI parsed)",
    },
  };
}

function normDept(v: string): Service["dept"] | null {
  const s = v.trim().toUpperCase();
  if (s === "PLAN" || s === "BLDG" || s === "ENG") return s;
  return null;
}
