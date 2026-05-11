import type { WorkloadRow } from "@/lib/types";
import type { ExtractedRow, ExtractionResult, ParsedDoc } from "../types";
import type { Confidence } from "../types";
import {
  cellNumber, cellString, matchHeaders, pickSheet,
  type HeaderAlias,
} from "./match-headers";

const ALIASES: HeaderAlias[] = [
  { field: "name",    aliases: ["service", "fee item", "name", "description"], required: true },
  { field: "current", aliases: ["current", "current volume", "fy 26-27", "this year", "volume"], required: true },
  { field: "prior",   aliases: ["prior", "prior volume", "fy 25-26", "last year"] },
  { field: "unit",    aliases: ["unit", "unit type"] },
];

const SERVICE_NAME_RE = /[a-z]/i;

export function extractWorkload(
  doc: ParsedDoc,
  existing: WorkloadRow[] = [],
  services: { id: string; name: string }[] = [],
): ExtractionResult<WorkloadRow> {
  const result: ExtractionResult<WorkloadRow> = {
    mapped: [], lowConfidence: [], unmapped: [], duplicates: [],
    stats: { total: 0, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 0, detected: "Workload" },
  };
  if (!doc.sheets) return result;
  const sheet = pickSheet(doc.sheets, ALIASES);
  if (!sheet) return result;
  const { map, missing } = matchHeaders(sheet.headers, ALIASES);
  if (missing.length > 0) {
    result.stats.detected = `Workload (missing: ${missing.join(", ")})`;
    return result;
  }

  const existingById = new Map(existing.map((w) => [w.id, w]));
  const serviceByName = new Map(services.map((s) => [s.name.toLowerCase().trim(), s]));

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
    const current = cellNumber(row[map.current]);
    if (!name || !SERVICE_NAME_RE.test(name)) {
      result.unmapped.push({ reason: "blank", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }
    if (current == null) {
      result.unmapped.push({ reason: "missing-required-field", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }

    const matchedService = serviceByName.get(name.toLowerCase().trim());
    if (!matchedService) {
      result.unmapped.push({ reason: "schema-mismatch", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }

    const prior = cellNumber(map.prior >= 0 ? row[map.prior] : null);
    const unit = cellString(map.unit >= 0 ? row[map.unit] : "Item") || "Item";

    const id = matchedService.id;
    const existingRow = existingById.get(id);

    const entity: WorkloadRow = {
      id,
      prior: prior ?? existingRow?.prior ?? null,
      current,
      unit,
      source: "imported",
      status: "Imported",
      sourceFile: doc.fileName,
    };

    let conf: "high" | "med" | "low" = "high";
    if (current < 1) conf = "low";
    if (current > 5000) conf = "low";
    lineage.confidence = conf;

    const extracted: ExtractedRow<WorkloadRow> = { entity, lineage };
    if (existingRow) { result.duplicates.push(extracted); result.stats.duplicates += 1; }
    else if (conf === "low") { result.lowConfidence.push(extracted); result.stats.lowConfidence += 1; }
    else { result.mapped.push(extracted); result.stats.mapped += 1; }
  });

  return result;
}

function rowMap(headers: string[], row: (string | number | null)[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  headers.forEach((h, i) => { if (h) out[h] = row[i] ?? null; });
  return out;
}
