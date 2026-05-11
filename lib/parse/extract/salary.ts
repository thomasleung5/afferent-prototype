import type { Position } from "@/lib/types";
import type { ParsedDoc, ExtractionResult, ExtractedRow, UnmappedRow } from "../types";
import type { Confidence } from "../types";
import {
  matchHeaders, pickSheet, cellString, cellNumber, normalizeDept,
  type HeaderAlias,
} from "./match-headers";

const ALIASES: HeaderAlias[] = [
  { field: "title",    aliases: ["position", "title", "classification", "role", "job title"], required: true },
  { field: "dept",     aliases: ["dept", "department", "division"],                            required: true },
  { field: "fte",      aliases: ["fte", "headcount", "count", "fte count"] },
  { field: "salary",   aliases: ["salary", "base salary", "annual salary", "wages"],          required: true },
  { field: "benefits", aliases: ["benefits", "benefit", "loaded benefits", "benefits & taxes"] },
  { field: "hours",    aliases: ["productive hours", "prod hours", "prod hrs", "hours", "annual hours"] },
];

const HOURS_DEFAULT = 1720;

export function extractSalary(
  doc: ParsedDoc,
  existing: Position[] = [],
): ExtractionResult<Position> {
  const result: ExtractionResult<Position> = {
    mapped: [], lowConfidence: [], unmapped: [], duplicates: [],
    stats: { total: 0, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 0, detected: "Salary roster" },
  };

  const sheet = doc.sheets ? pickSheet(doc.sheets, ALIASES) : undefined;
  if (!sheet) {
    return result;
  }

  const { map, missing } = matchHeaders(sheet.headers, ALIASES);
  if (missing.length > 0) {
    result.stats.detected = `Salary roster (missing: ${missing.join(", ")})`;
    return result;
  }

  const existingTitles = new Map(existing.map((p) => [norm(p.title), p]));

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

    const title = cellString(row[map.title]);
    const dept = normalizeDept(row[map.dept]);
    const salary = cellNumber(row[map.salary]);

    if (!title) {
      result.unmapped.push(makeUnmapped("blank", row, lineage));
      result.stats.unmapped += 1;
      return;
    }
    if (!dept || dept === "SHARED:CDS") {
      result.unmapped.push(makeUnmapped("ambiguous-dept", row, lineage));
      result.stats.unmapped += 1;
      return;
    }
    if (salary == null) {
      result.unmapped.push(makeUnmapped("missing-required-field", row, lineage));
      result.stats.unmapped += 1;
      return;
    }

    const fte = cellNumber(row[map.fte]) ?? 1;
    const benefits = cellNumber(row[map.benefits]) ?? 0;
    const hours = cellNumber(row[map.hours]) ?? HOURS_DEFAULT;

    const existingPos = existingTitles.get(norm(title));
    const id = existingPos?.id ?? `pos-${slug(title)}-${i + 1}`;
    const entity: Position = {
      id,
      title,
      dept,
      fte,
      salary,
      benefits,
      hours,
      ...(existingPos?.flag != null ? { flag: existingPos.flag } : {}),
    };

    // Confidence dropoffs
    let conf: "high" | "med" | "low" = "high";
    if (benefits === 0) conf = "med";
    if (hours < 800 || hours > 2200) conf = "low";
    if (salary < 20000 || salary > 1_000_000) conf = "low";
    lineage.confidence = conf;

    const extracted: ExtractedRow<Position> = { entity, lineage };
    if (existingPos) {
      result.duplicates.push(extracted);
      result.stats.duplicates += 1;
    } else if (conf === "low") {
      result.lowConfidence.push(extracted);
      result.stats.lowConfidence += 1;
    } else {
      result.mapped.push(extracted);
      result.stats.mapped += 1;
    }
  });

  return result;
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}

function rowMap(headers: string[], row: (string | number | null)[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  headers.forEach((h, i) => { if (h) out[h] = row[i] ?? null; });
  return out;
}

function makeUnmapped(
  reason: UnmappedRow["reason"],
  row: (string | number | null)[],
  lineage: UnmappedRow["lineage"],
): UnmappedRow {
  return { reason, raw: row, lineage: { ...lineage, confidence: "review" } };
}
