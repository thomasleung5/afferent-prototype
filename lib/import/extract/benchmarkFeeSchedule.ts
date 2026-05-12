/* Comparator-city fee schedule extractor.
 *
 * Wraps the regular fee schedule extractor and re-tags it as a benchmark
 * document, plus extracts a comparatorCity from the filename. Each row's
 * fields gets a `comparatorCity` field so the mapping engine knows to
 * write into services[].peer rather than services[].fee. */

import type { ParsedDoc } from "@/lib/parse/types";
import type { ExtractedDocument } from "../types";
import { extractFeeSchedule } from "./feeSchedule";

const FEE_SUFFIX = /(master )?fee[s]?(\s*schedule)?(\s*\d+([\/\-]\d+)?)?/i;

function cityFromFilename(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(FEE_SUFFIX, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBenchmarkFeeSchedule(doc: ParsedDoc): ExtractedDocument {
  const base = extractFeeSchedule(doc);
  const comparatorCity = cityFromFilename(doc.fileName) || doc.fileName;

  // Re-tag as benchmark and stamp each row with the comparator city.
  base.documentType = "benchmark_fee_schedule";
  for (const section of base.sections) {
    for (const r of section.rows) {
      r.fields = { ...r.fields, comparatorCity };
    }
  }
  for (const r of base.unsectioned) {
    r.fields = { ...r.fields, comparatorCity };
  }
  return base;
}
