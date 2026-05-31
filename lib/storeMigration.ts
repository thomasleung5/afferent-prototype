import {
  CAP_BASIS_UNITS, CAP_DIRECT_ALLOCATIONS,
} from "@/lib/data/cap";
import { SEED_ALLOCATION_BASES } from "@/lib/data/allocationBasesCatalog";
import { IMPORTS } from "@/lib/data/imports";
import { FUNCTIONAL_ALLOCATION_SEED } from "@/lib/data/functionalAllocation";
import { DEFAULT_STUDY_CONTEXT } from "@/lib/data/studyContext";
import { DEFAULT_JURISDICTION_ID, getJurisdiction } from "@/lib/data/jurisdictions";
import type {
  FeeFormula, OperatingLine, Service, SourceTag, VolumeRow,
} from "@/lib/types";
import { defaultCenterOrder } from "./store";
import { mapLegacyActivity } from "./data/activities";
import { mapLegacyUnit } from "./data/feeUnits";
import { classifyLaborType } from "./ai/parseOperating";
import type { BuildState, StudyVersion } from "./store";
import { makeStudyVersion } from "./storeSnapshot";

const VALID_SOURCES: SourceTag[] = ["seed", "imported", "manual"];

const coerceSource = (v: unknown): SourceTag =>
  typeof v === "string" && (VALID_SOURCES as string[]).includes(v) ? (v as SourceTag) : "seed";

/** Map a legacy FeeRowKind tag (now removed from Service) to a default
 *  FeeFormula payload so persisted rows keep their kind classification
 *  after the rowKind→formula collapse. Returns undefined for "flat"
 *  (no formula needed) and for any unknown string. */
function defaultFormulaForLegacyRowKind(kind: string): FeeFormula | undefined {
  switch (kind) {
    case "formula":            return { kind: "expression", text: "" };
    case "deposit":            return { kind: "deposit", amount: 0, balance: "actuals" };
    case "time-and-materials": return { kind: "time-and-materials" };
    case "pass-through":       return { kind: "pass-through" };
    case "statutory":          return { kind: "statutory" };
    default:                   return undefined;
  }
}

/** Apply every backfill the Zustand persist layer needs to bring an old
 *  persisted snapshot up to the current `BuildState` shape. Mutates
 *  `state` in place so it can be dropped straight into Zustand's
 *  `onRehydrateStorage` callback.
 *
 *  Each block is a one-way migration: only fields that are genuinely
 *  missing get re-seeded. Empty arrays / objects are treated as a user
 *  deliberately clearing seed data and left alone. Adding a new
 *  migration step? Append below — order matters when later steps read
 *  fields earlier steps may have just backfilled (e.g. allocationPercent
 *  reads capCenterTotals). */
export function migratePersistedState(state: Partial<BuildState>): void {
  if (!state.capCenterOrder || state.capCenterOrder.length === 0) {
    state.capCenterOrder = defaultCenterOrder(state.capPools ?? []);
  }
  if (!state.studyContext) state.studyContext = { ...DEFAULT_STUDY_CONTEXT };
  if (!state.activeJurisdictionId) {
    state.activeJurisdictionId = DEFAULT_JURISDICTION_ID;
  }
  if (!state.activeFiscalYear) {
    state.activeFiscalYear =
      getJurisdiction(state.activeJurisdictionId)?.defaultFiscalYear ?? "FY 2025-26";
  }
  if (!state.capCenterDisallowed) state.capCenterDisallowed = {};
  if (state.capBasisUnits == null) {
    state.capBasisUnits = CAP_BASIS_UNITS.map((bu) => ({
      ...bu, receivers: bu.receivers.map((r) => ({ ...r })),
    }));
  }
  if (state.capDirectAllocations == null) {
    state.capDirectAllocations = CAP_DIRECT_ALLOCATIONS.map((da) => ({
      ...da, receivers: da.receivers.map((r) => ({ ...r })),
    }));
  }
  if (state.directBills == null) {
    state.directBills = {};
  }
  // serviceRoleAllocations is a sparse override map — missing means
  // "use the FTE-weighted default at read time". Older persisted state
  // has no slice at all, so backfill {} here so reducers can do safe
  // spreads without optional-chaining.
  if (state.serviceRoleAllocations == null) {
    state.serviceRoleAllocations = {};
  }

  // Backfill seed imports if the persisted store has an empty log. The
  // Annual Update tab needs at least one import to render the Refresh
  // cards / Change queue / Packet narrative; new users get these from
  // initialState(), but earlier sessions stored [].
  if (!state.imports || state.imports.length === 0) {
    state.imports = IMPORTS.map((e) => ({
      ...e, result: { ...e.result, warnings: [...e.result.warnings] },
    }));
  }

  // Seed functional-allocation buckets on stores that pre-date the slice.
  // Empty array is treated as a deliberate clear (consistent with the
  // imports + allocationBases backfill pattern above) — only null /
  // undefined triggers re-seeding.
  if (state.functionalAllocation == null) {
    state.functionalAllocation = FUNCTIONAL_ALLOCATION_SEED.map((b) => ({ ...b }));
  }

  // capCenterSources default — keyed by center identity (glCode or synth),
  // value carries the display name lifted from capCenterTotals' keys.
  // New seed sessions fall through this path with `state.capCenterSources`
  // already populated by initialState; this branch only fires when a
  // persisted state arrives with no sources at all.
  if (!state.capCenterSources) {
    state.capCenterSources = Object.fromEntries(
      Object.keys(state.capCenterTotals ?? {}).map((key) => [
        key, { name: key, source: "seed" as SourceTag },
      ]),
    );
  }
  if (Array.isArray(state.services)) {
    const needsCoerce = state.services.some(
      (s: Service) => !(VALID_SOURCES as string[]).includes(s.source as string),
    );
    if (needsCoerce) {
      state.services = state.services.map((s: Service) => ({ ...s, source: coerceSource(s.source) }));
    }
    // Synthesize `formula` from any legacy `rowKind` tag and strip the
    // tag. Persisted rows from before the rowKind→formula collapse may
    // carry rowKind without a matching formula payload; without this
    // step they'd silently classify as "flat" after the type narrowed.
    type LegacyService = Service & { rowKind?: string };
    const legacy = state.services as LegacyService[];
    if (legacy.some((s) => s.rowKind != null)) {
      state.services = legacy.map((s) => {
        if (s.rowKind == null) return s;
        const { rowKind, ...rest } = s;
        if (rest.formula != null) return rest;
        const synthesized = defaultFormulaForLegacyRowKind(rowKind);
        return synthesized ? { ...rest, formula: synthesized } : rest;
      });
    }
    // Migrate legacy free-text `unit` into the structured unitLabel +
    // unitType pair, mapping known wording to the canonical FEE_UNITS
    // catalog and preserving anything unmapped as a CUSTOM entry.
    type LegacyUnitService = Service & { unit?: string };
    const withLegacyUnit = state.services as LegacyUnitService[];
    if (withLegacyUnit.some((s) => s.unit != null && s.unitLabel == null)) {
      state.services = withLegacyUnit.map((s) => {
        if (s.unit == null) return s;
        const { unit, ...rest } = s;
        if (rest.unitLabel != null) return rest;
        const mapped = mapLegacyUnit(unit);
        return mapped
          ? { ...rest, unitLabel: mapped.label, unitType: mapped.type }
          : rest;
      });
    }
    // Same migration for activity → activityLabel + activityType.
    type LegacyActivityService = Service & { activity?: string };
    const withLegacyActivity = state.services as LegacyActivityService[];
    if (withLegacyActivity.some((s) => s.activity != null && s.activityLabel == null)) {
      state.services = withLegacyActivity.map((s) => {
        if (s.activity == null) return s;
        const { activity, ...rest } = s;
        if (rest.activityLabel != null) return rest;
        const mapped = mapLegacyActivity(activity);
        return mapped
          ? { ...rest, activityLabel: mapped.label, activityType: mapped.type }
          : rest;
      });
    }
  }
  // Strip the deprecated VolumeRow.unit field from any persisted rows.
  // The activity label now lives only on Service.activityLabel; the
  // VolumeRow.unit fallback was retired.
  if (Array.isArray(state.volume)) {
    type LegacyVolume = VolumeRow & { unit?: string };
    const legacyVolume = state.volume as LegacyVolume[];
    if (legacyVolume.some((v) => v.unit != null)) {
      state.volume = legacyVolume.map((v) => {
        if (v.unit == null) return v;
        const { unit: _unit, ...rest } = v;
        return rest;
      });
    }
  }
  if (state.productiveHours == null) {
    state.productiveHours = [];
  }
  if (Array.isArray(state.operating)) {
    // Backfill costType / laborType / source on legacy rows. Imports that
    // pre-date the field get the "Operating" default; labor rows missing
    // laborType pass through the parser's classifyLaborType so the
    // Salary / Benefits split matches a fresh import.
    const needsOpBackfill = state.operating.some(
      (o: OperatingLine) =>
        !(VALID_SOURCES as string[]).includes(o.source as string)
        || o.costType == null
        || (o.costType === "Labor" && !o.laborType),
    );
    if (needsOpBackfill) {
      state.operating = state.operating.map((o: OperatingLine) => {
        const next: OperatingLine = {
          ...o,
          source: coerceSource(o.source),
          costType: o.costType ?? "Operating",
        };
        if (next.costType === "Labor" && !next.laborType) {
          next.laborType = classifyLaborType({
            line: next.line, category: next.category,
          });
        }
        return next;
      });
    }
  }
  if (Array.isArray(state.volume)) {
    const needsCoerce = state.volume.some(
      (w: VolumeRow) => !(VALID_SOURCES as string[]).includes(w.source as string),
    );
    if (needsCoerce) {
      state.volume = state.volume.map((w: VolumeRow) => ({ ...w, source: coerceSource(w.source) }));
    }
  }
  // Backfill for state persisted before allocationBases existed. Without
  // this, basisForPool(pool, undefined) crashes the matrix.
  if (!state.allocationBases || state.allocationBases.length === 0) {
    state.allocationBases = SEED_ALLOCATION_BASES.map((b) => ({ ...b }));
  }
  // Backfill capCenterTotals + allocationPercent for state persisted
  // before the % column became editable. Derive totals from Σ amount per
  // center; derive each pool's % from amount/centerTotal. Keys are
  // pool.centerGlCode (every pool in seed + import flows is stamped with
  // its identity key at construction time).
  // Skip when there are no pools — an empty pool list can't produce
  // meaningful totals, and entering the block would create an empty
  // capCenterTotals that diverges from the unprocessed shape.
  if (state.capPools && state.capPools.length > 0) {
    if (!state.capCenterTotals || Object.keys(state.capCenterTotals).length === 0) {
      const totals: Record<string, number> = {};
      for (const p of state.capPools) {
        const key = p.centerGlCode;
        if (!key) continue;
        totals[key] = (totals[key] ?? 0) + (p.amount ?? 0);
      }
      state.capCenterTotals = totals;
    }
    const totals = state.capCenterTotals;
    const needsPctBackfill = state.capPools.some(
      (p) => typeof p.allocationPercent !== "number",
    );
    if (needsPctBackfill) {
      state.capPools = state.capPools.map((p): BuildState["capPools"][number] => {
        if (typeof p.allocationPercent === "number") return p;
        const total = totals[p.centerGlCode] ?? 0;
        const pct = total > 0 ? (p.amount / total) * 100 : 0;
        return { ...p, allocationPercent: pct };
      });
    }
  }
  // BuildSnapshot safety net. Zustand's default merge fills any field
  // not overridden by persisted state, so in production all of these are
  // already present by the time onRehydrateStorage fires. The defaults
  // matter for two cases: (a) direct callers that bypass Zustand merge
  // (test fixtures, recovery tooling), and (b) the makeStudyVersion path
  // below — which reads every BuildSnapshot field via createBuildSnapshot
  // and would silently produce a partial snapshot if any were undefined.
  if (!Array.isArray(state.operating))        state.operating = [];
  if (!Array.isArray(state.capPools))         state.capPools = [];
  if (!Array.isArray(state.volume))           state.volume = [];
  if (!Array.isArray(state.services))         state.services = [];
  if (!Array.isArray(state.policyTargets))    state.policyTargets = [];
  if (!Array.isArray(state.policyExceptions)) state.policyExceptions = [];
  if (!state.lineage)                          state.lineage = {};
  if (!state.pendingReview) {
    state.pendingReview = {
      positions: [], operating: [], services: [],
      fees: [], volume: [], cap: [],
    };
  }

  if (!Array.isArray(state.versions)) {
    // All BuildSnapshot fields are populated by the safety net above,
    // so the cast is safe and the resulting baseline snapshot is complete.
    const baseline = makeStudyVersion(state as BuildState, {
      label: "Recovered baseline",
      status: "adopted",
      notes: "Created from the first locally persisted model after versioning was enabled.",
    });
    state.versions = [baseline];
    state.comparisonVersionId = baseline.id;
  }
  if (state.comparisonVersionId && !state.versions.some((v: StudyVersion) => v.id === state.comparisonVersionId)) {
    state.comparisonVersionId = state.versions[0]?.id ?? null;
  }
}
