import type {
  AllocationBasis, BasisKey, BasisUnitReceiver, BasisUnitRow, CapPool,
  DirectAllocationReceiver, DirectAllocationRow, MatrixDeptCode,
} from "@/lib/types";
import type { ExtractionResult, SourceLineage, UnmappedRow } from "@/lib/parse/types";
import { SEED_ALLOCATION_BASES } from "@/lib/data/allocationBasesCatalog";

// ---------------------------------------------------------------------------
// Wire types (what the model returns over /api/ai/parse-cap)
// ---------------------------------------------------------------------------

interface CenterRow {
  name: string;
  /** Document's own account code. Unique within a single document; use as
   *  the receiver/center identity key. Stable within one city + fiscal
   *  year — NOT a cross-city join key. */
  glCode?: string;
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

/** Wire shape for one receiver row inside a BasisUnitsRow.receivers. */
interface BasisUnitsReceiverRow {
  dept: string;
  glCode: string;
  /** Optional MatrixDeptCode classification. Defaults to "OTHER" when
   *  missing or unmappable — glCode is the identity anyway. */
  deptCode?: string;
  units: number;
  confidence?: "high" | "low";
}

interface BasisUnitsRow {
  basis: string;
  source?: string;
  receivers: BasisUnitsReceiverRow[];
}

/** Wire shape for one receiver row inside a DirectAllocationsRow. */
interface DirectReceiverRow {
  dept: string;
  glCode: string;
  deptCode?: string;
  percent: number;
  confidence?: "high" | "low";
}

interface DirectAllocationsRow {
  /** Pool name to match against — DIRECT pools are looked up by name
   *  (within their center). */
  pool: string;
  /** Optional center disambiguator when two pools share a name. */
  center?: string;
  receivers: DirectReceiverRow[];
}

interface PoolRow {
  center: string;
  pool: string;
  allocationPercent: number;
  amount: number;
  /** Personnel-cost portion (salaries + benefits). Optional. */
  personnelCost?: number;
  /** Operating-cost portion (non-personnel). Optional. */
  operatingCost?: number;
  /** Disallowed / excluded portion (capital, one-time, pass-through). Optional. */
  disallowedCost?: number;
  basis: string;
  receiving?: string;
  recoverability?: string;
  confidence: "high" | "low";
}

interface AiParseCapResult {
  ok: boolean;
  centers: CenterRow[];
  bases: BasisRow[];
  basisUnits: BasisUnitsRow[];
  pools: PoolRow[];
  directAllocations: DirectAllocationsRow[];
  message?: string;
}

export async function aiParseCapPdf(file: File): Promise<AiParseCapResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/ai/parse-cap", { method: "POST", body: form });
  if (!res.ok && res.status !== 502) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      centers: [], bases: [], basisUnits: [], pools: [], directAllocations: [],
      message: text || `HTTP ${res.status}`,
    };
  }
  const body = await res.json() as Partial<AiParseCapResult>;
  return {
    ok: body.ok ?? false,
    centers: Array.isArray(body.centers) ? body.centers : [],
    bases: Array.isArray(body.bases) ? body.bases : [],
    basisUnits: Array.isArray(body.basisUnits) ? body.basisUnits : [],
    pools: Array.isArray(body.pools) ? body.pools : [],
    directAllocations: Array.isArray(body.directAllocations) ? body.directAllocations : [],
    message: body.message,
  };
}

// ---------------------------------------------------------------------------
// Centers — ExtractionResult<{ name, totalCost }>
// ---------------------------------------------------------------------------

interface CapCenterEntity {
  name: string;
  /** Document's own account code. */
  glCode?: string;
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
    if (!name || !Number.isFinite(totalCost)) return;
    if (totalCost < 0) return;

    const glCode = row.glCode?.trim() || undefined;
    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: { name: row.name, glCode: row.glCode ?? null, totalCost: row.totalCost },
      confidence: row.confidence === "high" ? "high" : "review",
      importedAt: now,
    };
    const entity: CapCenterEntity = { name, totalCost, ...(glCode ? { glCode } : {}) };
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

    const driverKey = normBasisKey(row.driverKey) ?? inferBasisKey(row);
    if (!driverKey) {
      unmapped.push({
        reason: "schema-mismatch",
        raw: [row.name ?? "", row.driverKey ?? "", row.source ?? "", row.methodologyNote ?? ""],
        lineage,
      });
      return;
    }
    const directTo = driverKey === "DIRECT" ? normMatrixDept(row.directTo) ?? undefined : undefined;

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
    if (row.confidence === "low" || !normBasisKey(row.driverKey)) lowConfidence.push(extracted);
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
// Basis units — ExtractionResult<BasisUnitRow>
// ---------------------------------------------------------------------------

/** Convert wire basisUnits to BasisUnitRow entities. basisId is left blank
 *  here; mergeCapBundle re-resolves it against the post-merge catalog. */
export function capBasisUnitsToExtractionResult(
  rows: BasisUnitsRow[],
  fileName: string,
): ExtractionResult<BasisUnitRow> {
  const now = new Date().toISOString();
  const mapped: { entity: BasisUnitRow; lineage: SourceLineage }[] = [];
  const lowConfidence: typeof mapped = [];

  rows.forEach((row, i) => {
    const basisName = row.basis?.trim();
    if (!basisName) return;
    const receivers: BasisUnitReceiver[] = [];
    let anyLow = false;
    for (const r of Array.isArray(row.receivers) ? row.receivers : []) {
      const dept = r.dept?.trim();
      const glCode = r.glCode?.trim();
      const units = Number(r.units);
      // glCode is the routing identity — receivers without one are
      // dropped at this layer. The schema is required to provide one.
      if (!dept || !glCode || !Number.isFinite(units) || units < 0) continue;
      const deptCode = normReceiverDeptCode(r.deptCode) ?? "OTHER";
      receivers.push({ dept, glCode, deptCode, units });
      if (r.confidence === "low") anyLow = true;
    }
    if (receivers.length === 0) return;

    const entity: BasisUnitRow = {
      basisId: "",
      basis: basisName,
      source: row.source?.trim() || undefined,
      receivers,
    };
    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        basis: row.basis,
        source: row.source ?? null,
        receiverCount: receivers.length,
      },
      confidence: anyLow ? "review" : "high",
      importedAt: now,
    };
    const extracted = { entity, lineage };
    if (anyLow) lowConfidence.push(extracted);
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
      detected: "Basis units (AI parsed)",
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
    if (amount < 0) return;

    const basisName = row.basis?.trim() ?? "";
    const basisMatch = normBasisName(basisName, bases);

    // Optional cost-breakdown fields. Coerced to non-negative numbers
    // when present; omitted when missing or malformed (the engine doesn't
    // use them — they're for traceability / future surfacing).
    const optMoney = (v: unknown): number | undefined => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const personnelCost = optMoney(row.personnelCost);
    const operatingCost = optMoney(row.operatingCost);
    const disallowedCost = optMoney(row.disallowedCost);

    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        center: row.center, pool: row.pool,
        allocationPercent: row.allocationPercent, amount: row.amount,
        personnelCost: row.personnelCost ?? null,
        operatingCost: row.operatingCost ?? null,
        disallowedCost: row.disallowedCost ?? null,
        basis: row.basis,
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
      basisId: basisMatch?.id ?? "",
      basis: basisMatch?.name ?? basisName,
      receiving: row.receiving?.trim() || "Multiple departments",
      ...(personnelCost  != null ? { personnelCost }  : {}),
      ...(operatingCost  != null ? { operatingCost }  : {}),
      ...(disallowedCost != null ? { disallowedCost } : {}),
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
// Direct allocations — ExtractionResult<DirectAllocationRow>
// ---------------------------------------------------------------------------

/** Convert wire directAllocations to DirectAllocationRow entities. The
 *  poolId field is resolved by matching pool name (and optional center)
 *  against the pools also being imported in this bundle. */
export function capDirectAllocationsToExtractionResult(
  rows: DirectAllocationsRow[],
  pools: ExtractionResult<CapPool>,
  fileName: string,
): ExtractionResult<DirectAllocationRow> {
  const now = new Date().toISOString();
  const mapped: { entity: DirectAllocationRow; lineage: SourceLineage }[] = [];
  const lowConfidence: typeof mapped = [];

  // Pool lookup by (center, name) — newly-imported pools only. The merge
  // layer later cross-references against the existing store.
  const poolEntries = [...pools.mapped, ...pools.lowConfidence].map((p) => p.entity);
  const byName = new Map<string, CapPool[]>();
  for (const p of poolEntries) {
    const list = byName.get(p.pool.toLowerCase()) ?? [];
    list.push(p);
    byName.set(p.pool.toLowerCase(), list);
  }

  rows.forEach((row, i) => {
    const poolName = row.pool?.trim();
    if (!poolName) return;
    const candidates = byName.get(poolName.toLowerCase()) ?? [];
    const targetPool = row.center
      ? candidates.find((p) => p.center.toLowerCase() === row.center!.trim().toLowerCase())
      : candidates[0];
    if (!targetPool) return;

    const receivers: DirectAllocationReceiver[] = [];
    let anyLow = false;
    for (const r of Array.isArray(row.receivers) ? row.receivers : []) {
      const dept = r.dept?.trim();
      const glCode = r.glCode?.trim();
      const percent = Number(r.percent);
      if (!dept || !glCode || !Number.isFinite(percent) || percent <= 0) continue;
      const deptCode = normReceiverDeptCode(r.deptCode) ?? "OTHER";
      receivers.push({
        dept, glCode, deptCode,
        percent: Math.max(0, Math.min(100, percent)),
      });
      if (r.confidence === "low") anyLow = true;
    }
    if (receivers.length === 0) return;

    const entity: DirectAllocationRow = {
      poolId: targetPool.id,
      pool: targetPool.pool,
      receivers,
    };
    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        pool: row.pool,
        center: row.center ?? null,
        receiverCount: receivers.length,
      },
      confidence: anyLow ? "review" : "high",
      importedAt: now,
    };
    const extracted = { entity, lineage };
    if (anyLow) lowConfidence.push(extracted);
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
      detected: "Direct allocations (AI parsed)",
    },
  };
}

// ---------------------------------------------------------------------------
// Normalization guards
// ---------------------------------------------------------------------------

const BASIS_KEYS: BasisKey[] = [
  "FTE", "EXPEND", "EXPEND_X", "EXPEND_PW", "PAYROLL", "ACCT", "AGENDA",
  "PRA", "CONTRACT", "SQFT", "VEHICLE", "COMMITS",
  "RECORDS", "EQUAL", "MEETING_HOURS", "MEETINGS", "APPLICATIONS",
  "RECRUITMENTS", "CLAIMS", "RENTAL_HOURS",
  "DIRECT",
];

function normBasisKey(v: string | undefined): BasisKey | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  return (BASIS_KEYS as readonly string[]).includes(s) ? (s as BasisKey) : null;
}

function inferBasisKey(row: BasisRow): BasisKey | null {
  const text = [row.name, row.source, row.methodologyNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text.trim()) return null;

  if (/\bdirect\b/.test(text)) return "DIRECT";
  if (/\bequal\b|\ball departments\b|\bequally\b|\bflat\b/.test(text)) return "EQUAL";
  if (/\brecords?\b|\bdocuments?\b|\blaserfiche\b/.test(text)) return "RECORDS";
  if (/\bmeeting hours?\b|hours of meetings?/.test(text)) return "MEETING_HOURS";
  if (/\bmeetings?\b/.test(text)) return "MEETINGS";
  if (/\bapplications?\b|\bpermits?\b/.test(text)) return "APPLICATIONS";
  if (/\brecruitments?\b|\bhiring\b/.test(text)) return "RECRUITMENTS";
  if (/\bclaims?\b|\bclaim history\b|\binsurance losses\b/.test(text)) return "CLAIMS";
  if (/\brental hours?\b|\bfacility rentals?\b|\bhall rentals?\b/.test(text)) return "RENTAL_HOURS";

  return null;
}

const MATRIX_DEPTS: MatrixDeptCode[] = [
  "BLDG_USE", "EQUIP", "COUNCIL", "CMGR", "CLERK", "FAS",
  "ATTY", "INS", "CMTE",
  "PLAN", "BLDG", "ENG", "PW", "PARKS", "PD", "FIRE",
];

function normMatrixDept(v: string | undefined): MatrixDeptCode | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  return (MATRIX_DEPTS as readonly string[]).includes(s) ? (s as MatrixDeptCode) : null;
}

/** Coerce a receiver row's deptCode. Receivers may legitimately point at a
 *  fund/program with no MatrixDeptCode (CIP funds, grant funds, "All Other"),
 *  which the SYSTEM prompt encodes as the literal "OTHER" — so unlike
 *  normMatrixDept this returns "OTHER" instead of null in that case.
 *  Returns null only when the value is missing entirely; the caller can
 *  then fall back to "OTHER" since glCode is the identity anyway. */
function normReceiverDeptCode(v: string | undefined): MatrixDeptCode | "OTHER" | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  if (s === "OTHER") return "OTHER";
  return (MATRIX_DEPTS as readonly string[]).includes(s) ? (s as MatrixDeptCode) : "OTHER";
}

/** Resolve a free-text basis name to a catalog entry. */
function normBasisName(
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

/** Pull display fields out of an unmapped CAP-basis lineage. The rawCells
 *  shape mirrors what capBasesToExtractionResult writes for OTHER /
 *  unrecognized-driver rows. Surfaced in the CAP page's "unmapped bases"
 *  banner to help the user fix the underlying schema. */
export function unmappedBasisDetails(u: UnmappedRow): {
  name: string; driverKey: string; source: string; reason: string;
} {
  const cells = u.lineage.rawCells ?? {};
  const cellOrDash = (v: unknown): string =>
    v == null || v === "" ? "—" : String(v);
  return {
    name: cellOrDash(cells.name),
    driverKey: cellOrDash(cells.driverKey),
    source: cellOrDash(cells.source),
    reason:
      u.reason === "missing-required-field" ? "DIRECT without target"
      : "driver outside named keys",
  };
}
