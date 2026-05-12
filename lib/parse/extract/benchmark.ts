/* Benchmark extractor — reads a peer-city fee schedule and writes each row's
 * fee into the existing service's `.peer` field. Service matching is by name
 * (lowercased trim). Names that don't match any service get queued for the
 * AI assist pass, which can normalize naming differences across cities. */

import type { Service } from "@/lib/types";
import type { ExtractedRow, ExtractionResult, ParsedDoc } from "../types";
import type { Confidence } from "../types";
import {
  cellNumber, cellString, matchHeaders, pickSheet, type HeaderAlias,
} from "./match-headers";

const ALIASES: HeaderAlias[] = [
  { field: "name", aliases: ["fee item", "fee name", "service", "description", "name"], required: true },
  { field: "fee",  aliases: ["fee", "amount", "current fee", "adopted fee", "rate"], required: true },
  { field: "unit", aliases: ["unit", "basis", "per"] },
];

/** "City Z Master Fee Schedule.xlsx" → "City Z". Falls back to the filename. */
function cityFromFilename(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/(master )?fee[s]?(\s*schedule)?/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBenchmark(
  doc: ParsedDoc,
  existing: Service[] = [],
): ExtractionResult<Service> {
  const result: ExtractionResult<Service> = {
    mapped: [], lowConfidence: [], unmapped: [], duplicates: [],
    stats: { total: 0, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 0, detected: "Benchmark · peer city fees" },
  };
  if (!doc.sheets) return result;
  const sheet = pickSheet(doc.sheets, ALIASES);
  if (!sheet) return result;
  const { map, missing } = matchHeaders(sheet.headers, ALIASES);
  if (missing.length > 0) {
    result.stats.detected = `Benchmark (missing: ${missing.join(", ")})`;
    return result;
  }

  const city = cityFromFilename(doc.fileName);
  const existingByName = new Map(existing.map((s) => [s.name.toLowerCase().trim(), s]));

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
    const peer = cellNumber(row[map.fee]);
    if (!name) {
      result.unmapped.push({ reason: "blank", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }
    if (peer == null) {
      result.unmapped.push({ reason: "missing-required-field", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }

    const match = existingByName.get(name.toLowerCase().trim());
    if (!match) {
      // No matching service in the catalog — AI assist may suggest a normalization.
      result.unmapped.push({
        reason: "schema-mismatch",
        raw: row,
        lineage: { ...lineage, confidence: "review" },
      });
      result.stats.unmapped += 1;
      return;
    }

    const entity: Service = { ...match, peer };
    const extracted: ExtractedRow<Service> = { entity, lineage };
    // Treat every matched peer row as a duplicate so the merge patches existing services.
    result.duplicates.push(extracted);
    result.stats.duplicates += 1;
  });

  // Stash the city in the detected string so the UI can show it.
  result.stats.detected = `Peer city · ${city || doc.fileName}`;
  return result;
}

function rowMap(headers: string[], row: (string | number | null)[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  headers.forEach((h, i) => { if (h) out[h] = row[i] ?? null; });
  return out;
}
