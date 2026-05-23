import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { POSITIONS } from "@/lib/data/positions";
import { OPERATING } from "@/lib/data/operating";
import {
  CAP_BASIS_UNITS, CAP_CENTER_GLCODES, CAP_CENTER_TOTALS, CAP_DIRECT_ALLOCATIONS,
  CAP_POOLS,
} from "@/lib/data/cap";
import { SEED_ALLOCATION_BASES } from "@/lib/data/allocationBasesCatalog";
import { FEE_DEPTS } from "@/lib/data/departments";
import { WORKLOAD } from "@/lib/data/workload";
import { SERVICES } from "@/lib/data/services";
import { POLICY_TARGETS, POLICY_EXCEPTIONS } from "@/lib/data/policy";
import { IMPORTS } from "@/lib/data/imports";
import type {
  AllocationBasis, BasisUnitRow, CapAllocation, CapPool, DeptCode,
  DirectAllocationRow, OperatingLine, PolicyException, PolicyTarget,
  Position, Service, SourceTag, WorkloadRow,
} from "@/lib/types";
import {
  deptLabor, deptOperating, deptFBHR, feeComparisons, policyImpact, serviceCosts,
  type DeptLabor, type DeptOperating, type FBHR, type FeeComparison,
  type PolicyImpact, type ServiceCost,
} from "@/lib/calc";
import { buildReceiverRegistry } from "@/lib/data/capReceiverRegistry";
import {
  buildEngineGraph, capAllocatedFromGl, computeStepDownGl,
  type GlDriverMatrix, type GlStepDownModel,
} from "@/lib/data/capStepDownGl";
import {
  DEFAULT_STUDY_CONTEXT, extractStudyContext, type StudyContext,
} from "@/lib/data/studyContext";
import {
  DEFAULT_JURISDICTION_ID, getJurisdiction,
} from "@/lib/data/jurisdictions";
import type { ExtractionResult, ImportApplyResult, SourceLineage, UnmappedRow } from "@/lib/parse";

/* ── Re-exported types ── */

export type Domain =
  | "positions" | "operating" | "services"
  | "fees" | "workload" | "cap";

export interface BuildImportLog {
  id: number;
  domain: Domain;
  result: ImportApplyResult;
  at: string;
}

export type StudyVersionStatus = "draft" | "review" | "published" | "adopted" | "archived";

export interface BuildSnapshot {
  positions: Position[];
  operating: OperatingLine[];
  capPools: CapPool[];
  capCenterTotals: Record<string, number>;
  capCenterDisallowed: Record<string, number>;
  capCenterGlCodes: Record<string, string>;
  capCenterSources: Record<string, { source: SourceTag; sourceFile?: string }>;
  studyContext: StudyContext;
  allocationBases: AllocationBasis[];
  capBasisUnits: BasisUnitRow[];
  capDirectAllocations: DirectAllocationRow[];
  workload: WorkloadRow[];
  services: Service[];
  policyTargets: PolicyTarget[];
  policyExceptions: PolicyException[];
  lineage: Record<string, SourceLineage>;
  pendingReview: Record<Domain, UnmappedRow[]>;
  capCenterOrder: string[];
  imports: BuildImportLog[];
  activeJurisdictionId: string;
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

interface BuildState {
  positions: Position[];
  operating: OperatingLine[];
  capPools: CapPool[];
  /** Source-department cost per cost center — the 100% reference for each
   *  pool's allocationPercent. Editing a center total rescales all member
   *  pool amounts proportionally. */
  capCenterTotals: Record<string, number>;
  /** Center name → disallowed expenses (capital outlay, one-time spend,
   *  pass-through, grant-funded non-fee items, etc.) excluded before
   *  allocation. Net Allocable = Total − Disallowed; the engine reads
   *  pool.amount (derived from net), so all downstream math reflects this
   *  reduction automatically. Default 0 per center; preserved separately
   *  from capCenterTotals so the gross/net trail is auditable. */
  capCenterDisallowed: Record<string, number>;
  /** Center name → glCode (from imported CenterRow.glCode). Drives the
   *  glCode-first center routing in computeStepDown's center resolver. */
  capCenterGlCodes: Record<string, string>;
  /** Center name → provenance (parallel map to capCenterTotals; kept
   *  separate so we don't restructure capCenterTotals into an object map). */
  capCenterSources: Record<string, { source: SourceTag; sourceFile?: string }>;
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
  workload: WorkloadRow[];
  services: Service[];
  policyTargets: PolicyTarget[];
  policyExceptions: PolicyException[];
  lineage: Record<string, SourceLineage>;
  pendingReview: Record<Domain, UnmappedRow[]>;
  capCenterOrder: string[];
  imports: BuildImportLog[];
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
  activeFiscalYear: string;
}

interface BuildActions {
  updatePosition: (id: string, patch: Partial<Position>) => void;
  updateOperating: (id: string, patch: Partial<OperatingLine>) => void;
  updateWorkload: (id: string, patch: Partial<WorkloadRow>) => void;
  updateService: (id: string, patch: Partial<Service>) => void;
  updatePolicyTarget: (id: string, patch: Partial<PolicyTarget>) => void;
  updatePolicyException: (id: string, patch: Partial<PolicyException>) => void;
  addPolicyException: () => void;
  removePolicyException: (id: string) => void;
  addService: () => void;
  addPosition: () => void;
  addOperatingLine: () => void;
  addCapPool: (center: string) => void;
  addCapCenter: () => void;
  updateCapPool: (id: string, patch: Partial<CapPool>) => void;
  renameCapCenter: (oldName: string, newName: string) => void;
  /** Set a cost center's source-department total cost. Rescales every pool
   *  in that center: pool.amount = totalCost × pool.allocationPercent / 100. */
  updateCenterTotal: (centerName: string, totalCost: number) => void;
  /** Set a cost center's disallowed expenses. Clamped to [0, Total]; rescales
   *  all pools in the center by net = Total − Disallowed. */
  updateCenterDisallowed: (centerName: string, disallowed: number) => void;
  /** Append a user-defined allocation basis to the catalog. Returns the new id. */
  addAllocationBasis: (input: { name: string; source: string; methodologyNote?: string }) => string;
  mergePositions: (r: ExtractionResult<Position>, fileName: string) => ImportApplyResult;
  mergeOperating: (r: ExtractionResult<OperatingLine>, fileName: string) => ImportApplyResult;
  mergeServices: (r: ExtractionResult<Service>, fileName: string) => ImportApplyResult;
  mergeFeeSchedule: (r: ExtractionResult<Service>, fileName: string) => ImportApplyResult;
  mergeWorkload: (r: ExtractionResult<WorkloadRow>, fileName: string) => ImportApplyResult;
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
  createVersion: (input?: { label?: string; status?: StudyVersionStatus; notes?: string }) => StudyVersion;
  setComparisonVersion: (id: string | null) => void;
  resetAll: () => void;
  clearAll: () => void;
}

/* ── Helpers ── */

const emptyPending: Record<Domain, UnmappedRow[]> = {
  positions: [], operating: [], services: [], fees: [], workload: [], cap: [],
};
export function defaultCenterOrder(pools: CapPool[]): string[] {
  const totals = new Map<string, number>();
  for (const p of pools) totals.set(p.center, (totals.get(p.center) ?? 0) + p.amount);
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

const initialState = (): BuildState => {
  const pools = CAP_POOLS.map((p) => ({ ...p }));
  const state: BuildSnapshot = {
    positions: POSITIONS.map((p) => ({ ...p })),
    operating: OPERATING.map((o) => ({ ...o })),
    capPools: pools,
    capCenterTotals: { ...CAP_CENTER_TOTALS },
    capCenterDisallowed: {},
    capCenterGlCodes: { ...CAP_CENTER_GLCODES },
    capCenterSources: Object.fromEntries(
      Object.keys(CAP_CENTER_TOTALS).map((name) => [name, { source: "seed" as SourceTag }]),
    ),
    studyContext: { ...DEFAULT_STUDY_CONTEXT },
    allocationBases: SEED_ALLOCATION_BASES.map((b) => ({ ...b })),
    capBasisUnits: CAP_BASIS_UNITS.map((bu) => ({
      ...bu, receivers: bu.receivers.map((r) => ({ ...r })),
    })),
    capDirectAllocations: CAP_DIRECT_ALLOCATIONS.map((da) => ({
      ...da, receivers: da.receivers.map((r) => ({ ...r })),
    })),
    workload: WORKLOAD.map((w) => ({ ...w })),
    services: SERVICES.map((s) => ({ ...s })),
    policyTargets: POLICY_TARGETS.map((p) => ({ ...p })),
    policyExceptions: POLICY_EXCEPTIONS.map((e) => ({ ...e })),
    lineage: {},
    pendingReview: { ...emptyPending },
    capCenterOrder: defaultCenterOrder(pools),
    imports: IMPORTS.map((e) => ({ ...e, result: { ...e.result, warnings: [...e.result.warnings] } })),
    activeJurisdictionId: DEFAULT_JURISDICTION_ID,
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createBuildSnapshot(state: BuildSnapshot): BuildSnapshot {
  return cloneJson({
    positions: state.positions,
    operating: state.operating,
    capPools: state.capPools,
    capCenterTotals: state.capCenterTotals,
    capCenterDisallowed: state.capCenterDisallowed,
    capCenterGlCodes: state.capCenterGlCodes,
    capCenterSources: state.capCenterSources,
    studyContext: state.studyContext,
    allocationBases: state.allocationBases,
    capBasisUnits: state.capBasisUnits,
    capDirectAllocations: state.capDirectAllocations,
    workload: state.workload,
    services: state.services,
    policyTargets: state.policyTargets,
    policyExceptions: state.policyExceptions,
    lineage: state.lineage,
    pendingReview: state.pendingReview,
    capCenterOrder: state.capCenterOrder,
    imports: state.imports,
    activeJurisdictionId: state.activeJurisdictionId,
    activeFiscalYear: state.activeFiscalYear,
  });
}

function makeStudyVersion(
  state: BuildSnapshot,
  input: { label?: string; status?: StudyVersionStatus; notes?: string } = {},
): StudyVersion {
  const existing = "versions" in state && Array.isArray((state as BuildState).versions)
    ? (state as BuildState).versions
    : [];
  const versionNumber = existing.length + 1;
  const createdAt = new Date().toISOString();
  return {
    id: `version-${Date.now()}-${versionNumber}`,
    versionNumber,
    label: input.label?.trim() || `Version ${versionNumber}`,
    status: input.status ?? "draft",
    createdAt,
    createdBy: "current user",
    notes: input.notes?.trim() || undefined,
    sourceImportIds: state.imports.map((i) => i.id),
    snapshot: createBuildSnapshot(state),
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

      updatePosition: (id, patch) =>
        set((s) => ({ positions: s.positions.map((p) => p.id === id ? { ...p, ...patch } : p) })),

      updateOperating: (id, patch) =>
        set((s) => ({ operating: s.operating.map((o) => o.id === id ? { ...o, ...patch } : o) })),

      updateWorkload: (id, patch) =>
        set((s) => ({ workload: s.workload.map((w) => w.id === id ? { ...w, ...patch } : w) })),

      updateService: (id, patch) =>
        set((s) => ({ services: s.services.map((sv) => sv.id === id ? { ...sv, ...patch } : sv) })),

      updatePolicyTarget: (id, patch) =>
        set((s) => ({ policyTargets: s.policyTargets.map((t) => t.id === id ? { ...t, ...patch } : t) })),

      updatePolicyException: (id, patch) =>
        set((s) => ({ policyExceptions: s.policyExceptions.map((e) => e.id === id ? { ...e, ...patch } : e) })),

      addPolicyException: () =>
        set((s) => ({
          policyExceptions: [
            ...s.policyExceptions,
            { id: `exc-${Date.now()}`, fee: "New fee exception", target: 50, note: "" },
          ],
        })),

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

      addPosition: () =>
        set((s) => ({
          positions: [
            ...s.positions,
            { id: `pos-${Date.now()}`, title: "New position", dept: "PLAN",
              fte: 1, salary: 0, benefits: 0, hours: 1720,
              source: "manual" },
          ],
        })),

      addOperatingLine: () =>
        set((s) => ({
          operating: [
            ...s.operating,
            { id: `op-${Date.now()}`, code: "—", dept: "PLAN", category: "Other",
              line: "New line item", amount: 0, source: "manual", include: true },
          ],
        })),

      addCapPool: (center) =>
        set((s) => ({
          capPools: [
            ...s.capPools,
            { id: `cap-${Date.now()}`, center, pool: "New pool",
              allocationPercent: 0, amount: 0,
              basisId: "", basis: "", receiving: "All depts", recoverability: "TBD", review: "Review" },
          ],
        })),

      addCapCenter: () =>
        set((s) => {
          const name = "New Cost Center";
          return {
            capPools: [
              ...s.capPools,
              { id: `cap-${Date.now()}`, center: name, pool: "New pool",
                allocationPercent: 100, amount: 0,
                basisId: "", basis: "", receiving: "All depts", recoverability: "TBD", review: "Review" },
            ],
            capCenterTotals: name in s.capCenterTotals
              ? s.capCenterTotals
              : { ...s.capCenterTotals, [name]: 0 },
            capCenterSources: name in s.capCenterSources
              ? s.capCenterSources
              : { ...s.capCenterSources, [name]: { source: "manual" } },
            capCenterOrder: s.capCenterOrder.includes(name)
              ? s.capCenterOrder
              : [...s.capCenterOrder, name],
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
          const centerTotal = s.capCenterTotals[target.center] ?? 0;
          const centerDisallowed = s.capCenterDisallowed[target.center] ?? 0;
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
              .filter((p) => p.center === target.center)
              .reduce((a, p) => a + p.amount, 0);
            if (derivedNet > 0) {
              const newTotal = derivedNet + centerDisallowed;
              nextTotals = { ...s.capCenterTotals, [target.center]: newTotal };
              nextPools = nextPools.map((p) =>
                p.center === target.center
                  ? { ...p, allocationPercent: (p.amount / derivedNet) * 100 }
                  : p,
              );
            }
          }

          return { capPools: nextPools, capCenterTotals: nextTotals };
        }),

      renameCapCenter: (oldName, newName) =>
        set((s) => {
          if (oldName === newName) return s;
          const nextTotals = { ...s.capCenterTotals };
          if (oldName in nextTotals) {
            nextTotals[newName] = nextTotals[oldName];
            delete nextTotals[oldName];
          }
          const nextDisallowed = { ...s.capCenterDisallowed };
          if (oldName in nextDisallowed) {
            nextDisallowed[newName] = nextDisallowed[oldName];
            delete nextDisallowed[oldName];
          }
          return {
            capPools: s.capPools.map((p) =>
              p.center === oldName ? { ...p, center: newName } : p,
            ),
            capCenterTotals: nextTotals,
            capCenterDisallowed: nextDisallowed,
            capCenterOrder: s.capCenterOrder.map((n) => n === oldName ? newName : n),
          };
        }),

      updateCenterTotal: (centerName, totalCost) =>
        set((s) => {
          const newTotal = Math.max(0, totalCost);
          const disallowed = s.capCenterDisallowed[centerName] ?? 0;
          const net = Math.max(0, newTotal - disallowed);
          return {
            capCenterTotals: { ...s.capCenterTotals, [centerName]: newTotal },
            capPools: s.capPools.map((p) =>
              p.center === centerName
                ? { ...p, amount: net * (p.allocationPercent / 100) }
                : p,
            ),
          };
        }),

      updateCenterDisallowed: (centerName, disallowed) =>
        set((s) => {
          const total = s.capCenterTotals[centerName] ?? 0;
          // Clamp to [0, Total] so Net Allocable can never be negative.
          const clamped = Math.max(0, Math.min(disallowed, total));
          const net = Math.max(0, total - clamped);
          return {
            capCenterDisallowed: { ...s.capCenterDisallowed, [centerName]: clamped },
            capPools: s.capPools.map((p) =>
              p.center === centerName
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
          const { merged, lineagePatch } = mergeRows(s.positions, r);
          return {
            positions: merged,
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
          const { merged, lineagePatch } = mergeRows(s.services, r);
          return {
            services: merged,
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
          const { merged, lineagePatch } = mergeRows(s.services, r);
          return {
            services: merged,
            lineage: { ...s.lineage, ...lineagePatch },
            pendingReview: { ...s.pendingReview, fees: [...s.pendingReview.fees, ...r.unmapped] },
            imports: [...s.imports, { id: Date.now(), domain: "fees", result, at: new Date().toISOString() }],
          };
        });
        return result;
      },

      mergeWorkload: (r, fileName) => {
        const result = toApplyResult("workload", fileName, r);
        set((s) => {
          const { merged, lineagePatch } = mergeRows(s.workload, r);
          return {
            workload: merged,
            lineage: { ...s.lineage, ...lineagePatch },
            pendingReview: { ...s.pendingReview, workload: [...s.pendingReview.workload, ...r.unmapped] },
            imports: [...s.imports, { id: Date.now(), domain: "workload", result, at: new Date().toISOString() }],
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
          // Upsert totals by name; append unseen names to the step-down order.
          // Capture each center's glCode (when the import provides one) so
          // the step-down center resolver can route via glCode instead of
          // the LAH-only name map.
          const nextTotals = { ...s.capCenterTotals };
          const nextOrder = [...s.capCenterOrder];
          const nextCenterGlCodes = { ...s.capCenterGlCodes };
          const nextCenterSources = { ...s.capCenterSources };
          for (const { entity } of centersIn) {
            nextTotals[entity.name] = entity.totalCost;
            if (!nextOrder.includes(entity.name)) nextOrder.push(entity.name);
            if (entity.glCode) nextCenterGlCodes[entity.name] = entity.glCode;
            nextCenterSources[entity.name] = { source: "imported", sourceFile: fileName };
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
          // matched by name to seed) bind correctly.
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
            return { entity: { ...entity, basisId }, lineage };
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

          return {
            capPools: mergedPools,
            capCenterTotals: nextTotals,
            capCenterGlCodes: nextCenterGlCodes,
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

      moveCenter: (name, direction) =>
        set((s) => {
          const known = new Set(s.capCenterOrder);
          const missing = [...new Set(s.capPools.map((p) => p.center))].filter((c) => !known.has(c));
          const base = [...s.capCenterOrder, ...missing];
          const idx = base.indexOf(name);
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
          const tail = [...new Set(s.capPools.map((p) => p.center))]
            .filter((c) => !inOrder.has(c));
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

      resetAll: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        set(initialState());
      },

      clearAll: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        set({
          positions: [],
          operating: [],
          capPools: [],
          capCenterTotals: {},
          capCenterDisallowed: {},
          capCenterGlCodes: {},
          capCenterSources: {},
          studyContext: { ...DEFAULT_STUDY_CONTEXT },
          allocationBases: SEED_ALLOCATION_BASES.map((b) => ({ ...b })),
          capBasisUnits: [],
          capDirectAllocations: [],
          workload: [],
          services: [],
          policyTargets: [],
          policyExceptions: [],
          lineage: {},
          pendingReview: { ...emptyPending },
          capCenterOrder: [],
          imports: [],
          versions: [],
          comparisonVersionId: null,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.capCenterOrder || state.capCenterOrder.length === 0) {
          state.capCenterOrder = defaultCenterOrder(state.capPools ?? []);
        }
        // Seed CAP slices ONLY when the field is genuinely absent (true
        // migration from pre-field state). Empty arrays / objects mean the
        // user explicitly cleared the seed — respect that and don't
        // re-inject. The earlier "fill in missing entries by id" behavior
        // would resurrect seed data on every reload after a clear.
        if (state.capCenterGlCodes == null) {
          state.capCenterGlCodes = { ...CAP_CENTER_GLCODES };
        }
        if (!state.studyContext) state.studyContext = { ...DEFAULT_STUDY_CONTEXT };
        // Backfill active context for state persisted before the
        // jurisdiction-aware layer landed. Defaults to the LAH demo so
        // existing sessions continue to land on the same data.
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

        // Backfill seed imports if the persisted store has an empty log.
        // The Annual Update tab needs at least one import to render the
        // Refresh cards / Change queue / Packet narrative; new users get
        // these from initialState(), but earlier sessions stored [].
        if (!state.imports || state.imports.length === 0) {
          state.imports = IMPORTS.map((e) => ({
            ...e, result: { ...e.result, warnings: [...e.result.warnings] },
          }));
        }

        // Backfill for state persisted before the SourceTag standardization:
        //   - capCenterSources didn't exist: synthesize "seed" for every
        //     existing center name so the new Source column renders something.
        //   - Service / Position / OperatingLine were missing `source`, or in
        //     the OperatingLine case carried a free-form GL string. Coerce
        //     anything outside the SourceTag union to "seed".
        if (!state.capCenterSources) {
          state.capCenterSources = Object.fromEntries(
            Object.keys(state.capCenterTotals ?? {}).map((name) => [
              name, { source: "seed" as SourceTag },
            ]),
          );
        }
        const VALID_SOURCES: SourceTag[] = ["seed", "imported", "manual"];
        const coerce = (v: unknown): SourceTag =>
          typeof v === "string" && (VALID_SOURCES as string[]).includes(v) ? (v as SourceTag) : "seed";
        if (Array.isArray(state.services)) {
          state.services = state.services.map((s) => ({ ...s, source: coerce(s.source) }));
        }
        if (Array.isArray(state.positions)) {
          state.positions = state.positions.map((p) => ({ ...p, source: coerce(p.source) }));
        }
        if (Array.isArray(state.operating)) {
          state.operating = state.operating.map((o) => ({ ...o, source: coerce(o.source) }));
        }
        if (Array.isArray(state.workload)) {
          state.workload = state.workload.map((w) => ({ ...w, source: coerce(w.source) }));
        }
        // Backfill for state persisted before allocationBases existed.
        // Without this, basisForPool(pool, undefined) crashes the matrix.
        if (!state.allocationBases || state.allocationBases.length === 0) {
          state.allocationBases = SEED_ALLOCATION_BASES.map((b) => ({ ...b }));
        }
        // Backfill capCenterTotals + allocationPercent for state persisted
        // before the % column became editable. Derive totals from Σ amount
        // per center; derive each pool's % from amount/centerTotal.
        if (state.capPools) {
          if (!state.capCenterTotals || Object.keys(state.capCenterTotals).length === 0) {
            const totals: Record<string, number> = {};
            for (const p of state.capPools) {
              totals[p.center] = (totals[p.center] ?? 0) + (p.amount ?? 0);
            }
            state.capCenterTotals = totals;
          }
          state.capPools = state.capPools.map((p) => {
            if (typeof p.allocationPercent === "number") return p;
            const total = state.capCenterTotals[p.center] ?? 0;
            const pct = total > 0 ? (p.amount / total) * 100 : 0;
            return { ...p, allocationPercent: pct };
          });
        }
        if (!Array.isArray(state.versions)) {
          const baseline = makeStudyVersion(state, {
            label: "Recovered baseline",
            status: "adopted",
            notes: "Created from the first locally persisted model after versioning was enabled.",
          });
          state.versions = [baseline];
          state.comparisonVersionId = baseline.id;
        }
        if (state.comparisonVersionId && !state.versions.some((v) => v.id === state.comparisonVersionId)) {
          state.comparisonVersionId = state.versions[0]?.id ?? null;
        }
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
}

export function deriveBuildDerived(state: BuildSnapshot): BuildDerived {
  const labor = deptLabor(state.positions);
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
  const modeledFeeDepts: DeptCode[] = Array.from(new Set<DeptCode>([
    ...state.positions.map((p) => p.dept),
    ...state.services.map((s) => s.dept),
  ]));

  const graph = buildEngineGraph({
    allocationBases: state.allocationBases,
    basisUnits: state.capBasisUnits,
    directAllocations: state.capDirectAllocations,
    capCenterTotals: state.capCenterTotals,
    capCenterGlCodes: state.capCenterGlCodes,
    capReceivers,
    modeledFeeDepts,
  });

  const stepDown = computeStepDownGl({
    pools: state.capPools,
    centerOrder: state.capCenterOrder,
    bases: state.allocationBases,
    basisUnits: state.capBasisUnits,
    directAllocations: state.capDirectAllocations,
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

  const fbhr = deptFBHR(labor, operatingByDept, derivedCapAllocation);
  const costs = serviceCosts(state.services, fbhr);
  const comparisons = feeComparisons(
    costs, state.services, state.policyTargets, state.policyExceptions,
  );
  const impact = policyImpact(comparisons);
  const deptRollup = buildDeptRollup(comparisons);
  return {
    labor, operatingByDept, fbhr, costs, comparisons, impact,
    deptRollup,
    capAllocated, capDrivers: graph.drivers,
    capStepDown: stepDown,
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

/* ── Drop-in hook — identical return shape to the old BuildContext ── */

export function useBuildState() {
  const state = useBuildStore();

  const derived: BuildDerived = useMemo(() => deriveBuildDerived(state), [
    state.positions, state.operating,
    state.capPools, state.capCenterTotals, state.capCenterOrder,
    state.capBasisUnits, state.capDirectAllocations,
    state.allocationBases, state.capCenterGlCodes, state.studyContext,
    state.services, state.policyTargets, state.policyExceptions,
  ]);

  return { ...state, derived };
}
