import {
  CAP_BASIS_UNITS, CAP_CENTER_GLCODES, CAP_DIRECT_ALLOCATIONS,
} from "@/lib/data/cap";
import { SEED_ALLOCATION_BASES } from "@/lib/data/allocationBasesCatalog";
import { IMPORTS } from "@/lib/data/imports";
import { DEFAULT_STUDY_CONTEXT } from "@/lib/data/studyContext";
import { DEFAULT_JURISDICTION_ID, getJurisdiction } from "@/lib/data/jurisdictions";
import type {
  OperatingLine, Position, Service, SourceTag, VolumeRow,
} from "@/lib/types";
import { defaultCenterOrder } from "./store";
import type { BuildState, StudyVersion } from "./store";
import { makeStudyVersion } from "./storeSnapshot";

const VALID_SOURCES: SourceTag[] = ["seed", "imported", "manual"];

const coerceSource = (v: unknown): SourceTag =>
  typeof v === "string" && (VALID_SOURCES as string[]).includes(v) ? (v as SourceTag) : "seed";

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
  // Rename "workload" → "volume" for state persisted before the Volume of
  // Activity tab was introduced. Covers the array field, the pendingReview
  // domain key, and the import-log domain discriminator (on both the entry
  // and its inner result). One-way: legacy fields are deleted after copy
  // so subsequent passes (and the SourceTag coercion below) see the new
  // shape.
  const legacy = state as unknown as Record<string, unknown>;
  if ("workload" in legacy && !("volume" in legacy)) {
    legacy.volume = legacy.workload;
    delete legacy.workload;
  }
  if (state.pendingReview && "workload" in state.pendingReview) {
    const pr = state.pendingReview as unknown as Record<string, unknown[]>;
    if (!("volume" in pr)) pr.volume = pr.workload;
    delete pr.workload;
  }
  if (Array.isArray(state.imports)) {
    for (const entry of state.imports) {
      if ((entry as { domain: string }).domain === "workload") {
        (entry as { domain: string }).domain = "volume";
      }
      const result = (entry as { result?: { domain?: string } }).result;
      if (result && result.domain === "workload") result.domain = "volume";
    }
  }

  if (!state.capCenterOrder || state.capCenterOrder.length === 0) {
    state.capCenterOrder = defaultCenterOrder(state.capPools ?? []);
  }
  if (state.capCenterGlCodes == null) {
    state.capCenterGlCodes = { ...CAP_CENTER_GLCODES };
  }
  // Backfill centerGlCode on every persisted pool by reading from the
  // (just-backfilled) capCenterGlCodes name map. Pools whose center has
  // no imported glCode keep centerGlCode undefined; the engine will
  // continue to synthesize seed:center:NAME for those once it starts
  // reading the field (later PR). Only patches pools missing the field —
  // re-imports + manual edits keep their existing value.
  if (Array.isArray(state.capPools)) {
    const glByName = state.capCenterGlCodes;
    state.capPools = state.capPools.map((p) => {
      if (p.centerGlCode) return p;
      const glCode = glByName[p.center];
      return glCode ? { ...p, centerGlCode: glCode } : p;
    });
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

  // Backfill seed imports if the persisted store has an empty log. The
  // Annual Update tab needs at least one import to render the Refresh
  // cards / Change queue / Packet narrative; new users get these from
  // initialState(), but earlier sessions stored [].
  if (!state.imports || state.imports.length === 0) {
    state.imports = IMPORTS.map((e) => ({
      ...e, result: { ...e.result, warnings: [...e.result.warnings] },
    }));
  }

  // Backfill for state persisted before SourceTag standardization. Older
  // OperatingLine rows carried a free-form GL string in `source`; coerce
  // anything outside the SourceTag union to "seed".
  if (!state.capCenterSources) {
    state.capCenterSources = Object.fromEntries(
      Object.keys(state.capCenterTotals ?? {}).map((name) => [
        name, { source: "seed" as SourceTag },
      ]),
    );
  }
  if (Array.isArray(state.services)) {
    state.services = state.services.map((s: Service) => ({ ...s, source: coerceSource(s.source) }));
  }
  if (Array.isArray(state.positions)) {
    state.positions = state.positions.map((p: Position) => ({ ...p, source: coerceSource(p.source) }));
  }
  if (Array.isArray(state.operating)) {
    state.operating = state.operating.map((o: OperatingLine) => ({ ...o, source: coerceSource(o.source) }));
  }
  if (Array.isArray(state.volume)) {
    state.volume = state.volume.map((w: VolumeRow) => ({ ...w, source: coerceSource(w.source) }));
  }
  // Backfill for state persisted before allocationBases existed. Without
  // this, basisForPool(pool, undefined) crashes the matrix.
  if (!state.allocationBases || state.allocationBases.length === 0) {
    state.allocationBases = SEED_ALLOCATION_BASES.map((b) => ({ ...b }));
  }
  // Backfill capCenterTotals + allocationPercent for state persisted
  // before the % column became editable. Derive totals from Σ amount per
  // center; derive each pool's % from amount/centerTotal.
  if (state.capPools) {
    if (!state.capCenterTotals || Object.keys(state.capCenterTotals).length === 0) {
      const totals: Record<string, number> = {};
      for (const p of state.capPools) {
        totals[p.center] = (totals[p.center] ?? 0) + (p.amount ?? 0);
      }
      state.capCenterTotals = totals;
    }
    const totals = state.capCenterTotals;
    state.capPools = state.capPools.map((p): BuildState["capPools"][number] => {
      if (typeof p.allocationPercent === "number") return p;
      const total = totals[p.center] ?? 0;
      const pct = total > 0 ? (p.amount / total) * 100 : 0;
      return { ...p, allocationPercent: pct };
    });
  }
  if (!Array.isArray(state.versions)) {
    // makeStudyVersion expects a `BuildSnapshot` shape; by this point in
    // the rehydrate we've backfilled every snapshot field, so the cast
    // is safe.
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
