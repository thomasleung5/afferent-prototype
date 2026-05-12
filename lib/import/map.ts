/* Mapping engine.
 *
 * Takes an ExtractedDocument and, for each ExtractedRow, decides which
 * target table the row could feed (fees / services / positions / cap /
 * workload / operating) and constructs a MappingCandidate with a confidence
 * + reason + status.
 *
 * Auto-accept only when the proposal is high confidence AND has all required
 * fields. Everything else lands in needs_review or unresolved so the user
 * can see exactly why mapping didn't auto-commit. */

import type {
  DocumentType, ExtractedDocument, ExtractedRow, MappingCandidate,
  TargetTable,
} from "./types";
import { matchService, normalizeDept, type NormalizedDept } from "./normalize";
import type { Service } from "@/lib/types";

const AUTO_ACCEPT_THRESHOLD = 0.85;
const NEEDS_REVIEW_THRESHOLD = 0.5;

let mappingIdSeq = 0;
const nextMappingId = () => `mc-${++mappingIdSeq}`;

interface MapContext {
  /** Existing services — used for name match suggestions. */
  services: Service[];
}

export function mapExtractedDocument(
  doc: ExtractedDocument, ctx: MapContext,
): MappingCandidate[] {
  const out: MappingCandidate[] = [];
  const allRows = [...doc.unsectioned, ...doc.sections.flatMap((s) => s.rows)];

  for (const row of allRows) {
    const candidate = mapRow(doc, row, ctx);
    if (candidate) out.push(candidate);
  }

  return out;
}

function mapRow(
  doc: ExtractedDocument, row: ExtractedRow, ctx: MapContext,
): MappingCandidate | null {
  // Some row types never map to a target table directly — surface them as
  // unresolved with a clear reason rather than dropping silently.
  if (row.rowType === "section_header" || row.rowType === "subtotal") {
    return passthrough(row, null, {
      reason: row.rowType === "subtotal"
        ? "Subtotal row — recorded but not mapped to a target table."
        : "Section header — used for grouping context only.",
      status: "unresolved",
      confidence: 1,
    });
  }
  if (row.rowType === "note_only") {
    return passthrough(row, null, {
      reason: "Narrative/note row — no fee or value to map.",
      status: "unresolved",
      confidence: row.confidence === "high" ? 0.6 : 0.3,
    });
  }

  // Per-document-type routing.
  switch (doc.documentType) {
    case "fee_schedule":
    case "benchmark_fee_schedule":
      return mapToFees(row, ctx, doc.documentType === "benchmark_fee_schedule");
    case "prior_fee_study":
      return mapToServicesOrFees(row, ctx);
    case "salary_roster":
      return mapToPositions(row);
    case "operating_budget":
    case "budget_book":
      return mapToOperating(row);
    case "cost_allocation_plan":
      return mapToCap(row);
    case "workload_export":
      return mapToWorkload(row, ctx);
    default:
      return passthrough(row, null, {
        reason: "Document type unknown — pick a target table to enable mapping.",
        status: "unresolved",
        confidence: 0,
      });
  }
}

/* ── Per-target mappers ─────────────────────────────────────────────────── */

function mapToFees(
  row: ExtractedRow, ctx: MapContext, isBenchmark: boolean,
): MappingCandidate {
  const fee = (row.fields?.current as number | undefined) ?? row.parsedValue;
  const deposit = row.fields?.deposit as number | undefined;

  // Try to match the row's name against the existing service catalog.
  const match = matchService(row.rawLabel, ctx.services);
  const dept = inferDept(row);
  const missing: string[] = [];
  if (fee == null) missing.push("amount");
  if (!isBenchmark && !dept) missing.push("department");

  // Confidence is the min of the name-match score and the data completeness.
  const completeness = missing.length === 0 ? 1 : Math.max(0, 1 - missing.length * 0.4);
  const matchScore = match.top?.confidence ?? 0.4;
  const confidence = Math.min(matchScore, completeness);

  const proposedTargetTable: TargetTable | null = fee != null ? "fees" : null;
  const proposedEntity = isBenchmark
    ? { name: row.rawLabel, peer: fee ?? 0, dept: dept ?? undefined }
    : {
        name: row.rawLabel,
        fee: fee ?? 0,
        deposit,
        dept: dept ?? undefined,
        unit: row.unit,
        rowType: row.rowType,
      };

  const reasonParts: string[] = [];
  if (match.top) reasonParts.push(`service match: ${match.top.serviceName} (${(matchScore * 100).toFixed(0)}%)`);
  else reasonParts.push("no service catalog match");
  if (isBenchmark) reasonParts.push("benchmark → writes to services[].peer");
  if (row.rowType && row.rowType !== "fixed_fee") reasonParts.push(`row type: ${row.rowType}`);

  return {
    id: nextMappingId(),
    extractedRowId: row.id,
    sourceLabel: row.rawLabel,
    proposedTargetTable,
    proposedTargetId: match.top?.serviceId,
    proposedTargetLabel: match.top?.serviceName ?? row.rawLabel,
    confidence,
    mappingReason: reasonParts.join(" · "),
    requiredMissingFields: missing,
    proposedEntity,
    status: statusFor(confidence, missing),
  };
}

function mapToServicesOrFees(row: ExtractedRow, ctx: MapContext): MappingCandidate {
  const fee = (row.fields?.current as number | undefined) ?? row.parsedValue;
  const match = matchService(row.rawLabel, ctx.services);
  const dept = inferDept(row);
  const missing: string[] = [];
  if (!dept) missing.push("department");
  if (fee == null && !match.top) missing.push("amount or matching service");

  const proposedTargetTable: TargetTable | null = fee != null ? "fees" : match.top ? "services" : null;
  const confidence = Math.min(
    match.top?.confidence ?? 0.5,
    missing.length === 0 ? 1 : 0.5,
  );

  return {
    id: nextMappingId(),
    extractedRowId: row.id,
    sourceLabel: row.rawLabel,
    proposedTargetTable,
    proposedTargetId: match.top?.serviceId,
    proposedTargetLabel: match.top?.serviceName ?? row.rawLabel,
    confidence,
    mappingReason: match.top
      ? `service match: ${match.top.serviceName} (${(match.top.confidence * 100).toFixed(0)}%)`
      : "no catalog match — candidate for new service",
    requiredMissingFields: missing,
    proposedEntity: {
      name: row.rawLabel, dept, fee, target: 100,
    },
    status: statusFor(confidence, missing),
  };
}

function mapToPositions(row: ExtractedRow): MappingCandidate {
  const fields = row.fields ?? {};
  const salary = (fields.salary ?? fields.current) as number | undefined;
  const fte = (fields.fte ?? 1) as number;
  const dept = inferDept(row);

  const missing: string[] = [];
  if (!row.rawLabel) missing.push("title");
  if (!dept) missing.push("department");
  if (salary == null) missing.push("salary");

  const confidence = missing.length === 0 ? 0.9 : 0.5 - missing.length * 0.1;
  return {
    id: nextMappingId(),
    extractedRowId: row.id,
    sourceLabel: row.rawLabel,
    proposedTargetTable: missing.length === 0 ? "positions" : null,
    proposedTargetLabel: row.rawLabel,
    confidence: Math.max(0, confidence),
    mappingReason: missing.length === 0
      ? `position row with ${dept}/${fte} fte/$${salary}`
      : `missing ${missing.join(", ")}`,
    requiredMissingFields: missing,
    proposedEntity: { title: row.rawLabel, dept, salary, fte },
    status: statusFor(confidence, missing),
  };
}

function mapToOperating(row: ExtractedRow): MappingCandidate {
  const amount = (row.fields?.amount ?? row.fields?.current ?? row.parsedValue) as number | undefined;
  const dept = inferDept(row);
  const missing: string[] = [];
  if (amount == null) missing.push("amount");

  const confidence = amount != null
    ? (dept ? 0.85 : 0.6)
    : 0.3;

  return {
    id: nextMappingId(),
    extractedRowId: row.id,
    sourceLabel: row.rawLabel,
    proposedTargetTable: amount != null ? "operating" : null,
    proposedTargetLabel: row.rawLabel,
    confidence,
    mappingReason: dept
      ? `${dept} line · $${amount?.toLocaleString() ?? "?"}`
      : `no department — treat as summary-level`,
    requiredMissingFields: missing,
    proposedEntity: { line: row.rawLabel, dept, amount, category: "Other", include: true },
    status: statusFor(confidence, missing),
  };
}

function mapToCap(row: ExtractedRow): MappingCandidate {
  const fields = row.fields ?? {};
  const amount = (fields.allocatedAmount ?? fields.amount ?? row.parsedValue) as number | undefined;
  const pct = (fields.allocationPercent ?? fields.percent) as number | undefined;
  const dept = inferDept(row);

  const missing: string[] = [];
  if (amount == null && pct == null) missing.push("amount or percent");

  const confidence = (amount != null && pct != null) ? 0.9
    : (amount != null || pct != null) ? 0.75
    : 0.3;
  return {
    id: nextMappingId(),
    extractedRowId: row.id,
    sourceLabel: row.rawLabel,
    proposedTargetTable: amount != null ? "cap" : null,
    proposedTargetLabel: row.rawLabel,
    confidence,
    mappingReason: amount != null
      ? `pool row · $${amount.toLocaleString()}${pct != null ? ` · ${pct}%` : ""}`
      : "amount missing — flag and preserve percent",
    requiredMissingFields: missing,
    proposedEntity: {
      pool: row.rawLabel,
      center: row.source.section ?? "",
      amount, percent: pct, dept,
      basis: "FY budgeted",
    },
    status: statusFor(confidence, missing),
  };
}

function mapToWorkload(row: ExtractedRow, ctx: MapContext): MappingCandidate {
  const fields = row.fields ?? {};
  const current = (fields.currentVolume ?? fields.current ?? row.parsedValue) as number | undefined;
  const labelForMatch = String(fields.serviceName ?? row.rawLabel);
  const match = matchService(labelForMatch, ctx.services);
  const missing: string[] = [];
  if (current == null) missing.push("current volume");
  if (!match.top) missing.push("matching service");

  const matchScore = match.top?.confidence ?? 0;
  const confidence = current != null && match.top
    ? Math.min(matchScore, 1)
    : 0.3;

  return {
    id: nextMappingId(),
    extractedRowId: row.id,
    sourceLabel: row.rawLabel,
    proposedTargetTable: match.top && current != null ? "workload" : null,
    proposedTargetId: match.top?.serviceId,
    proposedTargetLabel: match.top?.serviceName ?? row.rawLabel,
    confidence,
    mappingReason: match.top
      ? `matched ${match.top.serviceName} (${(matchScore * 100).toFixed(0)}%)`
      : "no matching service in catalog",
    requiredMissingFields: missing,
    proposedEntity: {
      name: match.top?.serviceName ?? row.rawLabel,
      current, unit: row.unit ?? "Item",
    },
    status: statusFor(confidence, missing),
  };
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function passthrough(
  row: ExtractedRow, target: TargetTable | null, opts: { reason: string; status: MappingCandidate["status"]; confidence: number },
): MappingCandidate {
  return {
    id: nextMappingId(),
    extractedRowId: row.id,
    sourceLabel: row.rawLabel,
    proposedTargetTable: target,
    proposedTargetLabel: row.rawLabel,
    confidence: opts.confidence,
    mappingReason: opts.reason,
    requiredMissingFields: [],
    proposedEntity: {},
    status: opts.status,
  };
}

function inferDept(row: ExtractedRow): NormalizedDept | undefined {
  const sectionHit = row.source.section ? normalizeDept(row.source.section) : null;
  const labelHit = normalizeDept(row.rawLabel);
  const noteHit = row.note ? normalizeDept(row.note) : null;
  // Many extractors don't surface a dept column on row.fields — scan the
  // raw cells and the surfaced fields for any value that normalizes to a
  // real department. This is a mapping-layer fallback only, not extraction.
  let cellHit: ReturnType<typeof normalizeDept> = null;
  if (row.fields) {
    for (const v of Object.values(row.fields)) {
      if (v == null || v === "") continue;
      const hit = normalizeDept(String(v));
      if (hit && hit.value !== "OTHER" && hit.value !== "SHARED") { cellHit = hit; break; }
    }
  }
  if (!cellHit) {
    for (const cell of row.rawCells) {
      if (cell == null || cell === "") continue;
      const hit = normalizeDept(String(cell));
      if (hit && hit.value !== "OTHER" && hit.value !== "SHARED") { cellHit = hit; break; }
    }
  }
  return sectionHit?.value ?? labelHit?.value ?? noteHit?.value ?? cellHit?.value ?? undefined;
}

function statusFor(
  confidence: number, missing: string[],
): MappingCandidate["status"] {
  if (confidence >= AUTO_ACCEPT_THRESHOLD && missing.length === 0) return "auto_accepted";
  if (confidence >= NEEDS_REVIEW_THRESHOLD) return "needs_review";
  return "unresolved";
}
