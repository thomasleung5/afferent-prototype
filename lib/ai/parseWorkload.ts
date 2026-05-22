import type { Service, WorkloadRow } from "@/lib/types";
import { FEE_DEPTS } from "@/lib/data/departments";
import type {
  ExtractedRow, ExtractionResult, SourceLineage, UnmappedRow,
} from "@/lib/parse/types";

interface WorkloadItem {
  name: string;
  dept: string;
  prior?: number | null;
  current?: number | null;
  unit?: string;
  confidence: "high" | "low";
}

interface AiParseWorkloadResult {
  ok: boolean;
  items: WorkloadItem[];
  message?: string;
}

export async function aiParseWorkloadPdf(file: File): Promise<AiParseWorkloadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/ai/parse-workload", { method: "POST", body: form });
  if (!res.ok && res.status !== 502) {
    const text = await res.text().catch(() => "");
    return { ok: false, items: [], message: text || `HTTP ${res.status}` };
  }
  const body = await res.json() as AiParseWorkloadResult;
  return body;
}

/** Normalize a service name for matching: lowercase, collapse whitespace,
 *  strip dashes/parens/slashes/dots/commas so document wording variants
 *  ("Building Permit - SFR (typ.)" vs "Building Permit—SFR") collapse. */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—−—–\-()/.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normDept(v: string): Service["dept"] | null {
  const s = v.trim().toUpperCase();
  if ((FEE_DEPTS as readonly string[]).includes(s)) return s as Service["dept"];
  return null;
}

export function workloadToExtractionResult(
  rows: WorkloadItem[],
  existing: Service[],
  fileName: string,
  /** Existing workload rows in state, used to detect rows that would
   *  overwrite a service that already has a non-null current. */
  existingWorkload: WorkloadRow[] = [],
): ExtractionResult<WorkloadRow> {
  const now = new Date().toISOString();

  // Lookup: normalized name → catalog service. The catalog is read-only
  // from workload-import's perspective — we only consult it, never mutate.
  const byName = new Map<string, Service>();
  for (const s of existing) byName.set(normName(s.name), s);

  // Map of existing workload rows by service id so we can detect duplicates
  // (existing non-null current values the import would clobber).
  const existingByServiceId = new Map<string, WorkloadRow>();
  for (const w of existingWorkload) existingByServiceId.set(w.id, w);

  const mapped: ExtractedRow<WorkloadRow>[] = [];
  const lowConfidence: ExtractedRow<WorkloadRow>[] = [];
  const duplicates: ExtractedRow<WorkloadRow>[] = [];
  const unmapped: UnmappedRow[] = [];

  rows.forEach((row, i) => {
    const dept = normDept(row.dept);
    const priorNum = numericOrNull(row.prior);
    const currentNum = numericOrNull(row.current);

    const baseLineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        name: row.name,
        dept: row.dept,
        prior: row.prior ?? null,
        current: row.current ?? null,
        unit: row.unit ?? null,
      },
      confidence: row.confidence === "high" ? "high" : "review",
      importedAt: now,
    };

    // Drop rows the SYSTEM prompt was already told to skip but that slipped
    // through (dept unrecognized, both volumes missing/non-numeric). These
    // go to unmapped so the user can audit what was rejected.
    if (!dept || (priorNum == null && currentNum == null)) {
      unmapped.push({
        reason: !dept ? "ambiguous-dept" : "missing-required-field",
        raw: [row.name ?? "", row.dept ?? "", String(row.prior ?? ""), String(row.current ?? "")],
        lineage: baseLineage,
      });
      return;
    }

    const matched = byName.get(normName(row.name ?? ""));

    // No catalog match — surface as unmapped, DO NOT auto-create a Service.
    // The synthetic id is for keying only; the row never reaches mergeRows
    // because unmapped is handled separately by the store.
    if (!matched) {
      unmapped.push({
        reason: "schema-mismatch",
        raw: [row.name ?? "", row.dept ?? "", String(row.prior ?? ""), String(row.current ?? "")],
        lineage: baseLineage,
      });
      return;
    }

    // Catalog match but dept disagrees — route to unmapped with the
    // mismatch surfaced. Don't silently re-bucket to a different catalog
    // entry; the user has to resolve this.
    if (matched.dept !== dept) {
      unmapped.push({
        reason: "ambiguous-dept",
        raw: [row.name ?? "", `model:${row.dept} catalog:${matched.dept}`, String(row.prior ?? ""), String(row.current ?? "")],
        lineage: {
          ...baseLineage,
          rawCells: {
            ...baseLineage.rawCells,
            catalogDept: matched.dept,
            catalogServiceId: matched.id,
          },
        },
      });
      return;
    }

    const entity: WorkloadRow = {
      id: matched.id,
      prior: priorNum,
      current: currentNum,
      unit: row.unit?.trim() || "units",
      source: "imported",
      status: "Imported",
      sourceFile: fileName,
      ...(currentNum == null ? { flag: "missing-current-volume" as const } : {}),
    };

    const extracted: ExtractedRow<WorkloadRow> = { entity, lineage: baseLineage };

    // Duplicate detection: the target service already has a non-null
    // current in state. mergeRows would clobber it; route to duplicates so
    // the user is aware.
    const prevWorkload = existingByServiceId.get(matched.id);
    if (prevWorkload && prevWorkload.current != null) {
      duplicates.push(extracted);
    } else if (row.confidence === "low") {
      lowConfidence.push(extracted);
    } else {
      mapped.push(extracted);
    }
  });

  return {
    mapped, lowConfidence, unmapped, duplicates,
    stats: {
      total: rows.length,
      mapped: mapped.length,
      lowConfidence: lowConfidence.length,
      unmapped: unmapped.length,
      duplicates: duplicates.length,
      detected: "Workload (AI parsed)",
    },
  };
}

function numericOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
