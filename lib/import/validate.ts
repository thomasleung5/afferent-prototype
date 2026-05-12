/* Shared validation engine.
 *
 * Runs after mapping. Pure function: takes the extracted document + mapping
 * candidates, returns an array of ValidationIssue plus an overall severity.
 *
 * Severity ranking (highest first):  ERROR > REVIEW > READY > INFO. Any ERROR
 * means the user must address something before writeback; REVIEW means a
 * non-blocking heads-up; READY means everything looks clean; INFO is for
 * passive context (e.g. row count, sections detected).
 *
 * Validation never strips rows — it only annotates. The UI decides what to
 * do with the annotations. */

import type {
  ExtractedDocument, MappingCandidate, ValidationIssue, ValidationSeverity,
} from "./types";

interface ValidateOptions {
  /** Tolerance for total reconciliation (subtotals vs row sum). 0..1. */
  totalsTolerance?: number;
}

export function validate(
  doc: ExtractedDocument, mappings: MappingCandidate[], opts: ValidateOptions = {},
): { issues: ValidationIssue[]; severity: ValidationSeverity } {
  const issues: ValidationIssue[] = [];
  const totalsTolerance = opts.totalsTolerance ?? 0.01;

  // 1. Parse warnings from the upstream parser surface as INFO.
  for (const w of doc.parseWarnings) {
    issues.push({
      code: "source_parse_warning",
      severity: "INFO",
      message: w,
    });
  }

  // 2. Missing required fields → REVIEW (or ERROR if everything is missing).
  for (const m of mappings) {
    if (m.requiredMissingFields.length === 0) continue;
    const severity: ValidationSeverity = m.requiredMissingFields.length >= 3 ? "ERROR" : "REVIEW";
    issues.push({
      code: "missing_required_field",
      severity,
      message: `"${m.sourceLabel}" — missing ${m.requiredMissingFields.join(", ")}`,
      mappingCandidateId: m.id,
      extractedRowId: m.extractedRowId,
      details: { fields: m.requiredMissingFields.join(",") },
    });
  }

  // 3. Low confidence on a row that DID propose a target → REVIEW.
  for (const m of mappings) {
    if (m.proposedTargetTable && m.confidence < 0.5 && m.status !== "auto_accepted") {
      issues.push({
        code: "low_confidence",
        severity: "REVIEW",
        message: `"${m.sourceLabel}" → ${m.proposedTargetTable} at ${(m.confidence * 100).toFixed(0)}% confidence`,
        mappingCandidateId: m.id,
        extractedRowId: m.extractedRowId,
      });
    }
  }

  // 4. Duplicate proposed target rows — two mappings pointing at the same id.
  const targetGroups = new Map<string, MappingCandidate[]>();
  for (const m of mappings) {
    if (!m.proposedTargetId) continue;
    const key = `${m.proposedTargetTable}:${m.proposedTargetId}`;
    const list = targetGroups.get(key) ?? [];
    list.push(m);
    targetGroups.set(key, list);
  }
  for (const [key, group] of targetGroups) {
    if (group.length > 1) {
      issues.push({
        code: "duplicate_row",
        severity: "REVIEW",
        message: `${group.length} extracted rows mapped to the same target (${key})`,
        details: { rowIds: group.map((g) => g.extractedRowId).join(",") },
      });
    }
  }

  // 5. Unmatched department / service.
  for (const m of mappings) {
    if (m.requiredMissingFields.includes("department")) {
      issues.push({
        code: "unmatched_department",
        severity: "REVIEW",
        message: `"${m.sourceLabel}" — couldn't resolve a department`,
        mappingCandidateId: m.id,
        extractedRowId: m.extractedRowId,
      });
    }
    if (m.requiredMissingFields.includes("matching service")) {
      issues.push({
        code: "unmatched_service",
        severity: "REVIEW",
        message: `"${m.sourceLabel}" — no service in catalog matched`,
        mappingCandidateId: m.id,
        extractedRowId: m.extractedRowId,
      });
    }
  }

  // 6. Total reconciliation: per section, sum of row values should equal the
  //    subtotal when one exists.
  for (const section of doc.sections) {
    if (!section.subtotal) continue;
    const sum = section.rows
      .filter((r) => r.rowType !== "subtotal" && r.rowType !== "section_header")
      .map((r) => (r.fields?.current as number | undefined) ?? r.parsedValue ?? 0)
      .reduce((a, b) => a + b, 0);
    if (section.subtotal.amount === 0) continue;
    const diff = Math.abs(sum - section.subtotal.amount) / Math.abs(section.subtotal.amount);
    if (diff > totalsTolerance) {
      issues.push({
        code: "total_reconciliation_warning",
        severity: "REVIEW",
        message: `Section "${section.label}" subtotal $${section.subtotal.amount.toLocaleString()} vs row sum $${sum.toFixed(0)} (${(diff * 100).toFixed(1)}% off)`,
        details: {
          section: section.label,
          subtotal: section.subtotal.amount,
          rowSum: Math.round(sum),
        },
      });
    }
  }

  // 7. Unsupported row types — surface as INFO.
  const unsupported = new Set<string>();
  for (const section of doc.sections) {
    for (const row of section.rows) {
      if (row.rowType === "unknown") unsupported.add(row.id);
    }
  }
  if (unsupported.size > 0) {
    issues.push({
      code: "unsupported_row_type",
      severity: "INFO",
      message: `${unsupported.size} row${unsupported.size === 1 ? "" : "s"} couldn't be classified into a known type`,
    });
  }

  // 8. Invalid amount: parseValue returned NaN/Infinity (caught by parseMoney
  //    already, but we double-check for downstream sanity).
  for (const m of mappings) {
    const v = m.proposedEntity?.fee ?? m.proposedEntity?.amount ?? m.proposedEntity?.current;
    if (typeof v === "number" && !Number.isFinite(v)) {
      issues.push({
        code: "invalid_amount",
        severity: "ERROR",
        message: `"${m.sourceLabel}" has a non-finite amount`,
        mappingCandidateId: m.id,
        extractedRowId: m.extractedRowId,
      });
    }
  }

  // 9. Ambiguous mapping: confidence within 0.1 of next-best for same source.
  //    (We don't carry second-best forward yet — placeholder for future.)

  const severity = rollup(issues);
  return { issues, severity };
}

function rollup(issues: ValidationIssue[]): ValidationSeverity {
  if (issues.some((i) => i.severity === "ERROR")) return "ERROR";
  if (issues.some((i) => i.severity === "REVIEW")) return "REVIEW";
  // No REVIEW/ERROR means we are READY (even if INFO is present).
  return "READY";
}
