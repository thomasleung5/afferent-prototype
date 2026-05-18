import type {
  AllocationBasis, BasisKey, CapPool, MatrixDeptCode, PoolReceiver,
} from "@/lib/types";
import type { ExtractionResult, SourceLineage, UnmappedRow } from "@/lib/parse/types";
import { SEED_ALLOCATION_BASES } from "@/lib/data/allocationBasesCatalog";

// ---------------------------------------------------------------------------
// Wire types (what the model returns over /api/ai/parse-cap)
// ---------------------------------------------------------------------------

interface CenterRow {
  name: string;
  totalCost: number;
  confidence: "high" | "low";
}

interface BasisRow {
  name: string;
  source: string;
  methodologyNote?: string;
  driverKey: string;
  directTo?: string;
  confidence: "high" | "low";
}

/** Wire shape for one receiver row inside PoolRow.receivers. Mirrors the
 *  server's ReceiverRow in server/aiParseCap.ts. */
interface ReceiverRow {
  dept: string;
  /** MatrixDeptCode or "OTHER"; coerced via normReceiverDeptCode. */
  deptCode: string;
  units?: number;
  percent: number;
  amount: number;
  confidence: "high" | "low";
}

interface PoolRow {
  center: string;
  pool: string;
  allocationPercent: number;
  amount: number;
  eligiblePercent?: number;
  basis: string;
  receivers?: ReceiverRow[];
  receiving?: string;
  recoverability?: string;
  confidence: "high" | "low";
}

export interface AiParseCapResult {
  ok: boolean;
  centers: CenterRow[];
  bases: BasisRow[];
  pools: PoolRow[];
  message?: string;
}

export async function aiParseCapPdf(file: File): Promise<AiParseCapResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/ai/parse-cap", { method: "POST", body: form });
  if (!res.ok && res.status !== 502) {
    const text = await res.text().catch(() => "");
    return { ok: false, centers: [], bases: [], pools: [], message: text || `HTTP ${res.status}` };
  }
  const body = await res.json() as Partial<AiParseCapResult>;
  return {
    ok: body.ok ?? false,
    centers: Array.isArray(body.centers) ? body.centers : [],
    bases: Array.isArray(body.bases) ? body.bases : [],
    pools: Array.isArray(body.pools) ? body.pools : [],
    message: body.message,
  };
}

// ---------------------------------------------------------------------------
// Centers — ExtractionResult<{ name, totalCost }>
// ---------------------------------------------------------------------------

export interface CapCenterEntity {
  name: string;
  totalCost: number;
}

export function capCentersToExtractionResult(
  rows: CenterRow[],
  fileName: string,
): ExtractionResult<CapCenterEntity> {
  const now = new Date().toISOString();
  const mapped: { entity: CapCenterEntity; lineage: SourceLineage }[] = [];
  const lowConfidence: typeof mapped = [];

  rows.forEach((row, i) => {
    const name = row.name?.trim();
    const totalCost = Number(row.totalCost);
    if (!name || !Number.isFinite(totalCost) || totalCost <= 0) return;

    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: { name: row.name, totalCost: row.totalCost },
      confidence: row.confidence === "high" ? "high" : "review",
      importedAt: now,
    };
    const entity: CapCenterEntity = { name, totalCost };
    const extracted = { entity, lineage };
    if (row.confidence === "low") lowConfidence.push(extracted);
    else mapped.push(extracted);
  });

  return {
    mapped, lowConfidence,
    unmapped: [], duplicates: [],
    stats: {
      total: rows.length,
      mapped: mapped.length,
      lowConfidence: lowConfidence.length,
      unmapped: 0,
      duplicates: 0,
      detected: "Cost centers (AI parsed)",
    },
  };
}

// ---------------------------------------------------------------------------
// Bases — ExtractionResult<AllocationBasis>
// ---------------------------------------------------------------------------

export function capBasesToExtractionResult(
  rows: BasisRow[],
  fileName: string,
): ExtractionResult<AllocationBasis> {
  const now = new Date().toISOString();
  const mapped: { entity: AllocationBasis; lineage: SourceLineage }[] = [];
  const lowConfidence: typeof mapped = [];
  const unmapped: UnmappedRow[] = [];

  rows.forEach((row, i) => {
    const name = row.name?.trim();
    if (!name) return;

    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        name: row.name,
        driverKey: row.driverKey,
        source: row.source ?? null,
        methodologyNote: row.methodologyNote ?? null,
      },
      confidence: row.confidence === "high" ? "high" : "review",
      importedAt: now,
    };

    // OTHER is the SYSTEM prompt's overflow bucket for bases whose underlying
    // driver doesn't match any of the twelve named keys. There's no DRIVERS
    // column for OTHER, so the step-down engine can't route it — surface to
    // the user for review (or to redefine to a real key) instead of silently
    // dropping it.
    const rawKey = (row.driverKey ?? "").trim().toUpperCase();
    if (rawKey === "OTHER") {
      unmapped.push({
        reason: "schema-mismatch",
        raw: [row.name ?? "", "OTHER (no driver)", row.source ?? "", row.methodologyNote ?? ""],
        lineage,
      });
      return;
    }

    const driverKey = normBasisKey(row.driverKey);
    if (!driverKey) {
      // Any other unknown key the model returned despite the prompt's
      // instructions — surface it the same way as OTHER so the user can
      // see what was rejected.
      unmapped.push({
        reason: "schema-mismatch",
        raw: [row.name ?? "", row.driverKey ?? "", row.source ?? "", row.methodologyNote ?? ""],
        lineage,
      });
      return;
    }
    const directTo = driverKey === "DIRECT" ? normMatrixDept(row.directTo) ?? undefined : undefined;
    if (driverKey === "DIRECT" && !directTo) {
      // DIRECT with no resolvable target — also surface for review.
      unmapped.push({
        reason: "missing-required-field",
        raw: [row.name ?? "", `DIRECT → ${row.directTo ?? "(none)"}`, row.source ?? "", row.methodologyNote ?? ""],
        lineage,
      });
      return;
    }

    const entity: AllocationBasis = {
      id: `bas-ai-${Date.now()}-${i}`,
      name,
      source: row.source?.trim() || "Document",
      methodologyNote: row.methodologyNote?.trim() || undefined,
      validationStatus: "draft",
      createdBy: "AI import",
      createdAt: now,
      driverKey,
      ...(directTo ? { directTo } : {}),
    };
    const extracted = { entity, lineage };
    if (row.confidence === "low") lowConfidence.push(extracted);
    else mapped.push(extracted);
  });

  return {
    mapped, lowConfidence,
    unmapped, duplicates: [],
    stats: {
      total: rows.length,
      mapped: mapped.length,
      lowConfidence: lowConfidence.length,
      unmapped: unmapped.length,
      duplicates: 0,
      detected: "Allocation bases (AI parsed)",
    },
  };
}

// ---------------------------------------------------------------------------
// Pools — ExtractionResult<CapPool>
// ---------------------------------------------------------------------------

export function capPoolsToExtractionResult(
  rows: PoolRow[],
  fileName: string,
): ExtractionResult<CapPool> {
  // Resolve against the seed catalog only — mergeCapBundle re-resolves
  // basisId post-merge against the effective catalog (seed + newly imported
  // bases + pre-existing state) so pools that reference a basis imported in
  // the same bundle still bind correctly.
  const bases: AllocationBasis[] = SEED_ALLOCATION_BASES;
  const now = new Date().toISOString();
  const mapped: { entity: CapPool; lineage: SourceLineage }[] = [];
  const lowConfidence: typeof mapped = [];

  rows.forEach((row, i) => {
    const center = row.center?.trim();
    const pool = row.pool?.trim();
    const allocationPercent = Number(row.allocationPercent);
    const amount = Number(row.amount);
    if (!center || !pool) return;
    if (!Number.isFinite(allocationPercent) || !Number.isFinite(amount)) return;
    if (amount <= 0) return; // skip zero-dollar rows the SYSTEM prompt was told to drop

    const basisName = row.basis?.trim() ?? "";
    const basisMatch = normBasisName(basisName, bases);

    const eligibleRaw = Number(row.eligiblePercent);
    const eligiblePercent = Number.isFinite(eligibleRaw)
      ? Math.max(0, Math.min(100, eligibleRaw))
      : 100;

    const receivers = normReceivers(row.receivers);

    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        center: row.center, pool: row.pool,
        allocationPercent: row.allocationPercent, amount: row.amount,
        basis: row.basis,
        receiverCount: receivers.length,
      },
      confidence: row.confidence === "high" ? "high" : "review",
      importedAt: now,
    };

    const entity: CapPool = {
      id: `cap-ai-${Date.now()}-${i}`,
      center,
      pool,
      allocationPercent: Math.max(0, Math.min(100, allocationPercent)),
      amount,
      eligiblePercent,
      basisId: basisMatch?.id ?? "",
      basis: basisMatch?.name ?? basisName,
      receiving: row.receiving?.trim() || "Multiple departments",
      ...(receivers.length > 0 ? { receivers } : {}),
      recoverability: row.recoverability?.trim() || "TBD",
      review: row.confidence === "high" ? "Reviewed" : "Review",
    };
    const extracted = { entity, lineage };
    if (row.confidence === "low") lowConfidence.push(extracted);
    else mapped.push(extracted);
  });

  return {
    mapped, lowConfidence,
    unmapped: [], duplicates: [],
    stats: {
      total: rows.length,
      mapped: mapped.length,
      lowConfidence: lowConfidence.length,
      unmapped: 0,
      duplicates: 0,
      detected: "Cost pools (AI parsed)",
    },
  };
}

// ---------------------------------------------------------------------------
// Normalization guards — coerce model output to canonical unions, drop
// rows whose required fields cannot be coerced.
// ---------------------------------------------------------------------------

const BASIS_KEYS: BasisKey[] = [
  "FTE", "EXPEND", "EXPEND_X", "PAYROLL", "ACCT", "AGENDA",
  "PRA", "CONTRACT", "SQFT", "VEHICLE", "COMMITS", "DIRECT",
];

export function normBasisKey(v: string | undefined): BasisKey | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  return (BASIS_KEYS as readonly string[]).includes(s) ? (s as BasisKey) : null;
}

const MATRIX_DEPTS: MatrixDeptCode[] = [
  "BLDG_USE", "EQUIP", "COUNCIL", "CMGR", "CLERK", "FAS",
  "ATTY", "INS", "CMTE",
  "PLAN", "BLDG", "ENG", "PW", "PARKS", "PD", "FIRE",
];

export function normMatrixDept(v: string | undefined): MatrixDeptCode | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  return (MATRIX_DEPTS as readonly string[]).includes(s) ? (s as MatrixDeptCode) : null;
}

/** Coerce a receiver row's deptCode. Receivers may legitimately point at a
 *  fund/program with no MatrixDeptCode (CIP funds, grant funds, "All Other"),
 *  which the SYSTEM prompt encodes as the literal "OTHER" — so unlike
 *  normMatrixDept this returns "OTHER" instead of null in that case. */
function normReceiverDeptCode(v: string | undefined): MatrixDeptCode | "OTHER" | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  if (s === "OTHER") return "OTHER";
  return (MATRIX_DEPTS as readonly string[]).includes(s) ? (s as MatrixDeptCode) : null;
}

/** Convert wire-format receivers to PoolReceiver entities. Drops receivers
 *  whose dept name or deptCode can't be resolved, or whose amount is zero
 *  (the SYSTEM prompt was told to skip these but we re-enforce client-side
 *  so a noisy response can't corrupt downstream sums). */
function normReceivers(rows: ReceiverRow[] | undefined): PoolReceiver[] {
  if (!Array.isArray(rows)) return [];
  const out: PoolReceiver[] = [];
  for (const r of rows) {
    const dept = r.dept?.trim();
    if (!dept) continue;
    const code = normReceiverDeptCode(r.deptCode);
    if (!code) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const percentRaw = Number(r.percent);
    const percent = Number.isFinite(percentRaw)
      ? Math.max(0, Math.min(100, percentRaw))
      : 0;
    const unitsRaw = Number(r.units);
    const units = Number.isFinite(unitsRaw) ? unitsRaw : undefined;
    out.push({
      dept,
      deptCode: code,
      percent,
      amount,
      ...(units != null ? { units } : {}),
    });
  }
  return out;
}

/** Resolve a free-text basis name to a catalog entry. Tries:
 *  1. exact (case-insensitive) match on the supplied catalog
 *  2. exact (case-insensitive) match on the seed catalog
 *  3. relaxed match ignoring punctuation/whitespace
 *  Returns null if no match — the caller keeps the raw name in pool.basis
 *  and leaves basisId blank, matching the behavior of legacy imported pools. */
export function normBasisName(
  v: string,
  catalog: AllocationBasis[] = SEED_ALLOCATION_BASES,
): AllocationBasis | null {
  const s = v.trim();
  if (!s) return null;
  const lc = s.toLowerCase();
  const exact = catalog.find((b) => b.name.toLowerCase() === lc)
    ?? SEED_ALLOCATION_BASES.find((b) => b.name.toLowerCase() === lc);
  if (exact) return exact;
  const loose = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const key = loose(s);
  return catalog.find((b) => loose(b.name) === key)
    ?? SEED_ALLOCATION_BASES.find((b) => loose(b.name) === key)
    ?? null;
}
