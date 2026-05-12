/* Document classifier — picks the most likely domain for a parsed file by
 * scoring filename + header signals against per-domain hint lists. Used by
 * the global Import Manager to route a drop to the right merge action.
 *
 * No AI by default — the score function is deterministic and free. Callers
 * that want a fallback can call classifyWithAi() which sends the headers
 * sample to the existing /api/ai/extract endpoint with a special "classify"
 * pseudo-domain. */

import type { ParsedDoc } from "./types";
import type { Domain } from "@/lib/store";

interface DomainHints {
  /** Score boost when filename contains any of these (case-insensitive). */
  filename: string[];
  /** Score boost when a header contains any of these. */
  headers: string[];
}

/** Per-domain keyword vocabulary. Tuned conservatively — false positives
 *  are worse than false negatives because they silently send a file to the
 *  wrong merge action. */
const HINTS: Record<Domain, DomainHints> = {
  positions: {
    filename: ["salary", "roster", "personnel", "payroll", "compensation", "wages"],
    headers:  ["position", "title", "fte", "salary", "benefits", "headcount", "step", "classification"],
  },
  operating: {
    filename: ["operating", "budget", "expenditure", "gl", "general ledger", "expense"],
    headers:  ["account", "object", "amount", "category", "line item", "expense", "obligation"],
  },
  services: {
    filename: ["service", "catalog", "inventory", "time study", "fee study"],
    headers:  ["service", "hours per", "hours/unit", "volume", "unit", "process"],
  },
  fees: {
    filename: ["fee schedule", "fees", "master fee", "council fee", "adopted fee"],
    headers:  ["fee", "current fee", "proposed", "recommended", "adopted"],
  },
  workload: {
    filename: ["workload", "permit", "energov", "accela", "opengov", "volume", "annual count"],
    headers:  ["count", "prior", "current", "fy24", "fy25", "fy26", "permits issued", "applications"],
  },
  cap: {
    filename: ["cap", "cost allocation", "indirect", "overhead", "step-down", "step down"],
    headers:  ["pool", "center", "basis", "allocation", "indirect", "driver", "recoverability"],
  },
};

export interface ClassifyScore {
  domain: Domain;
  score: number;
  matched: string[];
}

export interface Classification {
  /** Top-scoring domain, or null when nothing beat the noise threshold. */
  domain: Domain | null;
  /** Normalized 0..1 — top score divided by total possible signal weight. */
  confidence: number;
  /** All scored candidates, descending. */
  candidates: ClassifyScore[];
  /** Short human explanation, e.g. "filename: 'FY 26-27 Salary Table' · headers: position, fte". */
  reason: string;
}

const FILENAME_WEIGHT = 3;
const HEADER_WEIGHT = 1;
const MIN_CONFIDENCE = 0.25;

/** Pure deterministic classifier — given a parsed doc, score each domain by
 *  filename + header hint matches and return the top candidate. */
export function classify(doc: ParsedDoc): Classification {
  const filename = doc.fileName.toLowerCase();
  const headerPool = (doc.sheets ?? []).flatMap((s) => s.headers).map((h) => h.toLowerCase());
  // For PDFs, take the first ~30 lines on page 1 as pseudo-headers.
  const pdfPool = (doc.pages?.[0]?.lines ?? []).slice(0, 30).map((l) => l.toLowerCase());
  const allHeaders = [...headerPool, ...pdfPool];

  const candidates: ClassifyScore[] = (Object.keys(HINTS) as Domain[]).map((domain) => {
    const h = HINTS[domain];
    const matched: string[] = [];
    let score = 0;

    for (const kw of h.filename) {
      if (filename.includes(kw)) { score += FILENAME_WEIGHT; matched.push(`file:${kw}`); }
    }
    for (const kw of h.headers) {
      if (allHeaders.some((hh) => hh.includes(kw))) {
        score += HEADER_WEIGHT;
        matched.push(`hdr:${kw}`);
      }
    }
    return { domain, score, matched };
  }).sort((a, b) => b.score - a.score);

  const top = candidates[0];
  const second = candidates[1];
  const maxPossible = FILENAME_WEIGHT * 2 + HEADER_WEIGHT * 4; // rough cap
  const confidence = top ? Math.min(1, top.score / maxPossible) : 0;

  // Require both a minimum confidence AND a clear winner over the runner-up.
  const isWinner = top && top.score > 0
    && confidence >= MIN_CONFIDENCE
    && (!second || top.score >= second.score + HEADER_WEIGHT);

  const filenameMatches = top?.matched.filter((m) => m.startsWith("file:")).map((m) => m.slice(5)) ?? [];
  const headerMatches = top?.matched.filter((m) => m.startsWith("hdr:")).map((m) => m.slice(4)) ?? [];
  const reasonParts: string[] = [];
  if (filenameMatches.length > 0) reasonParts.push(`filename: ${filenameMatches.slice(0, 3).join(", ")}`);
  if (headerMatches.length > 0) reasonParts.push(`headers: ${headerMatches.slice(0, 4).join(", ")}`);
  const reason = reasonParts.length > 0
    ? reasonParts.join(" · ")
    : "no recognizable signals — pick a domain manually";

  return {
    domain: isWinner ? top.domain : null,
    confidence,
    candidates,
    reason,
  };
}
