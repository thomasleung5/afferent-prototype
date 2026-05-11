import type { CapPool } from "@/lib/types";
import type { ExtractedRow, ExtractionResult, ParsedDoc } from "../types";
import type { Confidence } from "../types";
import {
  cellNumber, cellString, matchHeaders, pickSheet,
  type HeaderAlias,
} from "./match-headers";

const ALIASES: HeaderAlias[] = [
  { field: "center", aliases: ["center", "cost center", "indirect center", "function"], required: true },
  { field: "pool",   aliases: ["pool", "cost pool", "service", "description"], required: true },
  { field: "amount", aliases: ["amount", "budget", "total", "fy budget"], required: true },
  { field: "basis",  aliases: ["basis", "allocation basis", "driver", "method"] },
  { field: "recoverability", aliases: ["recoverability", "fee-related", "recoverable"] },
  { field: "review", aliases: ["status", "review", "reviewed"] },
];

export function extractCap(
  doc: ParsedDoc,
  existing: CapPool[] = [],
): ExtractionResult<CapPool> {
  const result: ExtractionResult<CapPool> = {
    mapped: [], lowConfidence: [], unmapped: [], duplicates: [],
    stats: { total: 0, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 0, detected: "Cost allocation plan" },
  };
  if (!doc.sheets) return result;
  const sheet = pickSheet(doc.sheets, ALIASES);
  if (!sheet) return result;
  const { map, missing } = matchHeaders(sheet.headers, ALIASES);
  if (missing.length > 0) {
    result.stats.detected = `Cost allocation plan (missing: ${missing.join(", ")})`;
    return result;
  }

  const existingByKey = new Map(
    existing.map((p) => [p.center.toLowerCase() + "|" + p.pool.toLowerCase(), p]),
  );

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

    const center = cellString(row[map.center]);
    const pool = cellString(row[map.pool]);
    const amount = cellNumber(row[map.amount]);
    if (!center || !pool) {
      result.unmapped.push({ reason: "blank", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }
    if (amount == null) {
      result.unmapped.push({ reason: "missing-required-field", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }

    const basis = cellString(map.basis >= 0 ? row[map.basis] : "");
    const recoverability = cellString(map.recoverability >= 0 ? row[map.recoverability] : "");
    const reviewRaw = cellString(map.review >= 0 ? row[map.review] : "Reviewed");
    const review: "Reviewed" | "Review" = /review$/i.test(reviewRaw)
      || /unresolved/i.test(reviewRaw) ? "Review" : "Reviewed";

    const dupKey = center.toLowerCase() + "|" + pool.toLowerCase();
    const existingPool = existingByKey.get(dupKey);
    const id = existingPool?.id ?? `cap-${slug(center)}-${slug(pool)}-${i + 1}`;

    const entity: CapPool = {
      id,
      center, pool, amount,
      basis: basis || "FY budgeted",
      receiving: "Multiple departments",
      recoverability: recoverability || "Partially recoverable",
      review,
    };

    let conf: "high" | "med" | "low" = "high";
    if (!basis) conf = "med";
    if (review === "Review") conf = "med";
    if (amount > 10_000_000) conf = "low";
    lineage.confidence = conf;

    const extracted: ExtractedRow<CapPool> = { entity, lineage };
    if (existingPool) { result.duplicates.push(extracted); result.stats.duplicates += 1; }
    else if (conf === "low") { result.lowConfidence.push(extracted); result.stats.lowConfidence += 1; }
    else { result.mapped.push(extracted); result.stats.mapped += 1; }
  });

  return result;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 18);
}
function rowMap(headers: string[], row: (string | number | null)[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  headers.forEach((h, i) => { if (h) out[h] = row[i] ?? null; });
  return out;
}
