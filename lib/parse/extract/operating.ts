import type { OpCategory, OpDept, OperatingLine } from "@/lib/types";
import type {
  ExtractedRow, ExtractionResult, ParsedDoc, ParsedSheet,
} from "../types";
import type { Confidence } from "../types";
import {
  cellNumber, cellString, matchHeaders, normalizeDept, pickSheet,
  type HeaderAlias,
} from "./match-headers";

const ALIASES: HeaderAlias[] = [
  { field: "code",     aliases: ["fund-program", "fund program", "account", "account code", "code"], required: true },
  { field: "line",     aliases: ["line item", "description", "narrative", "line"],                    required: true },
  { field: "dept",     aliases: ["dept", "department", "division"] },
  { field: "category", aliases: ["category", "object", "object class", "expense category"] },
  { field: "amount",   aliases: ["amount", "budget", "fy budget", "appropriation", "$", "total"],     required: true },
];

const CATEGORY_LOOKUP: Record<string, OpCategory> = {
  software: "Software & subscriptions",
  subscription: "Software & subscriptions",
  professional: "Professional services",
  consultant: "Professional services",
  training: "Training & travel",
  travel: "Training & travel",
  office: "Office & supplies",
  supplies: "Office & supplies",
  membership: "Memberships & dues",
  dues: "Memberships & dues",
  vehicle: "Vehicles & equipment",
  equipment: "Vehicles & equipment",
  legal: "Legal noticing",
  noticing: "Legal noticing",
  capital: "Capital outlay",
  other: "Other",
};

const PDF_LINE = /^([A-Z0-9-]{6,})\s+(.+?)\s+\$?([\d,]+(?:\.\d+)?)$/;

export function extractOperating(
  doc: ParsedDoc,
  existing: OperatingLine[] = [],
): ExtractionResult<OperatingLine> {
  const result: ExtractionResult<OperatingLine> = {
    mapped: [], lowConfidence: [], unmapped: [], duplicates: [],
    stats: { total: 0, mapped: 0, lowConfidence: 0, unmapped: 0, duplicates: 0, detected: "Operating budget" },
  };
  const existingByCode = new Map(existing.map((l) => [l.code + "|" + l.line.toLowerCase(), l]));

  if (doc.format === "pdf" && doc.pages) {
    extractFromPdf(doc, result, existingByCode);
    return result;
  }

  if (!doc.sheets) return result;
  const sheet = pickSheet(doc.sheets, ALIASES);
  if (!sheet) return result;
  const { map, missing } = matchHeaders(sheet.headers, ALIASES);
  if (missing.length > 0) {
    result.stats.detected = `Operating budget (missing: ${missing.join(", ")})`;
    return result;
  }
  extractFromSheet(sheet, map, doc.fileName, result, existingByCode);
  return result;
}

function extractFromSheet(
  sheet: ParsedSheet,
  map: Record<string, number>,
  fileName: string,
  result: ExtractionResult<OperatingLine>,
  existing: Map<string, OperatingLine>,
) {
  sheet.rows.forEach((row, i) => {
    result.stats.total += 1;
    const lineage = {
      file: fileName, sheet: sheet.name, row: i + 2,
      rawCells: rowMap(sheet.headers, row),
      confidence: "high" as Confidence,
      importedAt: new Date().toISOString(),
    };

    const code = cellString(row[map.code]);
    const line = cellString(row[map.line]);
    const amount = cellNumber(row[map.amount]);
    const deptCell = map.dept >= 0 ? row[map.dept] : null;
    const dept = normalizeDept(deptCell) ?? guessDept(line);
    const category = pickCategory(cellString(map.category >= 0 ? row[map.category] : ""), line);

    if (!code || !line) {
      result.unmapped.push({ reason: "blank", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }
    if (amount == null) {
      result.unmapped.push({ reason: "missing-required-field", raw: row, lineage: { ...lineage, confidence: "review" } });
      result.stats.unmapped += 1;
      return;
    }

    const entity: OperatingLine = {
      id: `OP-${slug(code)}-${i + 1}`,
      code, line, amount,
      dept: dept ?? "PLAN",
      category,
      source: `${fileName} · ${sheet.name} · row ${i + 2}`,
      include: amount > 0,
    };

    let conf: "high" | "med" | "low" = "high";
    if (!dept) conf = "low";
    if (amount > 1_000_000) conf = "low";
    lineage.confidence = conf;

    const dupKey = code + "|" + line.toLowerCase();
    const existingLine = existing.get(dupKey);
    const extracted: ExtractedRow<OperatingLine> = { entity: { ...entity, id: existingLine?.id ?? entity.id }, lineage };
    if (existingLine) { result.duplicates.push(extracted); result.stats.duplicates += 1; }
    else if (conf === "low") { result.lowConfidence.push(extracted); result.stats.lowConfidence += 1; }
    else { result.mapped.push(extracted); result.stats.mapped += 1; }
  });
}

function extractFromPdf(
  doc: ParsedDoc,
  result: ExtractionResult<OperatingLine>,
  existing: Map<string, OperatingLine>,
) {
  if (!doc.pages) return;
  doc.pages.forEach((page) => {
    page.lines.forEach((rawLine, i) => {
      const m = rawLine.match(PDF_LINE);
      if (!m) return;
      result.stats.total += 1;
      const [, code, lineText, amountStr] = m;
      const amount = Number(amountStr.replace(/,/g, ""));
      if (!Number.isFinite(amount)) return;
      const dept = guessDept(lineText) ?? null;
      const category = pickCategory("", lineText);
      const lineage = {
        file: doc.fileName,
        page: page.page,
        row: i + 1,
        rawCells: { code, line: lineText, amount },
        confidence: "med" as const,
        importedAt: new Date().toISOString(),
      };
      const entity: OperatingLine = {
        id: `OP-${slug(code)}-p${page.page}-${i + 1}`,
        code, line: lineText, amount,
        dept: (dept ?? "PLAN") as OpDept,
        category,
        source: `${doc.fileName} · p.${page.page}`,
        include: true,
      };
      const dupKey = code + "|" + lineText.toLowerCase();
      const existingLine = existing.get(dupKey);
      const extracted = { entity: { ...entity, id: existingLine?.id ?? entity.id }, lineage };
      if (existingLine) { result.duplicates.push(extracted); result.stats.duplicates += 1; }
      else if (!dept) { result.lowConfidence.push(extracted); result.stats.lowConfidence += 1; }
      else { result.mapped.push(extracted); result.stats.mapped += 1; }
    });
  });
}

function pickCategory(explicit: string, line: string): OpCategory {
  const candidates = [explicit, line].map((s) => s.toLowerCase());
  for (const c of candidates) {
    for (const [needle, cat] of Object.entries(CATEGORY_LOOKUP)) {
      if (c.includes(needle)) return cat;
    }
  }
  return "Other";
}

function guessDept(line: string): OpDept | null {
  const s = line.toLowerCase();
  if (s.includes("plan") || s.includes("planner") || s.includes("planning")) return "PLAN";
  if (s.includes("build") || s.includes("bldg") || s.includes("inspector")) return "BLDG";
  if (s.includes("engineer") || s.includes("public works")) return "ENG";
  if (s.includes("shared") || s.includes("front-counter")) return "SHARED:CDS";
  return null;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 18);
}

function rowMap(headers: string[], row: (string | number | null)[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  headers.forEach((h, i) => { if (h) out[h] = row[i] ?? null; });
  return out;
}

