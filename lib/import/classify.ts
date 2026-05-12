/* Document classifier — scores filename + headers + first-page tokens against
 * per-document-type hint vocabularies. Returns the most likely documentType
 * plus jurisdiction / fiscal year / detected sections, so the downstream
 * pipeline can render real context in the debug panel.
 *
 * This replaces the narrower lib/parse/classify.ts (Domain-only). The old
 * module still works for the existing per-page DropZones — they'll switch
 * over as pages migrate. */

import type { ParsedDoc } from "@/lib/parse/types";
import type { DocumentClassification, DocumentType } from "./types";
import { normalizeDept, normalizeFiscalYear } from "./normalize";

interface DocumentHints {
  filename: string[];
  /** Header tokens (csv/xlsx) or first-page tokens (pdf). */
  signals: string[];
  /** Penalty terms — if any appear in filename, the score drops sharply. */
  excludes?: string[];
}

const HINTS: Record<Exclude<DocumentType, "unknown">, DocumentHints> = {
  fee_schedule: {
    filename: ["fee schedule", "master fee", "adopted fee", "council fee"],
    signals: ["fee", "current fee", "adopted fee", "deposit", "fee schedule", "hourly rate"],
    excludes: ["benchmark", "comparator", "peer"],
  },
  prior_fee_study: {
    filename: ["fee study", "cost of service study", "cost-of-service", "cost recovery"],
    signals: ["service", "fully burdened", "fbhr", "recovery target", "recommended fee", "cost of service"],
  },
  budget_book: {
    filename: ["budget book", "adopted budget", "operating budget", "annual budget"],
    signals: ["fund", "department total", "operating expenditures", "personnel services", "non-personnel"],
  },
  salary_roster: {
    filename: ["salary", "roster", "personnel", "payroll", "compensation", "step plan"],
    signals: ["position", "title", "fte", "salary", "benefits", "vacant", "step", "classification"],
  },
  operating_budget: {
    filename: ["operating", "gl export", "general ledger", "expense detail", "object code"],
    signals: ["account", "object", "expense", "obligation", "category", "line item"],
  },
  cost_allocation_plan: {
    filename: ["cap", "cost allocation", "indirect cost", "overhead allocation", "step-down", "step down"],
    signals: ["pool", "cost center", "allocation basis", "indirect", "driver", "recoverability", "step-down"],
  },
  workload_export: {
    filename: ["workload", "permit", "energov", "accela", "opengov", "annual count"],
    signals: ["count", "permits issued", "applications", "inspections", "fy24", "fy25", "fy26"],
  },
  benchmark_fee_schedule: {
    filename: ["benchmark", "comparator", "peer", "survey"],
    signals: ["peer", "city", "benchmark", "comparator"],
  },
};

const FILENAME_WEIGHT = 4;
const SIGNAL_WEIGHT = 1;
const EXCLUDE_PENALTY = 5;
const MIN_CONFIDENCE = 0.25;
const MAX_SECTIONS = 24;

const JURISDICTION_RE = /(?:City|Town|County) of ([A-Z][\w. ]+?)(?:\s|$|,|—|·|\.|-)/;

/** Lines that look like section headers in fee schedules / CAP plans. */
const SECTION_RE = /^[A-Z][A-Z0-9 &/().,'-]{3,80}$/;

export function classifyDocument(doc: ParsedDoc): DocumentClassification {
  const filename = doc.fileName.toLowerCase();

  // Gather header tokens from sheets and first-page line tokens from PDFs.
  const sheetHeaders = (doc.sheets ?? [])
    .flatMap((s) => s.headers)
    .map((h) => h.toLowerCase());
  const pdfTokens = (doc.pages?.[0]?.lines ?? [])
    .slice(0, 40)
    .map((l) => l.toLowerCase());
  const signalPool = [...sheetHeaders, ...pdfTokens];

  type Score = { type: DocumentType; score: number; reasons: string[] };
  const scores: Score[] = (Object.keys(HINTS) as Exclude<DocumentType, "unknown">[])
    .map((type) => {
      const h = HINTS[type];
      const reasons: string[] = [];
      let score = 0;

      for (const kw of h.filename) {
        if (filename.includes(kw)) { score += FILENAME_WEIGHT; reasons.push(`file:${kw}`); }
      }
      for (const kw of h.signals) {
        if (signalPool.some((s) => s.includes(kw))) { score += SIGNAL_WEIGHT; reasons.push(`sig:${kw}`); }
      }
      if (h.excludes) {
        for (const kw of h.excludes) {
          if (filename.includes(kw)) { score -= EXCLUDE_PENALTY; reasons.push(`-x:${kw}`); }
        }
      }
      return { type, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];
  const maxPossible = FILENAME_WEIGHT * 2 + SIGNAL_WEIGHT * 5;
  const confidence = top && top.score > 0
    ? Math.min(1, top.score / maxPossible)
    : 0;
  const isWinner = top && confidence >= MIN_CONFIDENCE
    && (!second || top.score >= second.score + SIGNAL_WEIGHT);
  const documentType: DocumentType = isWinner ? top.type : "unknown";

  // Jurisdiction — search filename then PDF page 1.
  const jurisdiction = pickJurisdiction(doc);

  // Fiscal year — same search order.
  const fiscalYear =
    normalizeFiscalYear(doc.fileName) ??
    normalizeFiscalYear(doc.pages?.[0]?.text ?? "") ??
    undefined;

  // Department — based on filename + first sheet header signal.
  const deptHit = normalizeDept(doc.fileName) ?? sniffDept(signalPool);
  const department = deptHit?.value;

  // Sections — sheet names for spreadsheets, all-caps lines for PDFs.
  const detectedSections = detectSections(doc);

  const reason = buildReason(top, documentType, jurisdiction, fiscalYear, detectedSections);

  return {
    documentType,
    confidence,
    jurisdiction,
    fiscalYear,
    department,
    detectedSections,
    reason,
  };
}

function buildReason(
  top: { type: DocumentType; score: number; reasons: string[] } | undefined,
  documentType: DocumentType,
  jurisdiction?: string,
  fiscalYear?: string,
  sections: string[] = [],
): string {
  if (!top || top.score === 0) {
    return "no recognizable signals — user pick required";
  }
  const parts: string[] = [];
  const fileMatches = top.reasons.filter((r) => r.startsWith("file:")).map((r) => r.slice(5));
  const sigMatches = top.reasons.filter((r) => r.startsWith("sig:")).map((r) => r.slice(4));
  if (fileMatches.length > 0) parts.push(`filename: ${fileMatches.slice(0, 3).join(", ")}`);
  if (sigMatches.length > 0) parts.push(`signals: ${sigMatches.slice(0, 4).join(", ")}`);
  if (jurisdiction) parts.push(`jurisdiction: ${jurisdiction}`);
  if (fiscalYear) parts.push(`FY: ${fiscalYear}`);
  if (sections.length > 0) parts.push(`sections: ${sections.length}`);
  if (documentType === "unknown") parts.push("but ambiguous vs runner-up");
  return parts.join(" · ");
}

function pickJurisdiction(doc: ParsedDoc): string | undefined {
  const candidates: string[] = [];
  const fnMatch = doc.fileName.match(JURISDICTION_RE);
  if (fnMatch) candidates.push(fnMatch[1].trim());
  const pageText = doc.pages?.[0]?.text ?? "";
  const pgMatch = pageText.match(JURISDICTION_RE);
  if (pgMatch) candidates.push(pgMatch[1].trim());
  return candidates[0];
}

function sniffDept(signals: string[]): ReturnType<typeof normalizeDept> | null {
  for (const s of signals) {
    const hit = normalizeDept(s);
    if (hit && hit.value !== "OTHER") return hit;
  }
  return null;
}

function detectSections(doc: ParsedDoc): string[] {
  const out = new Set<string>();
  for (const s of doc.sheets ?? []) out.add(s.name);
  for (const p of doc.pages ?? []) {
    for (const line of p.lines) {
      const trimmed = line.trim();
      if (SECTION_RE.test(trimmed) && trimmed.length < 80) {
        out.add(trimmed);
        if (out.size >= MAX_SECTIONS) break;
      }
    }
    if (out.size >= MAX_SECTIONS) break;
  }
  return [...out].slice(0, MAX_SECTIONS);
}
