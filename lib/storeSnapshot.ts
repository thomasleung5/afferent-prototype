import type { BuildSnapshot, StudyVersion, StudyVersionStatus } from "./store";

/** Deep-clone any JSON-serialisable value. Snapshot helpers use this so
 *  the captured slice is fully detached from the live store and safe to
 *  freeze inside a `StudyVersion`. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Capture the persisted slice of the store as a `BuildSnapshot`. The
 *  shape mirrors `BuildSnapshot` exactly — fields are listed explicitly so
 *  the snapshot doesn't accidentally pick up transient action references
 *  or fields added to `BuildState` that shouldn't survive a version cut. */
export function createBuildSnapshot(state: BuildSnapshot): BuildSnapshot {
  return cloneJson({
    productiveHours: state.productiveHours,
    operating: state.operating,
    capPools: state.capPools,
    capCenterTotals: state.capCenterTotals,
    capCenterDisallowed: state.capCenterDisallowed,
    capCenterSources: state.capCenterSources,
    studyContext: state.studyContext,
    allocationBases: state.allocationBases,
    capBasisUnits: state.capBasisUnits,
    capDirectAllocations: state.capDirectAllocations,
    directBills: state.directBills,
    volume: state.volume,
    services: state.services,
    serviceRoleAllocations: state.serviceRoleAllocations,
    policyTargets: state.policyTargets,
    policyExceptions: state.policyExceptions,
    lineage: state.lineage,
    pendingReview: state.pendingReview,
    capCenterOrder: state.capCenterOrder,
    imports: state.imports,
    functionalAllocation: state.functionalAllocation,
    activeJurisdictionId: state.activeJurisdictionId,
    activeFeeDepts: state.activeFeeDepts,
    activeFiscalYear: state.activeFiscalYear,
    operatingCategoryMappings: state.operatingCategoryMappings,
    stepDownMethod: state.stepDownMethod,
  });
}

interface MakeVersionInput {
  label?: string;
  status?: StudyVersionStatus;
  notes?: string;
}

/** Build a fresh `StudyVersion` from the current snapshot. Caller passes
 *  the live state (or hydrated state during persistence backfill); the
 *  helper handles version numbering, label fallback, and snapshot capture. */
export function makeStudyVersion(
  state: BuildSnapshot & { versions?: StudyVersion[] },
  input: MakeVersionInput = {},
): StudyVersion {
  const existing = Array.isArray(state.versions) ? state.versions : [];
  const versionNumber = existing.length + 1;
  return {
    id: `version-${Date.now()}-${versionNumber}`,
    versionNumber,
    label: input.label?.trim() || `Version ${versionNumber}`,
    status: input.status ?? "draft",
    createdAt: new Date().toISOString(),
    createdBy: "current user",
    notes: input.notes?.trim() || undefined,
    sourceImportIds: state.imports.map((i) => i.id),
    snapshot: createBuildSnapshot(state),
  };
}
