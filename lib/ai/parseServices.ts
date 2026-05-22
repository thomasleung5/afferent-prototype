import type { Service } from "@/lib/types";
import type { SourceLineage } from "@/lib/parse/types";
import { FEE_DEPTS } from "@/lib/data/departments";

interface ServiceRow {
  name: string;
  dept: string;
  hours: number;
  volume?: number;
  fee?: number;
  target?: number;
  confidence: "high" | "low";
}

export interface AiParseServicesResult {
  ok: boolean;
  services: ServiceRow[];
  message?: string;
}

export async function aiParseServicesPdf(
  file: File,
  catalog: { name: string; dept: string }[],
): Promise<AiParseServicesResult> {
  const form = new FormData();
  form.append("file", file);
  if (catalog.length > 0) {
    form.append("catalog", JSON.stringify(catalog));
  }
  const res = await fetch("/api/ai/parse-services", { method: "POST", body: form });
  if (!res.ok && res.status !== 502) {
    const text = await res.text().catch(() => "");
    return { ok: false, services: [], message: text || `HTTP ${res.status}` };
  }
  const body = await res.json() as AiParseServicesResult;
  return body;
}

export function servicesToExtractionResult(
  rows: ServiceRow[],
  existing: Service[],
  fileName: string,
) {
  const existingByName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
  const now = new Date().toISOString();

  const mapped: { entity: Service; lineage: SourceLineage }[] = [];
  const lowConfidence: { entity: Service; lineage: SourceLineage }[] = [];
  const duplicates: { entity: Service; lineage: SourceLineage }[] = [];

  rows.forEach((row, i) => {
    const dept = normDept(row.dept);
    if (!dept) return;

    const lineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: { name: row.name, dept: row.dept, hours: row.hours },
      confidence: row.confidence === "high" ? ("high" as const) : ("review" as const),
      importedAt: now,
    };

    const existingSvc = existingByName.get(row.name.toLowerCase());
    const entity: Service = existingSvc
      ? {
          ...existingSvc,
          hours: row.hours ?? existingSvc.hours,
          volume: row.volume ?? existingSvc.volume,
          fee: row.fee ?? existingSvc.fee,
          target: row.target ?? existingSvc.target,
        }
      : {
          id: `svc-ai-${i}`,
          name: row.name,
          dept,
          hours: row.hours ?? 0,
          volume: row.volume ?? 0,
          fee: row.fee ?? 0,
          peer: 0,
          target: row.target ?? 100,
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
      total: rows.length,
      mapped: mapped.length,
      lowConfidence: lowConfidence.length,
      unmapped: 0,
      duplicates: duplicates.length,
      detected: "Service catalog (AI parsed)",
    },
  };
}

function normDept(v: string): Service["dept"] | null {
  const s = v.trim().toUpperCase();
  if ((FEE_DEPTS as readonly string[]).includes(s)) return s as Service["dept"];
  return null;
}
