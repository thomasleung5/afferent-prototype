import type {
  AllocationBasis, BasisKey, BasisUnitReceiver, BasisUnitRow, CapPool,
  DirectAllocationReceiver, DirectAllocationRow, InstDeptCode,
} from "@/lib/types";
import type { ExtractionResult, SourceLineage, UnmappedRow } from "@/lib/parse/types";
import { SEED_ALLOCATION_BASES } from "@/lib/data/allocationBasesCatalog";
import { INST_DEPT_CODE_LIST } from "@/lib/data/institutionalDepts";
import { aiApiPost } from "./aiApi";

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
  /** Optional InstDeptCode classification. Defaults to "OTHER" when
   *  missing or unmappable — glCode is the identity anyway. */
  deptCode?: string;
  units: number;
  confidence?: "high" | "low";
}

interface BasisUnitsRow {
  basis: string;
  source?: string;
  /** Optional printed Grand Total under the basis's Value column, when
   *  the document publishes one. Used by import validation to flag
   *  schedules whose receiver sum does not match the printed total. */
  printedTotal?: number;
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
  /** Source-published First Allocation incoming-cost share for this pool. Optional. */
  firstIncomingCost?: number;
  /** Source-published Second Allocation incoming-cost share for this pool. Optional. */
  secondIncomingCost?: number;
  /** Source-published TOTAL FUNCTIONAL COSTS for this pool. Optional. */
  functionalCost?: number;
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
  const body = await aiApiPost<AiParseCapResult>("/api/ai/parse-cap", form);
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

    // driverKey is legacy classification metadata only — the engine
    // never reads it. Default to "OTHER" when the row's classification
    // doesn't match a known key; unfamiliar basis names always import.
    const driverKey =
      basisKeyOverride(row.name)
      ?? normBasisKey(row.driverKey)
      ?? inferBasisKey(row)
      ?? "OTHER";
    const directTo = driverKey === "DIRECT" ? normInstDept(row.directTo) ?? undefined : undefined;

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
  const unmapped: UnmappedRow[] = [];

  rows.forEach((row, i) => {
    const basisName = row.basis?.trim();
    const reviewLineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        issueKind: "invalid-schedule",
        basis: row.basis ?? null,
        source: row.source ?? null,
        receiverCount: Array.isArray(row.receivers) ? row.receivers.length : 0,
      },
      confidence: "review",
      importedAt: now,
    };
    if (!basisName) {
      unmapped.push({
        reason: "missing-required-field",
        raw: ["", row.source ?? "", "Schedule has no basis name"],
        lineage: reviewLineage,
      });
      return;
    }
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
    if (receivers.length === 0) {
      unmapped.push({
        reason: "missing-required-field",
        raw: [basisName, row.source ?? "", "Schedule has no valid receivers"],
        lineage: reviewLineage,
      });
      return;
    }

    const printedTotal = Number(row.printedTotal);
    const hasPrintedTotal = Number.isFinite(printedTotal) && printedTotal > 0;
    const extractedTotal = receivers.reduce((s, r) => s + r.units, 0);
    let totalMismatch = false;
    let difference = 0;
    if (hasPrintedTotal) {
      const tolerance = Math.max(1, Math.abs(printedTotal) * 0.005);
      difference = extractedTotal - printedTotal;
      totalMismatch = Math.abs(difference) > tolerance;
    }

    const entity: BasisUnitRow = {
      basisId: "",
      basis: basisName,
      source: row.source?.trim() || undefined,
      receivers,
    };
    // Warn-and-import on total mismatch: a printed-total / receiver-sum gap
    // is a data-quality signal, not evidence the schedule is wrong. Earlier
    // behavior was to discard, which masked recoverable schedules (e.g.
    // dual-grand-total ambiguity, dollar-sign token fragmentation) behind
    // the missing-schedule banner. Now we keep the schedule and surface the
    // gap on the lineage so the importer UI can flag it for human review.
    const lineage: SourceLineage = {
      file: fileName,
      sheet: "AI parsed",
      row: i + 1,
      rawCells: {
        ...(totalMismatch ? { issueKind: "schedule-total-mismatch" } : {}),
        basis: row.basis,
        source: row.source ?? null,
        receiverCount: receivers.length,
        ...(hasPrintedTotal ? { printedTotal, extractedTotal } : {}),
        ...(totalMismatch ? { difference } : {}),
      },
      confidence: anyLow || totalMismatch ? "review" : "high",
      importedAt: now,
    };
    const extracted = { entity, lineage };
    if (anyLow || totalMismatch) lowConfidence.push(extracted);
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
  importedBases: AllocationBasis[] = [],
): ExtractionResult<CapPool> {
  // Resolve against the seed catalog plus bases imported in this bundle.
  // mergeCapBundle re-resolves again against the effective post-merge
  // catalog so pre-existing study bases still bind correctly.
  const bases: AllocationBasis[] = [...SEED_ALLOCATION_BASES, ...importedBases];
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
    const firstIncomingCost = optMoney(row.firstIncomingCost);
    const secondIncomingCost = optMoney(row.secondIncomingCost);
    const functionalCost = optMoney(row.functionalCost);

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
        firstIncomingCost: row.firstIncomingCost ?? null,
        secondIncomingCost: row.secondIncomingCost ?? null,
        functionalCost: row.functionalCost ?? null,
        basis: row.basis,
      },
      confidence: row.confidence === "high" ? "high" : "review",
      importedAt: now,
    };

    const entity: CapPool = {
      id: `cap-ai-${Date.now()}-${i}`,
      center,
      // centerGlCode is resolved during mergeCapBundle from the bundle's
      // own centers section (preferred) or from existing state. Placeholder
      // here so the entity type-checks; never reaches the engine.
      centerGlCode: "",
      pool,
      allocationPercent: Math.max(0, Math.min(100, allocationPercent)),
      amount,
      basisId: basisMatch?.id ?? "",
      basis: basisMatch?.name ?? basisName,
      receiving: row.receiving?.trim() || "Multiple departments",
      ...(personnelCost  != null ? { personnelCost }  : {}),
      ...(operatingCost  != null ? { operatingCost }  : {}),
      ...(disallowedCost != null ? { disallowedCost } : {}),
      ...(firstIncomingCost  != null ? { firstIncomingCost }  : {}),
      ...(secondIncomingCost != null ? { secondIncomingCost } : {}),
      ...(functionalCost     != null ? { functionalCost }     : {}),
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
  "RECRUITMENTS", "CLAIMS", "RENTAL_HOURS", "OTHER",
  "DIRECT",
];

function normBasisKey(v: string | undefined): BasisKey | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  return (BASIS_KEYS as readonly string[]).includes(s) ? (s as BasisKey) : null;
}

function basisKeyOverride(name: string | undefined): BasisKey | null {
  const text = name?.trim().toLowerCase() ?? "";
  if (!text) return null;
  if (
    text === "gross operating expenses"
    || text === "modified operating expenses"
  ) return "EXPEND";
  if (
    /^(?:assistant |deputy )?city manager service areas$/.test(text)
    || text === "cash and investments"
    || text === "as total city manager organization"
  ) return "OTHER";
  return null;
}

function inferBasisKey(row: BasisRow): BasisKey | null {
  const text = [row.name, row.source, row.methodologyNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text.trim()) return null;

  // NOTE: deliberately no "direct" => "DIRECT" inference here. Section 2
  // bases routinely carry the word "direct" in an otherwise ordinary basis
  // name (e.g. "Direct to Parks and Recreation") while still publishing a
  // real Section 3 receiver schedule on the document's consolidated grid.
  // Legitimate DIRECT-driver bases are only ever the synthetic ones minted
  // by materializeDirectAsBasisUnits (lib/data/capBasisRouting.ts) from an
  // actual Section 5 directAllocations entry — inferring it from name text
  // here caused allocationBasesUsedByPools to silently filter such bases
  // out of the Allocation Bases matrix even when they had a valid schedule.
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

function normInstDept(v: string | undefined): InstDeptCode | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  return (INST_DEPT_CODE_LIST as readonly string[]).includes(s) ? (s as InstDeptCode) : null;
}

/** Coerce a receiver row's deptCode. Receivers may legitimately point at a
 *  fund/program with no InstDeptCode (CIP funds, grant funds, "All Other"),
 *  which the SYSTEM prompt encodes as the literal "OTHER" — so unlike
 *  normInstDept this returns "OTHER" instead of null in that case.
 *  Returns null only when the value is missing entirely; the caller can
 *  then fall back to "OTHER" since glCode is the identity anyway. */
function normReceiverDeptCode(v: string | undefined): InstDeptCode | "OTHER" | null {
  if (!v) return null;
  const s = v.trim().toUpperCase().replace(/\s+/g, "_");
  if (s === "OTHER") return "OTHER";
  return (INST_DEPT_CODE_LIST as readonly string[]).includes(s) ? (s as InstDeptCode) : "OTHER";
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
    name: cellOrDash(cells.name ?? cells.basis ?? cells.pool),
    driverKey: cellOrDash(cells.driverKey ?? cells.issueKind),
    source: cellOrDash(cells.source),
    reason:
      cells.issueKind === "missing-basis" ? "pool basis was not imported"
      : cells.issueKind === "missing-schedule" ? "basis has no receiver schedule"
      : cells.issueKind === "invalid-schedule" ? "schedule has no valid receivers"
      : cells.issueKind === "schedule-total-mismatch" ? "schedule receiver sum does not match printed total"
      : u.reason === "missing-required-field" ? "missing required CAP data"
      : "unresolved CAP data",
  };
}

export function capImportIntegrityIssues(
  bases: ExtractionResult<AllocationBasis>,
  basisUnits: ExtractionResult<BasisUnitRow>,
  pools: ExtractionResult<CapPool>,
  directAllocations: ExtractionResult<DirectAllocationRow>,
  fileName: string,
): UnmappedRow[] {
  const now = new Date().toISOString();
  const importedBases = [...bases.mapped, ...bases.lowConfidence].map((row) => row.entity);
  const importedSchedules = [...basisUnits.mapped, ...basisUnits.lowConfidence]
    .map((row) => row.entity);
  const importedPools = [...pools.mapped, ...pools.lowConfidence].map((row) => row.entity);
  const importedDirect = [
    ...directAllocations.mapped, ...directAllocations.lowConfidence,
  ].map((row) => row.entity);
  const basisByName = new Map(
    importedBases.map((basis) => [basis.name.trim().toLowerCase(), basis]),
  );
  const scheduleNames = new Set(
    importedSchedules.map((row) => row.basis.trim().toLowerCase()),
  );
  const reviewedScheduleNames = new Set(
    basisUnits.unmapped.flatMap((row) => {
      const cells = row.lineage.rawCells ?? {};
      const issueKind = cells.issueKind;
      if (issueKind !== "invalid-schedule" && issueKind !== "schedule-total-mismatch") {
        return [];
      }
      const name = String(cells.basis ?? cells.name ?? "").trim().toLowerCase();
      return name ? [name] : [];
    }),
  );
  // Pools that come with an explicit per-receiver split are direct
  // allocations and will be folded into a synthetic basis schedule at
  // merge time — no separate BasisUnitRow is required for them.
  const directPoolIds = new Set(importedDirect.map((row) => row.poolId));
  const issues: UnmappedRow[] = [];
  const seenMissingBases = new Set<string>();
  const seenMissingSchedules = new Set<string>();

  for (const pool of importedPools) {
    if (directPoolIds.has(pool.id)) continue;
    const key = pool.basis.trim().toLowerCase();
    const basis = basisByName.get(key)
      ?? SEED_ALLOCATION_BASES.find((candidate) =>
        candidate.name.trim().toLowerCase() === key);
    if (!basis) {
      if (seenMissingBases.has(key)) continue;
      seenMissingBases.add(key);
      issues.push({
        reason: "schema-mismatch",
        raw: [pool.pool, pool.basis, "Pool basis was not imported"],
        lineage: {
          file: fileName,
          sheet: "AI parsed",
          rawCells: {
            issueKind: "missing-basis",
            name: pool.basis,
            pool: pool.pool,
            source: fileName,
          },
          confidence: "review",
          importedAt: now,
        },
      });
      continue;
    }
    if (basis.driverKey === "DIRECT" || scheduleNames.has(key) || reviewedScheduleNames.has(key)) {
      continue;
    }
    if (seenMissingSchedules.has(key)) continue;
    seenMissingSchedules.add(key);
    issues.push({
      reason: "missing-required-field",
      raw: [basis.name, pool.pool, "Basis has no receiver schedule"],
      lineage: {
        file: fileName,
        sheet: "AI parsed",
        rawCells: {
          issueKind: "missing-schedule",
          name: basis.name,
          pool: pool.pool,
          driverKey: basis.driverKey,
          source: basis.source,
        },
        confidence: "review",
        importedAt: now,
      },
    });
  }
  return issues;
}
