import type { DeptCode, Service } from "@/lib/types";
import type { ExtractedRow, ExtractionResult, ParsedDoc } from "../types";
import type { Confidence } from "../types";
import {
  cellNumber, cellString, matchHeaders, normalizeDept, pickSheet,
  type HeaderAlias,
} from "./match-headers";

const ALIASES: HeaderAlias[] = [
  { field: "name",   aliases: ["service", "service name", "fee item", "fee name", "name", "description"], required: true },
  { field: "dept",   aliases: ["dept", "department", "division"], required: true },
  { field: "hours",  aliases: ["hours", "hours per unit", "hrs/inst", "hours / instance", "time"] },
  { field: "volume", aliases: ["volume", "annual volume", "count", "applications/yr", "permits/yr"] },
  { field: "fee",    aliases: ["fee", "current fee", "adopted fee", "today's fee", "now"] },
  { field: "peer",   aliases: ["peer", "peer median", "peer fee", "comparable", "median"] },
  { field: "target", aliases: ["target", "recovery target", "recovery %", "policy target"] },
];

export function extractServices(
  doc: ParsedDoc,
  existing: Service[] = [],
): ExtractionResult<Service> {
  const result: ExtractionResult<Service> = {
    mapped: [], lowConfidence: [], unmapped: [], duplicates: [],
    stats: { total: 0, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 0, detected: "Service catalog" },
  };
  if (!doc.sheets) return result;
  const sheet = pickSheet(doc.sheets, ALIASES);
  if (!sheet) return result;
  const { map, missing } = matchHeaders(sheet.headers, ALIASES);
  if (missing.length > 0) {
    result.stats.detected = `Service catalog (missing: ${missing.join(", ")})`;
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
    if (!name) {
      result.unmapped.push({ reason: "blank", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }
    if (!dept || dept === "SHARED:CDS") {
      result.unmapped.push({ reason: "ambiguous-dept", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }

    const hours = cellNumber(row[map.hours]) ?? 0;
    const volume = cellNumber(row[map.volume]) ?? 0;
    const fee = cellNumber(row[map.fee]) ?? 0;
    const peer = cellNumber(row[map.peer]) ?? 0;
    const target = cellNumber(row[map.target]) ?? 100;

    const existingSvc = existingByName.get(name.toLowerCase());
    const id = existingSvc?.id ?? `svc-${slug(name)}-${i + 1}`;

    // Cost is derived from hours × FBHR at runtime — preserve from existing if any.
    const cost = existingSvc?.cost ?? Math.round(hours * 350);

    const entity: Service = {
      id,
      name,
      dept: dept as DeptCode,
      volume,
      hours,
      cost,
      fee,
      peer,
      target,
    };

    let conf: "high" | "med" | "low" = "high";
    if (hours === 0 || volume === 0) conf = "med";
    if (hours === 0 && fee === 0) conf = "low";
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
