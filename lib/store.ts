import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { OPERATING } from "@/lib/data/operating";
import { PRODUCTIVE_HOURS } from "@/lib/data/productiveHours";
import {
  CAP_BASIS_UNITS, CAP_CENTER_SOURCES_SEED,
  CAP_CENTER_TOTALS, CAP_DIRECT_ALLOCATIONS, CAP_POOLS,
} from "@/lib/data/cap";
import { SEED_ALLOCATION_BASES } from "@/lib/data/allocationBasesCatalog";
import { FEE_DEPTS } from "@/lib/data/departments";
import { VOLUME } from "@/lib/data/volume";
import { SERVICES } from "@/lib/data/services";
import { POLICY_TARGETS, POLICY_EXCEPTIONS } from "@/lib/data/policy";
import { IMPORTS } from "@/lib/data/imports";
import { FUNCTIONAL_ALLOCATION_SEED } from "@/lib/data/functionalAllocation";
import { mapLegacyActivity } from "@/lib/data/activities";
import type {
  AllocationBasis, BasisUnitRow, CapAllocation, CapPool, DeptCode,
  DirectAllocationRow, FunctionalAllocationBucket, OperatingLine,
  PolicyException, PolicyTarget, Position, ProductiveHoursRow,
  RoleAllocation, Service, SourceTag, VolumeRow,
} from "@/lib/types";
import {
  deptLabor, deptOperating, deptFBHR, feeComparisons, policyImpact, serviceCosts,
  type DeptLabor, type DeptOperating, type FBHR, type FeeComparison,
  type PolicyImpact, type ServiceCost,
} from "@/lib/calc";
import {
  allocatedHoursByDept, utilizationByDept, type DeptUtilization,
} from "@/lib/capacity";
import { buildReceiverRegistry } from "@/lib/data/capReceiverRegistry";
import {
  buildEngineGraph, capAllocatedFromGl, computeStepDownGl,
  type GlDriverMatrix, type GlStepDownModel,
} from "@/lib/data/capStepDownEngine";
import {
  deriveFunctionalAllocation, applyFunctionalAllocationFbhr,
  type FunctionalAllocationDerived,
} from "@/lib/functionalAllocation";
import {
  DEFAULT_STUDY_CONTEXT, extractStudyContext, type StudyContext,
} from "@/lib/data/studyContext";
import {
  DEFAULT_JURISDICTION_ID, getJurisdiction,
} from "@/lib/data/jurisdictions";
import type { ExtractionResult, ImportApplyResult, SourceLineage, UnmappedRow } from "@/lib/parse";
import { newServiceId } from "@/lib/ai/serviceId";
import { mergeImportedServices } from "@/lib/import/mergeImportedServices";
import { createBuildSnapshot, makeStudyVersion } from "./storeSnapshot";
import { migratePersistedState } from "./storeMigration";

export { createBuildSnapshot } from "./storeSnapshot";

/* ── Re-exported types ── */

export type Domain =
  | "positions" | "operating" | "services"
  | "fees" | "volume" | "cap";

export interface BuildImportLog {
  id: number;
  domain: Domain;
  result: ImportApplyResult;
  at: string;
}

export type StudyVersionStatus = "draft" | "review" | "published" | "adopted" | "archived";

export interface BuildSnapshot {
  /** Per-role productive-hours slice. Carries FTE × hrs-per-FTE inputs
   *  for the FBHR denominator. Salary/benefits live as
   *  `costType: "Labor"` rows in the operating dataset; this slice
   *  carries the hours side only. */
  productiveHours: ProductiveHoursRow[];
  operating: OperatingLine[];
  capPools: CapPool[];
  /** Center totals, keyed by center identity (glCode for imported
   *  centers, `seed:center:NAME` synth for manually-added centers). */
  capCenterTotals: Record<string, number>;
  capCenterDisallowed: Record<string, number>;
  /** Center metadata keyed by center identity. `name` is the display
   *  text, mutated by renameCapCenter (no longer requires walking every
   *  map since the key is now stable). */
  capCenterSources: Record<string, { name: string; source: SourceTag; sourceFile?: string }>;
  studyContext: StudyContext;
  allocationBases: AllocationBasis[];
  capBasisUnits: BasisUnitRow[];
  capDirectAllocations: DirectAllocationRow[];
  /** Per-pool per-receiver direct-bill carve-outs (dollars). When set, the
   *  step-down engine subtracts the amount from that receiver's gross
   *  first-round share before propagating Phase 2. Sparse — missing pools
   *  / missing receivers default to zero. Cleared (key deleted) when the
   *  user blanks or zeros the cell. */
  directBills: Record<string, Record<string, number>>;
  volume: VolumeRow[];
  services: Service[];
  /** Per-service role allocation overrides, keyed by service.id. Each entry
   *  is the full allocation array (productiveHours position id + pct).
   *  Sparse — services NOT in this map use `defaultRoleAllocationsForService`
   *  at read time, derived from same-dept productiveHours rows. The override
   *  pattern keeps the persisted slice minimal (only edited allocations get
   *  stored) and lets the default re-derive automatically when the position
   *  roster changes. */
  serviceRoleAllocations: Record<string, RoleAllocation[]>;
  policyTargets: PolicyTarget[];
  policyExceptions: PolicyException[];
  lineage: Record<string, SourceLineage>;
  pendingReview: Record<Domain, UnmappedRow[]>;
  capCenterOrder: string[];
  imports: BuildImportLog[];
  /** Functional Allocation buckets — operational classifications of
   *  departmental fully burdened cost into fee-recoverable vs.
   *  non-recoverable work. Persisted as raw row data; recoverable cost,
   *  hours, and recoverable FBHR are derived per-render. The recoverable
   *  FBHR always replaces the engine FBHR downstream when computable
   *  (see deriveBuildDerived → applyFunctionalAllocationFbhr). */
  functionalAllocation: FunctionalAllocationBucket[];
  activeJurisdictionId: string;
  /** Study-specific subset of the canonical department registry that is
   *  currently modeled as fee-bearing. The canonical registry can include
   *  Clerk, Finance, HR, etc.; this list controls which departments appear
   *  in fee-model tabs for the active seed/study. */
  activeFeeDepts: DeptCode[];
  activeFiscalYear: string;
}

export interface StudyVersion {
  id: string;
  versionNumber: number;
  label: string;
  status: StudyVersionStatus;
  createdAt: string;
  createdBy: string;
  notes?: string;
  sourceImportIds: number[];
  snapshot: BuildSnapshot;
}

/* ── State & action interfaces ── */

export interface BuildState {
  /** Per-role productive-hours rows. See BuildSnapshot.productiveHours. */
  productiveHours: ProductiveHoursRow[];
  operating: OperatingLine[];
  capPools: CapPool[];
  /** Source-department cost per cost center — the 100% reference for each
   *  pool's allocationPercent. Keyed by center identity (glCode or
   *  `seed:center:NAME` synth). Editing a center total rescales all
   *  member pool amounts proportionally. */
  capCenterTotals: Record<string, number>;
  /** Center key → disallowed expenses (capital outlay, one-time spend,
   *  pass-through, grant-funded non-fee items, etc.) excluded before
   *  allocation. Net Allocable = Total − Disallowed; the engine reads
   *  pool.amount (derived from net), so all downstream math reflects this
   *  reduction automatically. Default 0 per center; preserved separately
   *  from capCenterTotals so the gross/net trail is auditable. */
  capCenterDisallowed: Record<string, number>;
  /** Center key → metadata: display name + provenance. `name` is the
   *  human-readable label (mutated by renameCapCenter); identity is
   *  stable since the key doesn't change on rename. */
  capCenterSources: Record<string, { name: string; source: SourceTag; sourceFile?: string }>;
  /** Scoping prefix on every receiver / center identity key. Populated by
   *  mergeCapBundle from the imported file name; sentinel default when no
   *  CAP has been imported. */
  studyContext: StudyContext;
  /** Study-scoped catalog of named allocation bases. Seeded with canonical
   *  entries; users can extend at runtime via AllocationBasisCombobox. */
  allocationBases: AllocationBasis[];
  /** Per-basis allocation schedules — receiver glCodes + units. The
   *  step-down engine derives each pool's per-receiver percent on the
   *  fly as `units / Σ units` across the basis. One schedule serves
   *  every pool whose `basisId` points at the basis. */
  capBasisUnits: BasisUnitRow[];
  /** Per-DIRECT-pool explicit allocations. DIRECT pools skip the
   *  basis-driven split and route to the receivers listed here. */
  capDirectAllocations: DirectAllocationRow[];
  /** Per-pool per-receiver direct-bill carve-outs (dollars). When set, the
   *  step-down engine subtracts the amount from that receiver's gross
   *  first-round share before propagating Phase 2. Sparse — missing pools
   *  / missing receivers default to zero. Cleared (key deleted) when the
   *  user blanks or zeros the cell. */
  directBills: Record<string, Record<string, number>>;
  volume: VolumeRow[];
  services: Service[];
  /** See BuildSnapshot.serviceRoleAllocations. */
  serviceRoleAllocations: Record<string, RoleAllocation[]>;
  policyTargets: PolicyTarget[];
  policyExceptions: PolicyException[];
  lineage: Record<string, SourceLineage>;
  pendingReview: Record<Domain, UnmappedRow[]>;
  capCenterOrder: string[];
  imports: BuildImportLog[];
  /** See BuildSnapshot.functionalAllocation. */
  functionalAllocation: FunctionalAllocationBucket[];
  versions: StudyVersion[];
  comparisonVersionId: string | null;
  /** Active demo jurisdiction the UI is bound to. Read via
   *  useActiveJurisdiction(); switched via setActiveJurisdiction. Defaults
   *  to "los-altos-hills" — the only jurisdiction with full seed data
   *  today. Placeholder jurisdictions in lib/data/jurisdictions can be
   *  selected from the TopBar dropdown but render an empty / coming-
   *  soon state until seed data is added.
   *
   *  Not currently used as a data-namespace key inside this store — the
   *  prototype keeps a flat data layout because only one jurisdiction
   *  has data. When a second jurisdiction comes online we'll need to
   *  shard the data slices by activeJurisdictionId × activeFiscalYear,
   *  which the active-context layer is set up to enable. */
  activeJurisdictionId: string;
  activeFeeDepts: DeptCode[];
  activeFiscalYear: string;
}

interface BuildActions {
  /** Edit a productive-hours row (title, dept, FTE, hours, breakdown). */
  updateProductiveHours: (id: string, patch: Partial<ProductiveHoursRow>) => void;
  addProductiveHours: () => void;
  removeProductiveHours: (id: string) => void;
  updateOperating: (id: string, patch: Partial<OperatingLine>) => void;
  updateVolume: (id: string, patch: Partial<VolumeRow>) => void;
  updateService: (id: string, patch: Partial<Service>) => void;
  updatePolicyTarget: (id: string, patch: Partial<PolicyTarget>) => void;
  updatePolicyException: (id: string, patch: Partial<PolicyException>) => void;
  addPolicyException: () => void;
  removePolicyException: (id: string) => void;
  addService: () => void;
  /** Replace the full role-allocation array for one service. Pass an empty
   *  array (or undefined-equivalent) to clear the override and revert to
   *  the default-derived allocation at read time. */
  setServiceRoleAllocations: (serviceId: string, allocations: RoleAllocation[]) => void;
  /** Append a new operating row. costType defaults to "Operating"; the
   *  Labor page passes "Labor" so newly-added rows surface in its
   *  filtered view rather than the Operating page's. */
  addOperatingLine: (costType?: "Labor" | "Operating") => void;
  /** Add a pool to an existing center. `centerKey` is the center's identity
   *  (glCode or `seed:center:NAME` synth); the new pool inherits the
   *  center's display name + glCode from capCenterSources. */
  addCapPool: (centerKey: string) => void;
  addCapCenter: () => void;
  updateCapPool: (id: string, patch: Partial<CapPool>) => void;
  /** Rename a center — mutates only the display name in capCenterSources
   *  and every pool's denormalized `center` text. The center's identity
   *  key stays stable, so totals/disallowed/order need no rekeying. */
  renameCapCenter: (centerKey: string, newName: string) => void;
  /** Set the direct-bill carve-out for one (pool, receiver) cell. amount
   *  is clamped to ≥ 0; the caller is responsible for the upper bound
   *  (Gross) since only the UI knows it. Passing 0 (or NaN) clears the
   *  entry — display reverts to "—" and the engine treats it as absent. */
  setDirectBill: (poolId: string, nodeKey: string, amount: number) => void;
  /** Set a cost center's source-department total cost. Rescales every pool
   *  in that center: pool.amount = totalCost × pool.allocationPercent / 100. */
  updateCenterTotal: (centerKey: string, totalCost: number) => void;
  /** Set a cost center's disallowed expenses. Clamped to [0, Total]; rescales
   *  all pools in the center by net = Total − Disallowed. */
  updateCenterDisallowed: (centerKey: string, disallowed: number) => void;
  /** Append a user-defined allocation basis to the catalog. Returns the new id. */
  addAllocationBasis: (input: { name: string; source: string; methodologyNote?: string }) => string;
  mergePositions: (r: ExtractionResult<Position>, fileName: string) => ImportApplyResult;
  mergeOperating: (r: ExtractionResult<OperatingLine>, fileName: string) => ImportApplyResult;
  mergeServices: (r: ExtractionResult<Service>, fileName: string) => ImportApplyResult;
  mergeFeeSchedule: (r: ExtractionResult<Service>, fileName: string) => ImportApplyResult;
  mergeVolume: (r: ExtractionResult<VolumeRow>, fileName: string) => ImportApplyResult;
  /** Promote an unmapped volume review row into a brand-new Service +
   *  VolumeRow pair. Used by the Source Data volume review panel when
   *  no existing service matches the imported row. Reuses
   *  `newServiceId(dept, name)` so re-imports of the same source row
   *  converge on the same id. Returns the new service id, or null if
   *  name/dept couldn't be reconstructed from the lineage (e.g.
   *  ambiguous-dept rows). */
  createServiceFromUnmappedVolume: (u: UnmappedRow) => string | null;
  /** Attach an unmapped volume review row to an existing service.
   *  Used when the volume row was unmatched because the service was
   *  recorded under a different name in the catalog. The new VolumeRow
   *  reuses the existing service's id. */
  mapUnmappedVolumeToService: (u: UnmappedRow, serviceId: string) => void;
  /** Bulk-import a CAP bundle covering centers, bases, basisUnits, pools,
   *  and directAllocations. Centers upsert into capCenterTotals by name;
   *  bases upsert into allocationBases by name (existing entries keep
   *  their id); pools merge through mergeRows by id; basisUnits and
   *  directAllocations upsert by basisId / poolId. Returns one combined
   *  ImportApplyResult so the UI can read the per-section counts off
   *  `mapped`. */
  mergeCapBundle: (
    r: {
      centers: ExtractionResult<{ name: string; glCode?: string; totalCost: number }>;
      bases: ExtractionResult<AllocationBasis>;
      basisUnits: ExtractionResult<BasisUnitRow>;
      pools: ExtractionResult<CapPool>;
      directAllocations: ExtractionResult<DirectAllocationRow>;
    },
    fileName: string,
  ) => ImportApplyResult & {
    centersImported: number;
    basesImported: number;
    basisUnitsImported: number;
    poolsImported: number;
    directAllocationsImported: number;
    /** Rows surfaced for human review (e.g. bases with driverKey "OTHER"
     *  or any other unresolvable schema mismatch). Already routed into
     *  pendingReview.cap; returned here so the page UI can show them
     *  inline without re-reading state. */
    unmappedBases: UnmappedRow[];
  };
  moveCenter: (name: string, direction: "up" | "down") => void;
  setCapCenterOrder: (order: string[]) => void;
  /** Set the active demo jurisdiction. Also resets activeFiscalYear to
   *  the target jurisdiction's defaultFiscalYear so a switch always
   *  lands on a valid fiscal year. */
  setActiveJurisdiction: (id: string) => void;
  /** Set the active fiscal year. Caller is responsible for passing a
   *  value that belongs to the current jurisdiction's fiscalYears. */
  setActiveFiscalYear: (fy: string) => void;
  /** Replace the active study's fee-department subset. This scopes
   *  department dropdowns and rollups without changing the canonical
   *  registry. */
  setActiveFeeDepts: (depts: DeptCode[]) => void;
  createVersion: (input?: { label?: string; status?: StudyVersionStatus; notes?: string }) => StudyVersion;
  setComparisonVersion: (id: string | null) => void;
  /** Edit one Functional Allocation bucket (name, description,
   *  recoverabilityPct, hoursSharePct, notes). The dept is intentionally
   *  not patchable — moving a bucket to another dept would silently
   *  rebalance recoverable hours / cost away from the original dept's
   *  derived FBHR, which is almost always a destructive surprise. */
  updateFunctionalAllocation: (id: string, patch: Partial<FunctionalAllocationBucket>) => void;
  addFunctionalAllocation: (dept: DeptCode) => void;
  resetAll: () => void;
  clearAll: () => void;
  /** Replace every BuildSnapshot field with the supplied snapshot.
   *  Versions, comparisonVersionId, and actions are left untouched.
   *  Used by the snapshot JSON import flow (`lib/snapshotIO.ts`) and
   *  eventually by the server-persistence migration path. */
  loadSnapshot: (snapshot: BuildSnapshot) => void;
}

/* ── Helpers ── */

const emptyPending: Record<Domain, UnmappedRow[]> = {
  positions: [], operating: [], services: [], fees: [], volume: [], cap: [],
};

function feeDeptsFromServices(services: Service[]): DeptCode[] {
  return FEE_DEPTS.filter((dept) => services.some((s) => s.dept === dept));
}

function mergeActiveFeeDeptsFromServices(current: DeptCode[], services: Service[]): DeptCode[] {
  const detected = feeDeptsFromServices(services);
  if (detected.length === 0) return current;
  const active = new Set(current);
  for (const dept of detected) active.add(dept);
  return FEE_DEPTS.filter((dept) => active.has(dept));
}

function activeFeeDeptsForSnapshot(snapshot: BuildSnapshot): DeptCode[] {
  return Array.isArray(snapshot.activeFeeDepts) && snapshot.activeFeeDepts.length > 0
    ? snapshot.activeFeeDepts
    : feeDeptsFromServices(snapshot.services);
}

/** Default step-down order — a list of center identity keys (glCodes
 *  or `seed:center:NAME` synth) sorted by total $ descending, then by
 *  key ascending for determinism. The display name is resolved at the
 *  use site via capCenterSources[key].name. */
export function defaultCenterOrder(pools: CapPool[]): string[] {
  const totals = new Map<string, number>();
  for (const p of pools) {
    const key = p.centerGlCode;
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + p.amount);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

/** Stable synth identity key for a center with no imported glCode.
 *  Engine treats `seed:center:*` keys as nodes just like real glCodes.
 *  Exported so storeMigration + addCapCenter can share one canonical
 *  format. */
function synthCenterKey(name: string): string {
  return `seed:center:${name}`;
}

const initialState = (): BuildState => {
  const pools = CAP_POOLS.map((p) => ({ ...p }));
  const state: BuildSnapshot = {
    productiveHours: PRODUCTIVE_HOURS.map((p) => ({ ...p })),
    operating: OPERATING.map((o) => ({ ...o })),
    capPools: pools,
    capCenterTotals: { ...CAP_CENTER_TOTALS },
    capCenterDisallowed: {},
    capCenterSources: Object.fromEntries(
      Object.entries(CAP_CENTER_SOURCES_SEED).map(([key, meta]) => [
        key, { name: meta.name, source: "seed" as SourceTag },
      ]),
    ),
    studyContext: { ...DEFAULT_STUDY_CONTEXT },
    allocationBases: SEED_ALLOCATION_BASES.map((b) => ({ ...b })),
    capBasisUnits: CAP_BASIS_UNITS.map((bu) => ({
      ...bu, receivers: bu.receivers.map((r) => ({ ...r })),
    })),
    capDirectAllocations: CAP_DIRECT_ALLOCATIONS.map((da) => ({
      ...da, receivers: da.receivers.map((r) => ({ ...r })),
    })),
    directBills: {},
    volume: VOLUME.map((w) => ({ ...w })),
    services: SERVICES.map((s) => ({ ...s })),
    // Sparse by design — populated lazily via setServiceRoleAllocations
    // when the user edits a service's mix. Reads fall back to
    // defaultRoleAllocationsForService when a service has no entry here.
    serviceRoleAllocations: {},
    policyTargets: POLICY_TARGETS.map((p) => ({ ...p })),
    policyExceptions: POLICY_EXCEPTIONS.map((e) => ({ ...e })),
    lineage: {},
    pendingReview: { ...emptyPending },
    // Preserve the bundle's published step-down sequence rather than
    // re-sorting by total $. Object.keys returns insertion order, and
    // CAP_CENTER_TOTALS is written in cap.ts in the bundle's published
    // order — same behavior as mergeCapBundle's import path (pushes
    // centers in source order). defaultCenterOrder remains the fallback
    // for state that arrives without an explicit order (post-rehydration
    // backfill in storeMigration).
    capCenterOrder: Object.keys(CAP_CENTER_TOTALS),
    imports: IMPORTS.map((e) => ({ ...e, result: { ...e.result, warnings: [...e.result.warnings] } })),
    functionalAllocation: FUNCTIONAL_ALLOCATION_SEED.map((b) => ({ ...b })),
    activeJurisdictionId: DEFAULT_JURISDICTION_ID,
    activeFeeDepts: feeDeptsFromServices(SERVICES),
    activeFiscalYear:
      getJurisdiction(DEFAULT_JURISDICTION_ID)?.defaultFiscalYear ?? "FY 2025-26",
  };
  const seedVersion: StudyVersion = {
    id: "version-seed-baseline",
    versionNumber: 1,
    label: "Seed baseline",
    status: "adopted",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "system",
    notes: "Initial model snapshot for variance explanations.",
    sourceImportIds: state.imports.map((i) => i.id),
    snapshot: createBuildSnapshot(state),
  };
  return {
    ...state,
    versions: [seedVersion],
    comparisonVersionId: seedVersion.id,
  };
};

function mergeRows<T extends { id: string }>(
  existing: T[],
  result: ExtractionResult<T>,
): { merged: T[]; lineagePatch: Record<string, SourceLineage> } {
  const lineagePatch: Record<string, SourceLineage> = {};
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const { entity, lineage } of result.duplicates) {
    byId.set(entity.id, { ...byId.get(entity.id)!, ...entity });
    lineagePatch[entity.id] = lineage;
  }
  for (const { entity, lineage } of [...result.mapped, ...result.lowConfidence]) {
    if (byId.has(entity.id)) {
      byId.set(entity.id, { ...byId.get(entity.id)!, ...entity });
    } else {
      byId.set(entity.id, entity);
    }
    lineagePatch[entity.id] = lineage;
  }
  return { merged: [...byId.values()], lineagePatch };
}

function toApplyResult<T>(
  domain: Domain, fileName: string, r: ExtractionResult<T>, warnings: string[] = [],
): ImportApplyResult {
  return {
    domain, fileName,
    detected: r.stats.detected,
    rows: r.stats.total,
    mapped: r.stats.mapped,
    lowConfidence: r.stats.lowConfidence,
    unmapped: r.stats.unmapped,
    duplicates: r.stats.duplicates,
    warnings,
  };
}

/* ── Zustand store ── */

const STORAGE_KEY = "afferent.build.v1";

/** Dedupes the dev-mode CAP diagnostic console.warn so each (poolId, kind)
 *  fires once per session, even though deriveAll runs on every state slice. */
const loggedCapDiagnostics = new Set<string>();

export const useBuildStore = create<BuildState & BuildActions>()(
  persist(
    (set) => ({
      ...initialState(),

      updateProductiveHours: (id, patch) =>
        set((s) => ({
          productiveHours: s.productiveHours.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        })),

      addProductiveHours: () =>
        set((s) => ({
          productiveHours: [
            ...s.productiveHours,
            { id: `ph-${Date.now()}`, title: "New role", dept: "PLAN",
              fte: 1, hours: 1720, source: "manual" },
          ],
        })),

      removeProductiveHours: (id) =>
        set((s) => ({
          productiveHours: s.productiveHours.filter((r) => r.id !== id),
        })),

      updateOperating: (id, patch) =>
        set((s) => ({ operating: s.operating.map((o) => o.id === id ? { ...o, ...patch } : o) })),

      updateVolume: (id, patch) =>
        set((s) => ({ volume: s.volume.map((w) => w.id === id ? { ...w, ...patch } : w) })),

      updateService: (id, patch) =>
        set((s) => ({ services: s.services.map((sv) => sv.id === id ? { ...sv, ...patch } : sv) })),

      updatePolicyTarget: (id, patch) =>
        set((s) => ({ policyTargets: s.policyTargets.map((t) => t.id === id ? { ...t, ...patch } : t) })),

      updatePolicyException: (id, patch) =>
        set((s) => ({ policyExceptions: s.policyExceptions.map((e) => e.id === id ? { ...e, ...patch } : e) })),

      addPolicyException: () =>
        set((s) => {
          // Default to the first available service so the exception is
          // already id-bound. If there are zero services (a brand-new
          // empty study, or seed-only-empty), fall back to the legacy
          // free-form placeholder — the dropdown row will surface it as
          // "(unlinked)" and the user can pick a real service later.
          const seed = s.services[0];
          const entry: PolicyException = seed
            ? { id: `exc-${Date.now()}`, serviceId: seed.id, fee: seed.name, target: 50, note: "" }
            : { id: `exc-${Date.now()}`, fee: "New fee exception", target: 50, note: "" };
          return { policyExceptions: [...s.policyExceptions, entry] };
        }),

      removePolicyException: (id) =>
        set((s) => ({ policyExceptions: s.policyExceptions.filter((e) => e.id !== id) })),

      addService: () =>
        set((s) => ({
          services: [
            ...s.services,
            { id: `svc-${Date.now()}`, name: "New service", dept: "PLAN",
              volume: 0, hours: 0, cost: 0, fee: 0, peer: 0, target: 100,
              source: "manual" },
          ],
        })),

      setServiceRoleAllocations: (serviceId, allocations) =>
        set((s) => {
          const next = { ...s.serviceRoleAllocations };
          if (allocations.length === 0) delete next[serviceId];
          else next[serviceId] = allocations;
          return { serviceRoleAllocations: next };
        }),


      addOperatingLine: (costType = "Operating") =>
        set((s) => ({
          operating: [
            ...s.operating,
            { id: `op-${Date.now()}`, code: "—", dept: "PLAN", category: "Other",
              costType,
              line: costType === "Labor" ? "New labor line" : "New line item",
              amount: 0, source: "manual", include: true },
          ],
        })),

      addCapPool: (centerKey) =>
        set((s) => {
          const meta = s.capCenterSources[centerKey];
          const centerName = meta?.name ?? centerKey;
          return {
            capPools: [
              ...s.capPools,
              { id: `cap-${Date.now()}`, center: centerName, centerGlCode: centerKey,
                pool: "New pool",
                allocationPercent: 0, amount: 0,
                basisId: "", basis: "", receiving: "All depts", recoverability: "TBD", review: "Review" },
            ],
          };
        }),

      addCapCenter: () =>
        set((s) => {
          const name = "New Cost Center";
          // Synth a stable identity key for a manually-added center.
          // Date-suffixed so repeated "Add" clicks produce distinct
          // centers instead of collapsing onto the first one.
          const key = `seed:center:new-${Date.now()}`;
          return {
            capPools: [
              ...s.capPools,
              { id: `cap-${Date.now()}`, center: name, centerGlCode: key,
                pool: "New pool",
                allocationPercent: 100, amount: 0,
                basisId: "", basis: "", receiving: "All depts", recoverability: "TBD", review: "Review" },
            ],
            capCenterTotals: { ...s.capCenterTotals, [key]: 0 },
            capCenterSources: { ...s.capCenterSources, [key]: { name, source: "manual" } },
            capCenterOrder: [...s.capCenterOrder, key],
          };
        }),

      // Keep allocationPercent and amount in sync. Pool $ is derived from
      // the center's NET ALLOCABLE balance (Total Expenses − Disallowed),
      // not the gross total — every downstream consumer (engine, KPI rail,
      // exports) reads pool.amount, so the net reduction propagates
      // automatically.
      updateCapPool: (id, patch) =>
        set((s) => {
          const target = s.capPools.find((p) => p.id === id);
          if (!target) return s;
          const targetKey = target.centerGlCode;
          const centerTotal = s.capCenterTotals[targetKey] ?? 0;
          const centerDisallowed = s.capCenterDisallowed[targetKey] ?? 0;
          const centerNet = Math.max(0, centerTotal - centerDisallowed);

          let nextPools = s.capPools.map((p) => {
            if (p.id !== id) return p;
            let next = { ...p, ...patch };
            if (patch.allocationPercent != null && patch.amount == null) {
              // % drives $ — relative to net allocable, not gross.
              next.amount = centerNet * (next.allocationPercent / 100);
            } else if (patch.amount != null && patch.allocationPercent == null && centerNet > 0) {
              // $ drives % when we have a reference net total. When net is
              // 0/missing, defer to the rebuild below.
              next.allocationPercent = (next.amount / centerNet) * 100;
            }
            return next;
          });

          let nextTotals = s.capCenterTotals;
          if (patch.amount != null && centerNet === 0) {
            // No reference net yet — let the new $ value redefine the
            // center's NET, then back-fill Total Expenses = Net + Disallowed
            // so the gross figure stays consistent.
            const derivedNet = nextPools
              .filter((p) => p.centerGlCode === targetKey)
              .reduce((a, p) => a + p.amount, 0);
            if (derivedNet > 0) {
              const newTotal = derivedNet + centerDisallowed;
              nextTotals = { ...s.capCenterTotals, [targetKey]: newTotal };
              nextPools = nextPools.map((p) =>
                p.centerGlCode === targetKey
                  ? { ...p, allocationPercent: (p.amount / derivedNet) * 100 }
                  : p,
              );
            }
          }

          return { capPools: nextPools, capCenterTotals: nextTotals };
        }),

      renameCapCenter: (centerKey, newName) =>
        set((s) => {
          const meta = s.capCenterSources[centerKey];
          if (!meta || meta.name === newName) return s;
          return {
            capPools: s.capPools.map((p) =>
              p.centerGlCode === centerKey ? { ...p, center: newName } : p,
            ),
            capCenterSources: {
              ...s.capCenterSources,
              [centerKey]: { ...meta, name: newName },
            },
          };
        }),

      updateCenterTotal: (centerKey, totalCost) =>
        set((s) => {
          const newTotal = Math.max(0, totalCost);
          const disallowed = s.capCenterDisallowed[centerKey] ?? 0;
          const net = Math.max(0, newTotal - disallowed);
          return {
            capCenterTotals: { ...s.capCenterTotals, [centerKey]: newTotal },
            capPools: s.capPools.map((p) =>
              p.centerGlCode === centerKey
                ? { ...p, amount: net * (p.allocationPercent / 100) }
                : p,
            ),
          };
        }),

      setDirectBill: (poolId, nodeKey, amount) =>
        set((s) => {
          const next = { ...s.directBills };
          const poolRow = { ...(next[poolId] ?? {}) };
          // Zero / NaN / negative → clear the entry so the engine sees it as
          // absent and the UI reverts to "—". Upper-bound clamping lives in
          // the UI (CellInput's `max` prop) since only the UI knows Gross.
          if (!Number.isFinite(amount) || amount <= 0) {
            delete poolRow[nodeKey];
          } else {
            poolRow[nodeKey] = amount;
          }
          if (Object.keys(poolRow).length === 0) {
            delete next[poolId];
          } else {
            next[poolId] = poolRow;
          }
          return { directBills: next };
        }),

      updateCenterDisallowed: (centerKey, disallowed) =>
        set((s) => {
          const total = s.capCenterTotals[centerKey] ?? 0;
          // Clamp to [0, Total] so Net Allocable can never be negative.
          const clamped = Math.max(0, Math.min(disallowed, total));
          const net = Math.max(0, total - clamped);
          return {
            capCenterDisallowed: { ...s.capCenterDisallowed, [centerKey]: clamped },
            capPools: s.capPools.map((p) =>
              p.centerGlCode === centerKey
                ? { ...p, amount: net * (p.allocationPercent / 100) }
                : p,
            ),
          };
        }),

      addAllocationBasis: ({ name, source, methodologyNote }) => {
        const id = `bas-user-${Date.now()}`;
        set((s) => ({
          allocationBases: [
            ...s.allocationBases,
            {
              id,
              name: name.trim(),
              source: source.trim(),
              methodologyNote: methodologyNote?.trim() || undefined,
              validationStatus: "draft",
              createdBy: "current user",
              createdAt: new Date().toISOString(),
              // Default to EXPEND (Operating expenditures) — the most common
              // denominator. The combobox create form doesn't yet expose
              // driverKey; users wanting a different driver can edit it
              // (or pick an existing catalog entry instead).
              driverKey: "EXPEND",
            },
          ],
        }));
        return id;
      },

      mergePositions: (r, fileName) => {
        const result = toApplyResult("positions", fileName, r);
        set((s) => {
          // Each imported Position upserts into productiveHours (id mirrors
          // the import) so the role roster stays in sync. Labor-classified
          // operating rows (the Labor page's "Labor Line Items" table) are
          // NOT touched here — they're authoritatively owned by the
          // Operating Budget import via mergeOperating's costType
          // classifier. A staffing import that touches PLAN no longer
          // overwrites whatever PLAN labor rows the budget import wrote.
          const incoming = [...r.mapped, ...r.lowConfidence, ...r.duplicates];
          const lineagePatch: Record<string, SourceLineage> = {};
          const phById = new Map(s.productiveHours.map((row) => [row.id, row]));

          for (const { entity, lineage } of incoming) {
            const phRow: ProductiveHoursRow = {
              id: entity.id,
              title: entity.title,
              dept: entity.dept,
              fte: entity.fte,
              hours: entity.hours,
              ...(entity.productiveHoursBreakdown
                ? { productiveHoursBreakdown: entity.productiveHoursBreakdown }
                : {}),
              source: entity.source,
              ...(entity.sourceFile ? { sourceFile: entity.sourceFile } : {}),
            };
            phById.set(entity.id, phRow);
            lineagePatch[entity.id] = lineage;
          }

          return {
            productiveHours: [...phById.values()],
            lineage: { ...s.lineage, ...lineagePatch },
            pendingReview: { ...s.pendingReview, positions: [...s.pendingReview.positions, ...r.unmapped] },
            imports: [...s.imports, { id: Date.now(), domain: "positions", result, at: new Date().toISOString() }],
          };
        });
        return result;
      },

      mergeOperating: (r, fileName) => {
        const result = toApplyResult("operating", fileName, r);
        set((s) => {
          const { merged, lineagePatch } = mergeRows(s.operating, r);
          return {
            operating: merged,
            lineage: { ...s.lineage, ...lineagePatch },
            pendingReview: { ...s.pendingReview, operating: [...s.pendingReview.operating, ...r.unmapped] },
            imports: [...s.imports, { id: Date.now(), domain: "operating", result, at: new Date().toISOString() }],
          };
        });
        return result;
      },

      mergeServices: (r, fileName) => {
        const result = toApplyResult("services", fileName, r);
        set((s) => {
          const { services, volume, lineagePatch } =
            mergeImportedServices(s.services, s.volume, r);
          return {
            services,
            volume,
            activeFeeDepts: mergeActiveFeeDeptsFromServices(s.activeFeeDepts, services),
            lineage: { ...s.lineage, ...lineagePatch },
            pendingReview: { ...s.pendingReview, services: [...s.pendingReview.services, ...r.unmapped] },
            imports: [...s.imports, { id: Date.now(), domain: "services", result, at: new Date().toISOString() }],
          };
        });
        return result;
      },

      mergeFeeSchedule: (r, fileName) => {
        const result = toApplyResult("fees", fileName, r);
        set((s) => {
          const { services, volume, lineagePatch } =
            mergeImportedServices(s.services, s.volume, r);
          return {
            services,
            volume,
            activeFeeDepts: mergeActiveFeeDeptsFromServices(s.activeFeeDepts, services),
            lineage: { ...s.lineage, ...lineagePatch },
            pendingReview: { ...s.pendingReview, fees: [...s.pendingReview.fees, ...r.unmapped] },
            imports: [...s.imports, { id: Date.now(), domain: "fees", result, at: new Date().toISOString() }],
          };
        });
        return result;
      },

      createServiceFromUnmappedVolume: (u) => {
        const cells = u.lineage.rawCells ?? {};
        const name = typeof cells.name === "string" ? cells.name.trim() : "";
        const deptRaw = typeof cells.dept === "string" ? cells.dept.trim().toUpperCase() : "";
        const dept = (FEE_DEPTS as readonly string[]).includes(deptRaw)
          ? (deptRaw as DeptCode)
          : null;
        if (!name || !dept) return null;
        const prior = typeof cells.prior === "number" ? cells.prior : null;
        const current = typeof cells.current === "number" ? cells.current : null;
        // The raw `unit` cell on a volume import describes the activity
        // being counted (e.g., "Permit", "Application") — promote it
        // onto the new Service as activityLabel + activityType via the
        // canonical-catalog mapper.
        const activity = typeof cells.unit === "string"
          ? mapLegacyActivity(cells.unit)
          : undefined;
        const id = newServiceId(dept, name);
        const sourceFile = u.lineage.file;
        const newService: Service = {
          id, name, dept,
          volume: current ?? 0,
          hours: 0,
          cost: 0,
          fee: 0,
          peer: 0,
          target: 100,
          source: "imported",
          sourceFile,
          ...(activity ? { activityLabel: activity.label, activityType: activity.type } : {}),
        };
        const newVolume: VolumeRow = {
          id, prior, current,
          source: "imported",
          status: "Imported",
          sourceFile,
          ...(current == null ? { flag: "missing-current-volume" as const } : {}),
        };
        set((s) => ({
          services: s.services.some((svc) => svc.id === id)
            ? s.services
            : [...s.services, newService],
          volume: [...s.volume.filter((v) => v.id !== id), newVolume],
          lineage: { ...s.lineage, [id]: u.lineage },
        }));
        return id;
      },

      mapUnmappedVolumeToService: (u, serviceId) => {
        const cells = u.lineage.rawCells ?? {};
        const prior = typeof cells.prior === "number" ? cells.prior : null;
        const current = typeof cells.current === "number" ? cells.current : null;
        const sourceFile = u.lineage.file;
        const newVolume: VolumeRow = {
          id: serviceId, prior, current,
          source: "imported",
          status: "Imported",
          sourceFile,
          ...(current == null ? { flag: "missing-current-volume" as const } : {}),
        };
        set((s) => ({
          volume: [...s.volume.filter((v) => v.id !== serviceId), newVolume],
          lineage: { ...s.lineage, [serviceId]: u.lineage },
        }));
      },

      mergeVolume: (r, fileName) => {
        const result = toApplyResult("volume", fileName, r);
        set((s) => {
          const { merged, lineagePatch } = mergeRows(s.volume, r);
          return {
            volume: merged,
            lineage: { ...s.lineage, ...lineagePatch },
            pendingReview: { ...s.pendingReview, volume: [...s.pendingReview.volume, ...r.unmapped] },
            imports: [...s.imports, { id: Date.now(), domain: "volume", result, at: new Date().toISOString() }],
          };
        });
        return result;
      },

      mergeCapBundle: (r, fileName) => {
        const centersIn = [...r.centers.mapped, ...r.centers.lowConfidence];
        const basesIn   = [...r.bases.mapped,   ...r.bases.lowConfidence];
        const basisUnitsIn = [...r.basisUnits.mapped, ...r.basisUnits.lowConfidence];
        const poolsIn   = [...r.pools.mapped,   ...r.pools.lowConfidence];
        const directIn  = [...r.directAllocations.mapped, ...r.directAllocations.lowConfidence];
        const unmappedBases = r.bases.unmapped;

        const totalMapped =
          r.centers.stats.mapped + r.bases.stats.mapped
          + r.basisUnits.stats.mapped + r.pools.stats.mapped
          + r.directAllocations.stats.mapped;
        const totalLow =
          r.centers.stats.lowConfidence + r.bases.stats.lowConfidence
          + r.basisUnits.stats.lowConfidence + r.pools.stats.lowConfidence
          + r.directAllocations.stats.lowConfidence;
        const totalUnmapped =
          r.centers.stats.unmapped + r.bases.stats.unmapped
          + r.basisUnits.stats.unmapped + r.pools.stats.unmapped
          + r.directAllocations.stats.unmapped;
        const totalRows =
          r.centers.stats.total + r.bases.stats.total
          + r.basisUnits.stats.total + r.pools.stats.total
          + r.directAllocations.stats.total;

        const at = new Date().toISOString();
        const result: ImportApplyResult = {
          domain: "cap", fileName,
          detected: "CAP bundle (AI parsed)",
          rows: totalRows,
          mapped: totalMapped,
          lowConfidence: totalLow,
          unmapped: totalUnmapped,
          duplicates: 0,
          warnings: [],
        };

        // Best-effort study context extraction from the file name. Each
        // axis is treated independently: a filename that yields a real
        // fiscal year but no city keeps the existing cityId — so clipboard
        // pastes ("clipboard") and partial filenames don't clobber a
        // previously-imported context.
        const extracted = extractStudyContext(fileName);
        const extractedCity = extracted.cityId !== DEFAULT_STUDY_CONTEXT.cityId
          ? extracted.cityId : null;
        const extractedYear = extracted.fiscalYear !== DEFAULT_STUDY_CONTEXT.fiscalYear
          ? extracted.fiscalYear : null;

        set((s) => {
          // ── 0. Study context ───────────────────────────────────────────
          const mergedContext: StudyContext = {
            cityId: extractedCity ?? s.studyContext.cityId,
            fiscalYear: extractedYear ?? s.studyContext.fiscalYear,
          };

          // ── 1. Centers ─────────────────────────────────────────────────
          // Upsert totals by center identity key (glCode when imported,
          // synth `seed:center:NAME` when not). Build a name → key map
          // so the pool merge below can stamp centerGlCode on each
          // imported pool.
          //
          // Step-down order: start fresh from the import so the
          // sequence mirrors the order centers appear in the parsed
          // source document. Pre-existing centers from prior imports
          // / the seed are preserved as a safety net at the end (see
          // `nextOrder.push(...stale)` below), so a re-import that
          // doesn't re-declare every center doesn't silently drop
          // orphaned pool centers from the engine.
          const nextTotals = { ...s.capCenterTotals };
          const nextOrder: string[] = [];
          const nextCenterSources = { ...s.capCenterSources };
          const importedCenterKeyByName = new Map<string, string>();
          for (const { entity } of centersIn) {
            const key = entity.glCode ?? synthCenterKey(entity.name);
            importedCenterKeyByName.set(entity.name, key);
            nextTotals[key] = entity.totalCost;
            if (!nextOrder.includes(key)) nextOrder.push(key);
            nextCenterSources[key] = { name: entity.name, source: "imported", sourceFile: fileName };
          }
          // Existing-state name → key lookup, used by the pool merge below
          // for pools whose center didn't appear in this bundle's centers
          // section but is already known to the store.
          const existingCenterKeyByName = new Map<string, string>();
          for (const [key, meta] of Object.entries(nextCenterSources)) {
            existingCenterKeyByName.set(meta.name, key);
          }

          // ── 2. Bases ───────────────────────────────────────────────────
          // Match by case-insensitive name. Existing entries keep their id
          // (so pools already referencing them by id don't break); new
          // entries are appended with their fresh AI-generated ids. We also
          // record which AI ids collapsed onto existing ids so pool
          // resolution below can fix up basisId references.
          const nextBases = [...s.allocationBases];
          const byName = new Map(nextBases.map((b) => [b.name.toLowerCase(), b]));
          /** AI-generated id → kept existing id (for pool basisId fixup). */
          const basisIdRemap = new Map<string, string>();
          for (const { entity } of basesIn) {
            const lc = entity.name.toLowerCase();
            const existing = byName.get(lc);
            if (existing) {
              basisIdRemap.set(entity.id, existing.id);
              // Update source/methodologyNote/driverKey from the import,
              // but keep the original id + createdAt for stability.
              const patched: AllocationBasis = {
                ...existing,
                source: entity.source,
                methodologyNote: entity.methodologyNote ?? existing.methodologyNote,
                driverKey: entity.driverKey,
                ...(entity.directTo ? { directTo: entity.directTo } : {}),
              };
              const idx = nextBases.findIndex((b) => b.id === existing.id);
              if (idx >= 0) nextBases[idx] = patched;
              byName.set(lc, patched);
            } else {
              nextBases.push(entity);
              byName.set(lc, entity);
            }
          }

          // ── 3. Pools ───────────────────────────────────────────────────
          // Re-resolve basisId against the post-merge basis catalog so pools
          // that referenced a basis imported in the same bundle (or just
          // matched by name to seed) bind correctly. Also stamp
          // centerGlCode so the engine routes by glCode without consulting
          // any name → glCode map: first from the bundle's own centers
          // section, then from existing state (matched by name), then synth.
          const fixedPools = poolsIn.map(({ entity, lineage }) => {
            let basisId = entity.basisId;
            // Trust an existing basisId only if it survived the remap or
            // already points at a real catalog entry.
            if (basisId && basisIdRemap.has(basisId)) {
              basisId = basisIdRemap.get(basisId)!;
            } else if (!basisId || !nextBases.some((b) => b.id === basisId)) {
              const match = nextBases.find(
                (b) => b.name.toLowerCase() === entity.basis.toLowerCase(),
              );
              basisId = match?.id ?? "";
            }
            const centerGlCode = importedCenterKeyByName.get(entity.center)
              ?? existingCenterKeyByName.get(entity.center)
              ?? synthCenterKey(entity.center);
            // If we synthed here (because the pool's center wasn't
            // declared in the centers section), make sure the maps
            // know about the synth key too.
            if (!(centerGlCode in nextTotals)) nextTotals[centerGlCode] = 0;
            if (!nextOrder.includes(centerGlCode)) nextOrder.push(centerGlCode);
            if (!nextCenterSources[centerGlCode]) {
              nextCenterSources[centerGlCode] = {
                name: entity.center, source: "imported", sourceFile: fileName,
              };
            }
            return {
              entity: { ...entity, basisId, centerGlCode },
              lineage,
            };
          });

          const poolResult: ExtractionResult<CapPool> = {
            ...r.pools,
            mapped: fixedPools.filter((_, i) => i < r.pools.mapped.length),
            lowConfidence: fixedPools.filter((_, i) => i >= r.pools.mapped.length),
          };
          const { merged: mergedPools, lineagePatch: poolLineage } =
            mergeRows(s.capPools, poolResult);

          // ── 4. Center / basis lineage ──────────────────────────────────
          // Centers don't have ids — key lineage on a "cap-center:<name>"
          // synthetic id so the source drilldown can still find it. Bases
          // already have ids; key lineage on the (possibly remapped) id.
          const centerLineage: Record<string, SourceLineage> = {};
          for (const { entity, lineage } of centersIn) {
            centerLineage[`cap-center:${entity.name}`] = lineage;
          }
          const basisLineage: Record<string, SourceLineage> = {};
          for (const { entity, lineage } of basesIn) {
            const id = basisIdRemap.get(entity.id) ?? entity.id;
            basisLineage[id] = lineage;
          }

          // ── 5. Basis units ─────────────────────────────────────────────
          // Re-resolve basisId for each BasisUnitRow against the post-merge
          // catalog. Upsert by basisId so re-importing replaces the
          // schedule wholesale (rather than appending duplicates).
          const fixedBasisUnits = basisUnitsIn.map(({ entity, lineage }) => {
            let basisId = entity.basisId;
            if (basisId && basisIdRemap.has(basisId)) {
              basisId = basisIdRemap.get(basisId)!;
            } else if (!basisId || !nextBases.some((b) => b.id === basisId)) {
              const match = nextBases.find(
                (b) => b.name.toLowerCase() === entity.basis.toLowerCase(),
              );
              basisId = match?.id ?? "";
            }
            return { entity: { ...entity, basisId }, lineage };
          });
          const nextBasisUnits = [...s.capBasisUnits];
          const basisUnitsByBasisId = new Map(nextBasisUnits.map((bu) => [bu.basisId, bu]));
          for (const { entity } of fixedBasisUnits) {
            if (!entity.basisId) continue;
            basisUnitsByBasisId.set(entity.basisId, entity);
          }
          const mergedBasisUnits = [...basisUnitsByBasisId.values()];

          // ── 6. Direct allocations ──────────────────────────────────────
          // Upsert by poolId. Pool ids may have been remapped during the
          // pools merge (mergeRows dedupes by id) — keep direct rows keyed
          // by the (possibly fresh) pool id from the import payload.
          const nextDirect = [...s.capDirectAllocations];
          const directByPoolId = new Map(nextDirect.map((d) => [d.poolId, d]));
          for (const { entity } of directIn) {
            directByPoolId.set(entity.poolId, entity);
          }
          const mergedDirect = [...directByPoolId.values()];

          // Safety-net append: keep any prior-state centers the new
          // import didn't re-declare so their pools don't lose their
          // place in the step-down sequence. Mirrors setCapCenterOrder
          // / moveCenter's "missing-tail" pattern (lines ~1169-1192).
          const inNextOrder = new Set(nextOrder);
          const staleCenters = s.capCenterOrder.filter((k) => !inNextOrder.has(k));
          if (staleCenters.length > 0) nextOrder.push(...staleCenters);

          return {
            capPools: mergedPools,
            capCenterTotals: nextTotals,
            capCenterSources: nextCenterSources,
            capCenterOrder: nextOrder,
            allocationBases: nextBases,
            capBasisUnits: mergedBasisUnits,
            capDirectAllocations: mergedDirect,
            studyContext: mergedContext,
            lineage: { ...s.lineage, ...centerLineage, ...basisLineage, ...poolLineage },
            // Append bundle-level unmapped rows to the existing CAP review
            // queue so the user has a single place to find anything the
            // model couldn't bind (e.g. driverKey "OTHER" bases).
            pendingReview: {
              ...s.pendingReview,
              cap: [
                ...s.pendingReview.cap,
                ...unmappedBases,
                ...r.centers.unmapped,
                ...r.basisUnits.unmapped,
                ...r.pools.unmapped,
                ...r.directAllocations.unmapped,
              ],
            },
            imports: [...s.imports, { id: Date.now(), domain: "cap", result, at }],
          };
        });

        return {
          ...result,
          centersImported: centersIn.length,
          basesImported: basesIn.length,
          basisUnitsImported: basisUnitsIn.length,
          poolsImported: poolsIn.length,
          directAllocationsImported: directIn.length,
          unmappedBases,
        };
      },

      moveCenter: (centerKey, direction) =>
        set((s) => {
          const known = new Set(s.capCenterOrder);
          const missing = [...new Set(s.capPools.map((p) => p.centerGlCode))]
            .filter((k): k is string => !!k && !known.has(k));
          const base = [...s.capCenterOrder, ...missing];
          const idx = base.indexOf(centerKey);
          if (idx < 0) return s;
          const swapWith = direction === "up" ? idx - 1 : idx + 1;
          if (swapWith < 0 || swapWith >= base.length) return s;
          const next = [...base];
          [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
          return { capCenterOrder: next };
        }),

      /** Replace the step-down sequence wholesale (drag-and-drop reorder).
       *  Preserves any centers from the pool set that aren't in the passed
       *  order — they get appended at the end so a stale order can't drop
       *  a center silently. */
      setCapCenterOrder: (order) =>
        set((s) => {
          const inOrder = new Set(order);
          const tail = [...new Set(s.capPools.map((p) => p.centerGlCode))]
            .filter((k): k is string => !!k && !inOrder.has(k));
          return { capCenterOrder: [...order, ...tail] };
        }),

      setActiveJurisdiction: (id) =>
        set((s) => {
          const next = getJurisdiction(id);
          if (!next) return s;
          return {
            activeJurisdictionId: id,
            // Reset to the new jurisdiction's default fiscal year if the
            // currently-active one isn't valid for the target.
            activeFiscalYear: next.fiscalYears.includes(s.activeFiscalYear)
              ? s.activeFiscalYear
              : next.defaultFiscalYear,
          };
        }),

      setActiveFiscalYear: (fy) =>
        set(() => ({ activeFiscalYear: fy })),

      setActiveFeeDepts: (depts) =>
        set((s) => {
          const valid = new Set(FEE_DEPTS);
          const deduped = depts.filter((d, i) => valid.has(d) && depts.indexOf(d) === i);
          const activeFeeDepts = deduped.length > 0 ? deduped : s.activeFeeDepts;
          const existingTargets = new Set(s.policyTargets.map((t) => t.dept));
          const missingTargets = activeFeeDepts
            .filter((dept) => !existingTargets.has(dept))
            .map((dept) => ({
              id: `target-${dept.toLowerCase()}`,
              dept,
              target: 100,
              note: "Default full cost recovery target",
            }));
          return {
            activeFeeDepts,
            policyTargets: missingTargets.length
              ? [...s.policyTargets, ...missingTargets]
              : s.policyTargets,
          };
        }),

      createVersion: (input) => {
        let created!: StudyVersion;
        set((s) => {
          created = makeStudyVersion(s, input);
          return {
            versions: [...s.versions, created],
            comparisonVersionId: created.id,
          };
        });
        return created;
      },

      setComparisonVersion: (id) =>
        set((s) => ({
          comparisonVersionId: id && s.versions.some((v) => v.id === id) ? id : null,
        })),

      updateFunctionalAllocation: (id, patch) =>
        set((s) => ({
          functionalAllocation: s.functionalAllocation.map((b) =>
            b.id === id ? { ...b, ...patch, id: b.id, dept: b.dept } : b,
          ),
        })),

      addFunctionalAllocation: (dept) =>
        set((s) => ({
          functionalAllocation: [
            ...s.functionalAllocation,
            {
              id: `fa-${dept.toLowerCase()}-${Date.now()}`,
              dept,
              name: "New activity",
              recoverabilityPct: 100,
              hoursSharePct: 0,
              // Defaults to true because recoverabilityPct defaults to >0.
              // Analyst-toggle on the page overrides this without auto-recoupling.
              rateBasisHours: true,
              source: "manual",
            },
          ],
        })),

      resetAll: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        set(initialState());
      },

      clearAll: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        set({
          productiveHours: [],
          operating: [],
          capPools: [],
          capCenterTotals: {},
          capCenterDisallowed: {},
          capCenterSources: {},
          studyContext: { ...DEFAULT_STUDY_CONTEXT },
          allocationBases: SEED_ALLOCATION_BASES.map((b) => ({ ...b })),
          capBasisUnits: [],
          capDirectAllocations: [],
          directBills: {},
          volume: [],
          services: [],
          serviceRoleAllocations: {},
          policyTargets: [],
          policyExceptions: [],
          lineage: {},
          pendingReview: { ...emptyPending },
          capCenterOrder: [],
          imports: [],
          functionalAllocation: [],
          activeFeeDepts: [],
          versions: [],
          comparisonVersionId: null,
        });
      },

      // Bulk replace of the BuildSnapshot slice. Zustand `set` does a
      // shallow merge, so spreading a snapshot leaves versions /
      // comparisonVersionId / actions untouched while overwriting
      // every persisted field at once. Used by lib/snapshotIO.ts.
      loadSnapshot: (snapshot) => set({
        ...snapshot,
        activeFeeDepts: activeFeeDeptsForSnapshot(snapshot),
      }),
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        migratePersistedState(state);
      },
    },
  ),
);

/* ── Derived types ── */

/** Per-fee-dept aggregation of cost / revenue / policy-target metrics
 *  derived from FeeComparison rows. Centralizes the loop that monitoring,
 *  DeptRecoveryChart, and src/pages/index.tsx each used to roll up
 *  separately. All fields are unrounded; consumers round at display time
 *  per `lib/format.ts` convention. */
export interface BuildDeptRollup {
  /** Σ annualCost across comparisons in this dept. */
  totalCost: number;
  /** Σ annualRevenue across comparisons in this dept. */
  currentRev: number;
  /** Σ annualCost × (target / 100) — revenue the dept would collect at
   *  its policy target. */
  intendedRev: number;
  /** max(0, intendedRev − currentRev). The General Fund subsidy implied
   *  by the gap between adopted fees and policy target. */
  subsidy: number;
  /** (currentRev / totalCost) × 100, unrounded. 0 when totalCost is 0. */
  recoveryPct: number;
}

interface BuildDerived {
  activeFeeDepts: DeptCode[];
  labor: Record<DeptCode, DeptLabor>;
  operatingByDept: Record<DeptCode, DeptOperating>;
  fbhr: Record<DeptCode, FBHR>;
  costs: ServiceCost[];
  comparisons: FeeComparison[];
  impact: PolicyImpact;
  deptRollup: Record<DeptCode, BuildDeptRollup>;
  /** Per-fee-dept (PLAN/BLDG/ENG) total $ landing on direct nodes after the
   *  step-down closes every indirect center. Each fee dept sums every
   *  direct node whose feeDept classification matches. Flows into deptFBHR
   *  so the CAP rate ($/hr) reconciles to the pool inventory. */
  capAllocated: Record<DeptCode, number>;
  /** Per-node, per-basis driver matrix used by the engine. Imported
   *  receiver units overlay the seed driver row for seed nodes only —
   *  imported nodes get their units strictly from the receiver aggregation. */
  capDrivers: GlDriverMatrix;
  /** Pre-computed step-down model. Cells keyed by NodeKey (glCode or synth
   *  seed:* key). Source of truth for the matrix tabs + cell traces. */
  capStepDown: GlStepDownModel;
  /** Per-dept capacity reconciliation: allocated demand hours (rolled up
   *  from service × role allocations, routed by role.dept) ÷ productive
   *  supply hours (from the productiveHours roster). Drives the Cost of
   *  Service FBHR table's Allocated Hrs + Utilization columns. */
  utilization: Record<DeptCode, DeptUtilization>;
  /** Functional Allocation derivation (per-bucket + per-dept implied
   *  FBHR). Always computed; the implied FBHR only drives downstream
   *  cost math when state.useFunctionalAllocationFbhr is true. */
  functionalAllocation: FunctionalAllocationDerived;
}

export function deriveBuildDerived(state: BuildSnapshot): BuildDerived {
  // Overlay current-cycle volume from the Volume tab onto each service
  // so downstream consumers (serviceCosts, capacity allocation, fee
  // comparisons) see Volume edits flow through. VolumeRow.id matches
  // Service.id; missing or null `current` falls back to the Service's
  // own volume field.
  const volumeById = new Map(state.volume.map((w) => [w.id, w]));
  const services = state.services.map((s) => {
    const v = volumeById.get(s.id);
    return v?.current != null ? { ...s, volume: v.current } : s;
  });
  const activeFeeDepts = (Array.isArray(state.activeFeeDepts) && state.activeFeeDepts.length > 0
    ? state.activeFeeDepts
    : FEE_DEPTS.filter((dept) =>
      state.services.some((s) => s.dept === dept)
      || state.productiveHours.some((p) => p.dept === dept)
      || state.operating.some((o) => o.dept === dept)
      || state.functionalAllocation.some((b) => b.dept === dept)
    ));

  const labor = deptLabor(state.operating, state.productiveHours);
  const hoursByDept = {} as Record<DeptCode, number>;
  for (const d of FEE_DEPTS) hoursByDept[d] = labor[d].productiveHours;
  const operatingByDept = deptOperating(state.operating, hoursByDept);

  // glCode-native CAP engine. Nodes = one indirect node per cost center
  // plus one direct node per imported PLAN/BLDG/ENG-classified receiver glCode.
  const { entries: capReceivers } = buildReceiverRegistry(
    state.capBasisUnits, state.capDirectAllocations,
    state.allocationBases, state.studyContext,
  );

  // Scope the engine's synthetic fallback direct nodes to the fee depts the
  // active jurisdiction actually models. Without this, the engine seeds
  // every entry in FEE_DEPTS and the seed DRIVERS matrix routes real $ to
  // phantom receivers (e.g. PARKS / PD / FIRE on a Planning/Building/Eng-
  // only jurisdiction).
  const modeledFeeDepts: DeptCode[] = activeFeeDepts;

  const graph = buildEngineGraph({
    allocationBases: state.allocationBases,
    basisUnits: state.capBasisUnits,
    directAllocations: state.capDirectAllocations,
    capCenterTotals: state.capCenterTotals,
    capCenterSources: state.capCenterSources,
    capReceivers,
    modeledFeeDepts,
  });

  const stepDown = computeStepDownGl({
    pools: state.capPools,
    centerOrder: state.capCenterOrder,
    bases: state.allocationBases,
    basisUnits: state.capBasisUnits,
    directAllocations: state.capDirectAllocations,
    directBills: state.directBills,
    graph,
  });

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV
      && stepDown.diagnostics.length > 0) {
    for (const d of stepDown.diagnostics) {
      const key = `${d.poolId}|${d.kind}`;
      if (!loggedCapDiagnostics.has(key)) {
        loggedCapDiagnostics.add(key);
        // eslint-disable-next-line no-console
        console.warn(`[CAP] ${d.center} · ${d.pool} (${d.kind}): ${d.message}`);
      }
    }
  }

  const capAllocated = capAllocatedFromGl(stepDown);
  const derivedCapAllocation = {} as Record<DeptCode, CapAllocation>;
  for (const d of FEE_DEPTS) {
    derivedCapAllocation[d] = { dept: d, allocated: capAllocated[d] };
  }

  const engineFbhr = deptFBHR(labor, operatingByDept, derivedCapAllocation);
  const functionalAllocation = deriveFunctionalAllocation(
    state.functionalAllocation, engineFbhr,
  );
  // Recoverable FBHR from Functional Allocation always drives downstream
  // Cost of Service math. The component rates (directRate / operatingRate
  // / capRate) are not rewritten — they stay as the engine's
  // decomposition so the Cost of Service breakdown still reads
  // correctly; only the headline `fbhr` is replaced. Depts where the
  // recoverable FBHR is null (no buckets, no rate-basis hours) fall
  // through to the engine FBHR.
  const fbhr = applyFunctionalAllocationFbhr(engineFbhr, functionalAllocation);
  const costs = serviceCosts(services, fbhr);
  const comparisons = feeComparisons(
    costs, services, state.policyTargets, state.policyExceptions,
  );
  const impact = policyImpact(comparisons);
  const deptRollup = buildDeptRollup(comparisons);

  const allocated = allocatedHoursByDept(
    services, state.serviceRoleAllocations, state.productiveHours,
  );
  const utilization = utilizationByDept(allocated, hoursByDept);

  return {
    activeFeeDepts,
    labor, operatingByDept, fbhr, costs, comparisons, impact,
    deptRollup,
    capAllocated, capDrivers: graph.drivers,
    capStepDown: stepDown,
    utilization,
    functionalAllocation,
  };
}

/** Build the per-dept rollup from FeeComparison rows. Pre-buckets by
 *  dept in a single pass instead of three filter+reduce loops per dept;
 *  result sums match the prior inline computations to within
 *  floating-point precision. Display values round at the edge per the
 *  `lib/format.ts` convention. */
function buildDeptRollup(comparisons: FeeComparison[]): Record<DeptCode, BuildDeptRollup> {
  const out = {} as Record<DeptCode, BuildDeptRollup>;
  for (const d of FEE_DEPTS) {
    out[d] = { totalCost: 0, currentRev: 0, intendedRev: 0, subsidy: 0, recoveryPct: 0 };
  }
  for (const c of comparisons) {
    // Skip non-recoverable rows so the per-dept rollup stays
    // consistent with the global policyImpact aggregate. See
    // isRecoverableFeeRow in lib/calc.ts.
    if (!c.recoverable) continue;
    const r = out[c.dept];
    if (!r) continue;
    r.totalCost += c.annualCost;
    r.currentRev += c.annualRevenue;
    r.intendedRev += c.annualCost * (c.target / 100);
  }
  for (const d of FEE_DEPTS) {
    const r = out[d];
    r.subsidy = Math.max(0, r.intendedRev - r.currentRev);
    r.recoveryPct = r.totalCost > 0 ? (r.currentRev / r.totalCost) * 100 : 0;
  }
  return out;
}

/* ── Focused selector hooks ──
 *
 * `useBuildState()` below subscribes to the entire store and recomputes
 * the full derived object every render. Pages that only need a slice
 * (or only need action functions) should use the focused hooks here
 * instead — they re-render only when the selected projection changes.
 *
 * Migrate consumers opportunistically; do not rewrite everything at
 * once. Both API surfaces are stable.
 */

/** Subscribe to action functions only. The selector is expected to
 *  return an object of action references; since those references are
 *  stable across renders, the consumer effectively never re-renders.
 *  Use for components that mutate state without reading it. */
export function useBuildActions<T extends Record<string, unknown>>(
  selector: (s: BuildState & BuildActions) => T,
): T {
  return useBuildStore(useShallow(selector));
}

/* ── Drop-in hook — identical return shape to the old BuildContext ── */

export function useBuildState() {
  const state = useBuildStore();

  const derived: BuildDerived = useMemo(() => deriveBuildDerived(state), [
    state.productiveHours, state.operating,
    state.capPools, state.capCenterTotals, state.capCenterDisallowed,
    state.capCenterOrder,
    state.capBasisUnits, state.capDirectAllocations, state.directBills,
    state.allocationBases, state.capCenterSources, state.studyContext,
    state.services, state.serviceRoleAllocations,
    state.policyTargets, state.policyExceptions,
    state.functionalAllocation,
    state.volume,
  ]);

  return { ...state, derived };
}
