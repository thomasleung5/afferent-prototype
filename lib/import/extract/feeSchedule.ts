/* Flexible fee schedule extractor.
 *
 * Rules:
 *   - never reject the document
 *   - detect section headers (PLANNING DEPARTMENT, Site Development, …)
 *   - keep subtotal rows as their own row type
 *   - support fee+deposit pairs as a single fee_plus_deposit row
 *   - support hourly_rate, actual_cost, per_unit_fee, formula_or_multiplier
 *   - emit note_only rows for narrative paragraphs / footnotes
 *   - everything that isn't classifiable goes through as rowType "unknown"
 *     with confidence "low", not dropped
 *
 * The output is an ExtractedDocument — section + row tree. Mapping decides
 * which rows feed which target tables. */

import type { ParsedDoc, ParsedSheet, ParsedPage } from "@/lib/parse/types";
import type {
  ExtractedDocument, ExtractedRow, ExtractedRowType, ExtractedSection,
} from "../types";
import { parseMoney } from "../normalize";

const HOURLY_RE = /\bper\s+hour\b|\$\s?\d[\d,]*\s*\/\s*hr\b|\bhourly\b/i;
const ACTUAL_COST_RE = /\bactual cost\b|\btime\s*[+&]\s*materials?\b|\bt\s*&\s*m\b/i;
const FORMULA_RE = /\b\d+\s*[%]\b|\bplus\b|\bmultipl(e|ied|ier)\b|\bbase fee plus\b/i;
const DEPOSIT_RE = /\bdeposit\b/i;
const UNIT_RE = /\b(per\s+(unit|acre|sq\.?\s*ft|square foot|lot|dwelling|hour|page|set))\b/i;

/** Section header pattern for PDFs / CSV — all-caps line, 3-80 chars, mostly letters. */
const SECTION_RE = /^[A-Z][A-Z0-9 &/()'.,-]{3,80}$/;
const SUBTOTAL_RE = /\b(subtotal|total)\b/i;

let rowId = 0;
const nextId = () => `er-${++rowId}`;

export function extractFeeSchedule(doc: ParsedDoc): ExtractedDocument {
  const out: ExtractedDocument = {
    documentType: "fee_schedule",
    sourceFile: doc.fileName,
    sections: [],
    unsectioned: [],
    notes: [],
    parseWarnings: [...doc.warnings],
  };

  if (doc.sheets && doc.sheets.length > 0) {
    for (const sheet of doc.sheets) extractFromSheet(sheet, doc.fileName, out);
  } else if (doc.pages && doc.pages.length > 0) {
    for (const page of doc.pages) extractFromPage(page, doc.fileName, out);
  } else {
    out.parseWarnings.push("Document has neither sheets nor pages.");
  }

  return out;
}

/* ── Sheet path ─────────────────────────────────────────────────────────── */

function extractFromSheet(sheet: ParsedSheet, file: string, out: ExtractedDocument): void {
  const section: ExtractedSection = {
    label: sheet.name,
    normalized: sheet.name,
    rows: [],
  };

  // Find columns we might use. Loose — we keep the whole row regardless.
  const lc = sheet.headers.map((h) => h.toLowerCase());
  const colName = pickCol(lc, ["fee item", "fee name", "fee", "service", "description", "name", "item"]);
  const colCurrent = pickCol(lc, ["current fee", "adopted fee", "current", "amount", "fee"]);
  const colDeposit = pickCol(lc, ["deposit", "deposit amount"]);
  const colUnit = pickCol(lc, ["unit", "per", "basis"]);
  const colNote = pickCol(lc, ["note", "notes", "comment", "remarks"]);

  sheet.rows.forEach((rawRow, idx) => {
    const rawLabel = colName >= 0 ? String(rawRow[colName] ?? "").trim() : firstString(rawRow);

    // Skip completely empty rows.
    if (!rawLabel && rawRow.every((c) => c == null || String(c).trim() === "")) return;

    const cells = rawRow;
    const currentRaw = colCurrent >= 0 ? rawRow[colCurrent] : findNumericCell(rawRow);
    const depositRaw = colDeposit >= 0 ? rawRow[colDeposit] : null;
    const noteRaw = colNote >= 0 ? String(rawRow[colNote] ?? "").trim() : "";
    const unitHit = colUnit >= 0 ? String(rawRow[colUnit] ?? "").trim() : detectUnit(rawLabel);

    const current = parseMoney(currentRaw);
    const deposit = parseMoney(depositRaw);

    const { rowType, warnings } = classifyRow({
      rawLabel, current, deposit, note: noteRaw,
      cells,
    });

    const row: ExtractedRow = {
      id: nextId(),
      rawLabel: rawLabel || "(blank)",
      rawCells: cells,
      parsedValue: current ?? undefined,
      unit: unitHit || undefined,
      note: noteRaw || undefined,
      rowType,
      source: {
        file,
        sheet: sheet.name,
        row: idx + 2,
        section: section.normalized,
      },
      fields: {
        ...(current != null ? { current } : {}),
        ...(deposit != null ? { deposit } : {}),
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: confidenceFor(rowType, current, deposit),
    };

    if (rowType === "subtotal") {
      section.subtotal = { label: rawLabel, amount: current ?? 0 };
    }
    section.rows.push(row);
  });

  if (section.rows.length > 0) out.sections.push(section);
  else out.parseWarnings.push(`Sheet "${sheet.name}" yielded no rows.`);
}

/* ── PDF path ───────────────────────────────────────────────────────────── */

function extractFromPage(page: ParsedPage, file: string, out: ExtractedDocument): void {
  let current: ExtractedSection | null = null;

  for (let i = 0; i < page.lines.length; i++) {
    const line = page.lines[i].trim();
    if (!line) continue;

    if (SECTION_RE.test(line)) {
      if (current && current.rows.length > 0) out.sections.push(current);
      current = { label: line, normalized: line, rows: [] };
      continue;
    }

    // Try to peel a money token from the end of the line.
    const moneyMatch = line.match(/(-?\$?\(?\d[\d,]*\.?\d*\)?%?)\s*$/);
    const labelPart = moneyMatch ? line.slice(0, line.length - moneyMatch[0].length).trim() : line;
    const valueRaw = moneyMatch ? moneyMatch[1] : null;
    const value = valueRaw != null ? parseMoney(valueRaw) : null;

    // Pure narrative line — record as note_only against the current section.
    if (!moneyMatch && !current) {
      out.notes.push(line);
      continue;
    }

    const noteRaw = labelPart.match(/\(([^)]+)\)\s*$/)?.[1];
    const { rowType, warnings } = classifyRow({
      rawLabel: labelPart, current: value, deposit: null, note: noteRaw, cells: [line],
    });

    const row: ExtractedRow = {
      id: nextId(),
      rawLabel: labelPart || "(blank)",
      rawCells: [line],
      parsedValue: value ?? undefined,
      unit: detectUnit(line),
      note: noteRaw,
      rowType,
      source: {
        file,
        page: page.page,
        row: i + 1,
        section: current?.normalized,
      },
      fields: value != null ? { current: value } : {},
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: confidenceFor(rowType, value, null),
    };

    if (current) current.rows.push(row);
    else out.unsectioned.push(row);
  }
  if (current && current.rows.length > 0) out.sections.push(current);
}

/* ── Row typology ───────────────────────────────────────────────────────── */

function classifyRow({
  rawLabel, current, deposit, note, cells,
}: {
  rawLabel: string;
  current: number | null;
  deposit: number | null;
  note: string | undefined;
  cells: (string | number | null)[];
}): { rowType: ExtractedRowType; warnings: string[] } {
  const text = [rawLabel, note ?? "", cells.map(String).join(" ")].join(" ").toLowerCase();
  const warnings: string[] = [];

  if (!rawLabel || rawLabel.length < 2) {
    return { rowType: "note_only", warnings };
  }

  if (SUBTOTAL_RE.test(rawLabel)) return { rowType: "subtotal", warnings };

  if (SECTION_RE.test(rawLabel) && current == null && deposit == null) {
    return { rowType: "section_header", warnings };
  }

  if (deposit != null && current != null) return { rowType: "fee_plus_deposit", warnings };
  if (deposit != null) return { rowType: "deposit", warnings };

  if (HOURLY_RE.test(text)) return { rowType: "hourly_rate", warnings };
  if (ACTUAL_COST_RE.test(text)) return { rowType: "actual_cost", warnings };
  if (FORMULA_RE.test(text)) return { rowType: "formula_or_multiplier", warnings };
  if (UNIT_RE.test(text)) return { rowType: "per_unit_fee", warnings };

  if (current != null) return { rowType: "fixed_fee", warnings };

  warnings.push("no numeric value detected");
  return { rowType: "note_only", warnings };
}

function confidenceFor(
  rowType: ExtractedRowType, current: number | null, deposit: number | null,
): "high" | "med" | "low" {
  if (rowType === "section_header" || rowType === "subtotal") return "high";
  if (rowType === "note_only") return "low";
  if (current != null || deposit != null) return "high";
  return "med";
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function pickCol(headers: string[], hints: string[]): number {
  // Exact match first.
  for (const hint of hints) {
    const idx = headers.findIndex((h) => h === hint);
    if (idx >= 0) return idx;
  }
  // Then includes.
  for (const hint of hints) {
    const idx = headers.findIndex((h) => h.includes(hint));
    if (idx >= 0) return idx;
  }
  return -1;
}

function firstString(row: (string | number | null)[]): string {
  for (const c of row) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
}

function findNumericCell(row: (string | number | null)[]): string | number | null {
  for (let i = row.length - 1; i >= 0; i--) {
    if (parseMoney(row[i]) != null) return row[i];
  }
  return null;
}

function detectUnit(s: string): string | undefined {
  const m = s.match(UNIT_RE);
  return m?.[1];
}
