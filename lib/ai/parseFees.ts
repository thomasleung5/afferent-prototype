import type { Service } from "@/lib/types";
import type { SourceLineage } from "@/lib/parse/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import { mapLegacyUnit } from "@/lib/data/feeUnits";
import { aiApiPost } from "./aiApi";
import { newServiceId } from "./serviceId";

interface FeeRow {
  name: string;
  dept: string;
  /** Pricing unit as written in the document ("each", "per hour",
   *  "per $1,000 valuation", "deposit", …). Optional — many fee
   *  schedules don't surface a unit column explicitly. */
  unit?: string;
  fee: number;
  confidence: "high" | "low";
}

interface AiParseFeesResult {
  ok: boolean;
  fees: FeeRow[];
  message?: string;
}

export async function aiParseFeesPdf(file: File): Promise<AiParseFeesResult> {
  const form = new FormData();
  form.append("file", file);
  const body = await aiApiPost<AiParseFeesResult>("/api/ai/parse-fees", form);
  if (!body.ok) return { ok: false, fees: [], message: body.message };
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
      rawCells: { name: row.name, dept: row.dept, unit: row.unit ?? null, fee: row.fee },
      confidence: row.confidence === "high" ? ("high" as const) : ("review" as const),
      importedAt: now,
    };

    const unitOption = mapLegacyUnit(row.unit);
    const unitPatch = unitOption
      ? { unitLabel: unitOption.label, unitType: unitOption.type }
      : {};
    const existingSvc = existingByName.get(row.name.toLowerCase());
    // Import only carries identity + price + unit; Fee #, Cost, Recommended,
    // Recovery, and Impact are software-derived downstream. For existing
    // services we update fee + unit only and leave the rest of the row
    // (target, peer, hours, volume, …) untouched.
    const entity: Service = existingSvc
      ? { ...existingSvc, fee: row.fee, ...unitPatch }
      : {
          id: newServiceId(dept, row.name),
          name: row.name,
          dept,
          fee: row.fee,
          peer: 0,
          target: 100,
          hours: 0,
          volume: 0,
          cost: 0,
          ...unitPatch,
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
  if ((FEE_DEPTS as readonly string[]).includes(s)) return s as Service["dept"];
  return null;
}
