import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { POSITIONS } from "@/lib/data/positions";
import { OPERATING } from "@/lib/data/operating";
import { CAP_ALLOCATION, CAP_POOLS } from "@/lib/data/cap";
import { WORKLOAD } from "@/lib/data/workload";
import { SERVICES } from "@/lib/data/services";
import { POLICY_TARGETS, POLICY_EXCEPTIONS } from "@/lib/data/policy";
import type {
  CapAllocation, CapPool, DeptCode, OperatingLine, PolicyException, PolicyTarget,
  Position, Service, WorkloadRow,
} from "@/lib/types";
import {
  deptLabor, deptOperating, deptFBHR, feeComparisons, policyImpact, serviceCosts,
  type DeptLabor, type DeptOperating, type FBHR, type FeeComparison,
  type PolicyImpact, type ServiceCost,
} from "@/lib/calc";
import type { ExtractionResult, ImportApplyResult, SourceLineage, UnmappedRow } from "@/lib/parse";
import type { ImportBatch, ImportDecision, MappingCandidate, MappingStatus } from "@/lib/import/types";

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

/* ── State & action interfaces ── */

interface BuildState {
  positions: Position[];
  operating: OperatingLine[];
  capAllocation: Record<DeptCode, CapAllocation>;
  capPools: CapPool[];
  workload: WorkloadRow[];
  services: Service[];
  policyTargets: PolicyTarget[];
  policyExceptions: PolicyException[];
  lineage: Record<string, SourceLineage>;
  pendingReview: Record<Domain, UnmappedRow[]>;
  capCenterOrder: string[];
  imports: BuildImportLog[];
  /** The active pipeline batch the UI is reviewing. Null when no import is
   *  in progress. Only one at a time per session. */
  currentBatch: ImportBatch | null;
  /** User decisions on the active batch's mapping candidates, keyed by id. */
  decisions: Record<string, ImportDecision>;
}

interface BuildActions {
  updatePosition: (id: string, patch: Partial<Position>) => void;
  updateOperating: (id: string, patch: Partial<OperatingLine>) => void;
  updateCapAllocation: (dept: DeptCode, allocated: number) => void;
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
  mergePositions: (r: ExtractionResult<Position>, fileName: string) => ImportApplyResult;
  mergeOperating: (r: ExtractionResult<OperatingLine>, fileName: string) => ImportApplyResult;
  mergeServices: (r: ExtractionResult<Service>, fileName: string) => ImportApplyResult;
  mergeFeeSchedule: (r: ExtractionResult<Service>, fileName: string) => ImportApplyResult;
  mergeWorkload: (r: ExtractionResult<WorkloadRow>, fileName: string) => ImportApplyResult;
  mergeCap: (r: ExtractionResult<CapPool>, fileName: string) => ImportApplyResult;
  moveCenter: (name: string, direction: "up" | "down") => void;
  /** Replace the active batch (or clear with null). */
  setCurrentBatch: (batch: ImportBatch | null) => void;
  /** Record a per-candidate decision. status === "rejected" leaves the model
   *  alone; the apply step skips it. */
  decideMapping: (
    mappingCandidateId: string,
    status: MappingStatus,
    override?: Record<string, string | number | boolean | null>,
  ) => void;
  /** Apply every accepted candidate from currentBatch into the target tables,
   *  record lineage, and append an import-log entry. */
  applyCurrentBatch: () => { applied: number; skipped: number };
  resetAll: () => void;
  clearAll: () => void;
  seedUpstream: () => void;
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
  return {
    positions: POSITIONS.map((p) => ({ ...p })),
    operating: OPERATING.map((o) => ({ ...o })),
    capAllocation: {
      PLAN: { ...CAP_ALLOCATION.PLAN },
      BLDG: { ...CAP_ALLOCATION.BLDG },
      ENG:  { ...CAP_ALLOCATION.ENG },
    },
    capPools: pools,
    workload: WORKLOAD.map((w) => ({ ...w })),
    services: SERVICES.map((s) => ({ ...s })),
    policyTargets: POLICY_TARGETS.map((p) => ({ ...p })),
    policyExceptions: POLICY_EXCEPTIONS.map((e) => ({ ...e })),
    lineage: {},
    pendingReview: { ...emptyPending },
    capCenterOrder: defaultCenterOrder(pools),
    imports: [],
    currentBatch: null,
    decisions: {},
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

function coerceDeptCode(v: unknown): DeptCode {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "PLAN" || s === "BLDG" || s === "ENG") return s;
  if (s.startsWith("PLAN")) return "PLAN";
  if (s.startsWith("BUILD") || s.startsWith("BLD")) return "BLDG";
  if (s.startsWith("ENG")) return "ENG";
  return "PLAN";
}

function coerceOpDept(v: unknown): OperatingLine["dept"] {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "PLAN" || s === "BLDG" || s === "ENG") return s;
  if (s.startsWith("SHARED") || s.includes("CDS")) return "SHARED:CDS";
  if (s.startsWith("PLAN")) return "PLAN";
  if (s.startsWith("BUILD") || s.startsWith("BLD")) return "BLDG";
  if (s.startsWith("ENG")) return "ENG";
  return "PLAN";
}

const OP_CATEGORIES: OperatingLine["category"][] = [
  "Software & subscriptions", "Professional services", "Training & travel",
  "Office & supplies", "Memberships & dues", "Vehicles & equipment",
  "Legal noticing", "Capital outlay", "Other",
];

function coerceOpCategory(v: unknown): OperatingLine["category"] {
  const s = String(v ?? "").trim();
  return OP_CATEGORIES.find((c) => c.toLowerCase() === s.toLowerCase()) ?? "Other";
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

/* Apply accepted MappingCandidates from a pipeline batch into the target
 * tables, building lineage for every written row. Returns the partial state
 * object the caller will pass to set(). Currently handles fees / services /
 * positions / cap / workload / operating shapes; unsupported target tables
 * are skipped (logged via "skipped" counter at the caller). */
function applyAccepted(
  state: BuildState,
  accepted: { m: MappingCandidate; entity: Record<string, unknown> }[],
  batch: ImportBatch,
): { state: Partial<BuildState> } {
  let services = state.services;
  let positions = state.positions;
  let operating = state.operating;
  let capPools = state.capPools;
  let workload = state.workload;
  const lineage = { ...state.lineage };
  const at = new Date().toISOString();
  const importLog: BuildImportLog = {
    id: Date.now(),
    domain: "fees",
    result: {
      domain: "fees",
      fileName: batch.sourceFile,
      detected: batch.classification.documentType,
      rows: batch.mappings.length,
      mapped: accepted.length,
      lowConfidence: 0,
      unmapped: batch.mappings.filter((m) => m.status === "unresolved").length,
      duplicates: 0,
      warnings: batch.extracted.parseWarnings,
    },
    at,
  };

  // Find the extracted row for lineage (source file / sheet / page / row).
  const allExtracted = [
    ...batch.extracted.unsectioned,
    ...batch.extracted.sections.flatMap((s) => s.rows),
  ];
  const rowById = new Map(allExtracted.map((r) => [r.id, r]));

  for (const { m, entity } of accepted) {
    const er = rowById.get(m.extractedRowId);
    const target = m.proposedTargetTable;
    if (!target) continue;

    const lineageEntry: SourceLineage = {
      file: er?.source.file ?? batch.sourceFile,
      sheet: er?.source.sheet,
      page: er?.source.page,
      row: er?.source.row,
      rawCells: er ? cellsToRecord(er.rawCells) : undefined,
      confidence: m.confidence >= 0.85 ? "high" : m.confidence >= 0.5 ? "med" : "low",
      importedAt: at,
    };

    if (target === "fees" || target === "services") {
      const name = String(entity.name ?? m.proposedTargetLabel);
      const dept = coerceDeptCode(entity.dept);
      const existing = m.proposedTargetId
        ? services.find((s) => s.id === m.proposedTargetId)
        : services.find((s) => s.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (existing) {
        const patched: Service = {
          ...existing,
          fee: typeof entity.fee === "number" ? entity.fee : existing.fee,
          peer: typeof entity.peer === "number" ? entity.peer : existing.peer,
          target: typeof entity.target === "number" ? entity.target : existing.target,
        };
        services = services.map((s) => s.id === existing.id ? patched : s);
        lineage[existing.id] = lineageEntry;
      } else {
        const id = `svc-imp-${m.id}`;
        const created: Service = {
          id, name,
          dept,
          volume: Number(entity.volume ?? 0) || 0,
          hours: Number(entity.hours ?? 0) || 0,
          cost: 0,
          fee: Number(entity.fee ?? 0) || 0,
          peer: Number(entity.peer ?? 0) || 0,
          target: Number(entity.target ?? 100) || 100,
        };
        services = [...services, created];
        lineage[id] = lineageEntry;
      }
    } else if (target === "positions") {
      const id = `pos-imp-${m.id}`;
      const created: Position = {
        id,
        title: String(entity.title ?? m.proposedTargetLabel),
        dept: coerceDeptCode(entity.dept),
        fte: Number(entity.fte ?? 1) || 1,
        salary: Number(entity.salary ?? 0) || 0,
        benefits: Number(entity.benefits ?? 0) || 0,
        hours: Number(entity.hours ?? 1720) || 1720,
      };
      positions = [...positions, created];
      lineage[id] = lineageEntry;
    } else if (target === "operating") {
      const id = `OP-IMP-${m.id}`;
      const created: OperatingLine = {
        id,
        code: String(entity.accountCode ?? entity.code ?? ""),
        line: String(entity.line ?? entity.accountName ?? m.proposedTargetLabel),
        dept: coerceOpDept(entity.dept),
        category: coerceOpCategory(entity.category),
        amount: Number(entity.amount ?? 0) || 0,
        source: `Import · ${batch.sourceFile}`,
        include: entity.include === false || entity.includeInCostOfService === "no" ? false : true,
      };
      operating = [...operating, created];
      lineage[id] = lineageEntry;
    } else if (target === "cap") {
      const id = `cap-imp-${m.id}`;
      const created: CapPool = {
        id,
        center: String(entity.sourceDepartment ?? entity.center ?? ""),
        pool: String(entity.poolName ?? entity.pool ?? m.proposedTargetLabel),
        amount: Number(entity.allocatedAmount ?? entity.amount ?? 0) || 0,
        basis: String(entity.allocationBasis ?? entity.basis ?? "FY budgeted"),
        receiving: String(entity.targetDepartment ?? "Multiple departments"),
        recoverability: String(entity.recoverability ?? "Partially recoverable"),
        review: "Reviewed",
      };
      capPools = [...capPools, created];
      lineage[id] = lineageEntry;
    } else if (target === "workload") {
      const name = String(entity.name ?? entity.serviceName ?? m.proposedTargetLabel);
      const matched = m.proposedTargetId
        ? services.find((s) => s.id === m.proposedTargetId)
        : services.find((s) => s.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (!matched) continue; // can't write workload without a parent service
      const rowId = matched.id;
      const existing = workload.find((w) => w.id === rowId);
      const merged: WorkloadRow = {
        id: rowId,
        current: Number(entity.current ?? entity.currentVolume ?? existing?.current ?? 0),
        prior: entity.prior != null || entity.priorVolume != null
          ? Number(entity.prior ?? entity.priorVolume)
          : (existing?.prior ?? null),
        unit: String(entity.unit ?? existing?.unit ?? "Item"),
        source: "imported",
        status: "Imported",
        sourceFile: batch.sourceFile,
      };
      workload = existing
        ? workload.map((w) => w.id === rowId ? merged : w)
        : [...workload, merged];
      lineage[rowId] = lineageEntry;
    }
  }

  return {
    state: {
      services, positions, operating, capPools, workload,
      lineage,
      imports: [...state.imports, importLog],
    },
  };
}

function cellsToRecord(cells: (string | number | null)[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  cells.forEach((c, i) => { out[`c${i}`] = c; });
  return out;
}

/* ── Zustand store ── */

const STORAGE_KEY = "afferent.build.v1";

export const useBuildStore = create<BuildState & BuildActions>()(
  persist(
    (set, get) => ({
      ...initialState(),

      updatePosition: (id, patch) =>
        set((s) => ({ positions: s.positions.map((p) => p.id === id ? { ...p, ...patch } : p) })),

      updateOperating: (id, patch) =>
        set((s) => ({ operating: s.operating.map((o) => o.id === id ? { ...o, ...patch } : o) })),

      updateCapAllocation: (dept, allocated) =>
        set((s) => ({
          capAllocation: { ...s.capAllocation, [dept]: { dept, allocated: Math.max(0, allocated) } },
        })),

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
              volume: 0, hours: 0, cost: 0, fee: 0, peer: 0, target: 100 },
          ],
        })),

      addPosition: () =>
        set((s) => ({
          positions: [
            ...s.positions,
            { id: `pos-${Date.now()}`, title: "New position", dept: "PLAN",
              fte: 1, salary: 0, benefits: 0, hours: 1720 },
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
            { id: `cap-${Date.now()}`, center, pool: "New pool", amount: 0,
              basis: "", receiving: "All depts", recoverability: "TBD", review: "Review" },
          ],
        })),

      addCapCenter: () =>
        set((s) => {
          const name = "New Cost Center";
          return {
            capPools: [
              ...s.capPools,
              { id: `cap-${Date.now()}`, center: name, pool: "New pool", amount: 0,
                basis: "", receiving: "All depts", recoverability: "TBD", review: "Review" },
            ],
            capCenterOrder: s.capCenterOrder.includes(name)
              ? s.capCenterOrder
              : [...s.capCenterOrder, name],
          };
        }),

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

      mergeCap: (r, fileName) => {
        const result = toApplyResult("cap", fileName, r);
        set((s) => {
          const { merged, lineagePatch } = mergeRows(s.capPools, r);
          return {
            capPools: merged,
            lineage: { ...s.lineage, ...lineagePatch },
            pendingReview: { ...s.pendingReview, cap: [...s.pendingReview.cap, ...r.unmapped] },
            imports: [...s.imports, { id: Date.now(), domain: "cap", result, at: new Date().toISOString() }],
          };
        });
        return result;
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

      setCurrentBatch: (batch) => set(() => {
        if (!batch) return { currentBatch: null, decisions: {} };
        // Seed decisions from the candidate statuses — auto_accepted ones
        // are pre-decided so the user can apply immediately.
        const seeded: Record<string, ImportDecision> = {};
        const at = new Date().toISOString();
        for (const m of batch.mappings) {
          if (m.status === "auto_accepted") {
            seeded[m.id] = { mappingCandidateId: m.id, status: "auto_accepted", decidedAt: at };
          }
        }
        return { currentBatch: batch, decisions: seeded };
      }),

      decideMapping: (mappingCandidateId, status, override) =>
        set((s) => ({
          decisions: {
            ...s.decisions,
            [mappingCandidateId]: {
              mappingCandidateId, status,
              override,
              decidedAt: new Date().toISOString(),
            },
          },
        })),

      applyCurrentBatch: () => {
        const { currentBatch: batch, decisions } = get();
        if (!batch) return { applied: 0, skipped: 0 };
        const accepted: { m: MappingCandidate; entity: Record<string, unknown> }[] = [];
        let skipped = 0;
        for (const m of batch.mappings) {
          const d = decisions[m.id];
          if (!d || (d.status !== "auto_accepted" && d.status !== "accepted_after_edit")) {
            skipped += 1; continue;
          }
          accepted.push({
            m,
            entity: { ...(m.proposedEntity as Record<string, unknown>), ...(d.override ?? {}) },
          });
        }
        if (accepted.length === 0) return { applied: 0, skipped };

        const result = applyAccepted(get(), accepted, batch);
        set(result.state);
        return { applied: accepted.length, skipped };
      },

      resetAll: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        set(initialState());
      },

      seedUpstream: () => {
        const pools = CAP_POOLS.map((p) => ({ ...p }));
        set({
          positions: POSITIONS.map((p) => ({ ...p })),
          operating: OPERATING.map((o) => ({ ...o })),
          capAllocation: {
            PLAN: { ...CAP_ALLOCATION.PLAN },
            BLDG: { ...CAP_ALLOCATION.BLDG },
            ENG:  { ...CAP_ALLOCATION.ENG },
          },
          capPools: pools,
          capCenterOrder: defaultCenterOrder(pools),
        });
      },

      clearAll: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        set({
          positions: [],
          operating: [],
          capPools: [],
          capAllocation: {
            PLAN: { dept: "PLAN", allocated: 0 },
            BLDG: { dept: "BLDG", allocated: 0 },
            ENG:  { dept: "ENG",  allocated: 0 },
          },
          workload: [],
          services: [],
          policyTargets: [],
          policyExceptions: [],
          lineage: {},
          pendingReview: { ...emptyPending },
          capCenterOrder: [],
          imports: [],
        });
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        if (state && (!state.capCenterOrder || state.capCenterOrder.length === 0)) {
          state.capCenterOrder = defaultCenterOrder(state.capPools ?? []);
        }
      },
    },
  ),
);

/* ── Derived types ── */

export interface BuildDerived {
  labor: Record<DeptCode, DeptLabor>;
  operatingByDept: Record<DeptCode, DeptOperating>;
  fbhr: Record<DeptCode, FBHR>;
  costs: ServiceCost[];
  comparisons: FeeComparison[];
  impact: PolicyImpact;
}

/* ── Drop-in hook — identical return shape to the old BuildContext ── */

export function useBuildState() {
  const state = useBuildStore();

  const derived: BuildDerived = useMemo(() => {
    const labor = deptLabor(state.positions);
    const hoursByDept: Record<DeptCode, number> = {
      PLAN: labor.PLAN.productiveHours,
      BLDG: labor.BLDG.productiveHours,
      ENG:  labor.ENG.productiveHours,
    };
    const operatingByDept = deptOperating(state.operating, hoursByDept);
    const fbhr = deptFBHR(labor, operatingByDept, state.capAllocation);
    const costs = serviceCosts(state.services, fbhr);
    const comparisons = feeComparisons(
      costs, state.services, state.policyTargets, state.policyExceptions,
    );
    const impact = policyImpact(comparisons);
    return { labor, operatingByDept, fbhr, costs, comparisons, impact };
  }, [
    state.positions, state.operating, state.capAllocation,
    state.services, state.policyTargets, state.policyExceptions,
  ]);

  const lineageFor = (id: string) => state.lineage[id];

  return { ...state, derived, lineageFor };
}
