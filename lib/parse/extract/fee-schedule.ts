import type { Service } from "@/lib/types";
import type { ExtractedRow, ExtractionResult, ParsedDoc } from "../types";
import type { Confidence } from "../types";
import {
  cellNumber, cellString, matchHeaders, normalizeDept, pickSheet,
  type HeaderAlias,
} from "./match-headers";

const ALIASES: HeaderAlias[] = [
  { field: "name",        aliases: ["fee item", "fee name", "service", "description", "name"], required: true },
  { field: "dept",        aliases: ["dept", "department"], required: true },
  { field: "fee",         aliases: ["current fee", "adopted fee", "fee", "now"], required: true },
  { field: "recommended", aliases: ["recommended", "recommended fee", "proposed", "new fee"] },
  { field: "peer",        aliases: ["peer median", "peer fee", "median"] },
  { field: "target",      aliases: ["target", "recovery target"] },
];

/** Fee schedule import — same target type as Services, but the canonical
 *  columns differ. Merge strategy is "patch the fee + peer + target" on top
 *  of existing service records when the name matches. */
export function extractFeeSchedule(
  doc: ParsedDoc,
  existing: Service[] = [],
): ExtractionResult<Service> {
  const result: ExtractionResult<Service> = {
    mapped: [], lowConfidence: [], unmapped: [], duplicates: [],
    stats: { total: 0, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 0, detected: "Fee schedule" },
  };
  if (!doc.sheets) return result;
  const sheet = pickSheet(doc.sheets, ALIASES);
  if (!sheet) return result;
  const { map, missing } = matchHeaders(sheet.headers, ALIASES);
  if (missing.length > 0) {
    result.stats.detected = `Fee schedule (missing: ${missing.join(", ")})`;
    return result;
  }

  const existingByName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));

  sheet.rows.forEach((row, i) => {
    result.stats.total += 1;
    const lineage = {
      file: doc.fileName,
      sheet: sheet.name,
      row: i + 2,
      rawCells: rowMap(sheet.headers, row),
      confidence: "high" as Confidence,
      importedAt: new Date().toISOString(),
    };

    const name = cellString(row[map.name]);
    const dept = normalizeDept(row[map.dept]);
    const fee = cellNumber(row[map.fee]);
    if (!name) {
      result.unmapped.push({ reason: "blank", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }
    if (fee == null) {
      result.unmapped.push({ reason: "missing-required-field", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }
    if (!dept || dept === "SHARED:CDS") {
      result.unmapped.push({ reason: "ambiguous-dept", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }

    const existingSvc = existingByName.get(name.toLowerCase());
    const peer = cellNumber(map.peer >= 0 ? row[map.peer] : null) ?? existingSvc?.peer ?? 0;
    const target = cellNumber(map.target >= 0 ? row[map.target] : null) ?? existingSvc?.target ?? 100;

    // Preserve hours/volume/cost from the existing record — fee schedule docs
    // typically don't carry those columns.
    const entity: Service = existingSvc
      ? { ...existingSvc, fee, peer, target }
      : {
          id: `svc-${slug(name)}-${i + 1}`,
          name,
          dept,
          volume: 0,
          hours: 0,
          cost: 0,
          fee,
          peer,
          target,
        };

    let conf: "high" | "med" | "low" = "high";
    if (!existingSvc && (entity.hours === 0 || entity.volume === 0)) conf = "low";
    lineage.confidence = conf;

    const extracted: ExtractedRow<Service> = { entity, lineage };
    if (existingSvc) { result.duplicates.push(extracted); result.stats.duplicates += 1; }
    else if (conf === "low") { result.lowConfidence.push(extracted); result.stats.lowConfidence += 1; }
    else { result.mapped.push(extracted); result.stats.mapped += 1; }
  });

  return result;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}
function rowMap(headers: string[], row: (string | number | null)[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  headers.forEach((h, i) => { if (h) out[h] = row[i] ?? null; });
  return out;
}
