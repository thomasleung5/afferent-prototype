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
import type { AiSuggestion } from "@/lib/ai/types";

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
  aiSuggestions: Record<Domain, AiSuggestion[]>;
  aiStatus: Record<Domain, { running: boolean; message?: string }>;
  capCenterOrder: string[];
  imports: BuildImportLog[];
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
  mergePositions: (r: ExtractionResult<Position>, fileName: string) => ImportApplyResult;
  mergeOperating: (r: ExtractionResult<OperatingLine>, fileName: string) => ImportApplyResult;
  mergeServices: (r: ExtractionResult<Service>, fileName: string) => ImportApplyResult;
  mergeFeeSchedule: (r: ExtractionResult<Service>, fileName: string) => ImportApplyResult;
  mergeWorkload: (r: ExtractionResult<WorkloadRow>, fileName: string) => ImportApplyResult;
  mergeCap: (r: ExtractionResult<CapPool>, fileName: string) => ImportApplyResult;
  dismissUnmapped: (domain: Domain, index: number) => void;
  clearReview: (domain: Domain) => void;
  setAiStatus: (domain: Domain, status: { running: boolean; message?: string }) => void;
  addAiSuggestions: (domain: Domain, items: AiSuggestion[]) => void;
  acceptAiSuggestion: (domain: Domain, id: string, override?: Partial<AiSuggestion["entity"]>) => void;
  rejectAiSuggestion: (domain: Domain, id: string) => void;
  moveCenter: (name: string, direction: "up" | "down") => void;
  resetAll: () => void;
}

/* ── Helpers ── */

const emptyPending: Record<Domain, UnmappedRow[]> = {
  positions: [], operating: [], services: [], fees: [], workload: [], cap: [],
};
const emptyAi: Record<Domain, AiSuggestion[]> = {
  positions: [], operating: [], services: [], fees: [], workload: [], cap: [],
};
const emptyAiStatus: Record<Domain, { running: boolean; message?: string }> = {
  positions: { running: false }, operating: { running: false }, services: { running: false },
  fees: { running: false }, workload: { running: false }, cap: { running: false },
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
    aiSuggestions: { ...emptyAi },
    aiStatus: { ...emptyAiStatus },
    capCenterOrder: defaultCenterOrder(pools),
    imports: [],
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

      dismissUnmapped: (domain, index) =>
        set((s) => ({
          pendingReview: {
            ...s.pendingReview,
            [domain]: s.pendingReview[domain].filter((_, i) => i !== index),
          },
        })),

      clearReview: (domain) =>
        set((s) => ({ pendingReview: { ...s.pendingReview, [domain]: [] } })),

      setAiStatus: (domain, status) =>
        set((s) => ({ aiStatus: { ...s.aiStatus, [domain]: status } })),

      addAiSuggestions: (domain, items) => {
        if (items.length === 0) return;
        set((s) => ({
          aiSuggestions: { ...s.aiSuggestions, [domain]: [...s.aiSuggestions[domain], ...items] },
        }));
      },

      acceptAiSuggestion: (domain, id, override) => {
        set((s) => {
          const suggestion = s.aiSuggestions[domain].find((x) => x.id === id);
          if (!suggestion) return s;
          const entity = { ...suggestion.entity, ...(override ?? {}) };
          const lineage: SourceLineage = {
            ...suggestion.lineage,
            confidence: suggestion.confidence,
            importedAt: new Date().toISOString(),
          };

          let next: Partial<BuildState> = {};
          switch (domain) {
            case "positions": {
              const rowId = `pos-ai-${id}`;
              const row: Position = {
                id: rowId,
                title: String(entity.title ?? suggestion.label ?? "Imported position"),
                dept: coerceDeptCode(entity.dept),
                fte: Number(entity.fte ?? 1) || 1,
                salary: Number(entity.salary ?? 0) || 0,
                benefits: Number(entity.benefits ?? 0) || 0,
                hours: Number(entity.hours ?? 1720) || 1720,
              };
              next = { positions: [...s.positions, row], lineage: { ...s.lineage, [rowId]: lineage } };
              break;
            }
            case "operating": {
              const rowId = `OP-AI-${id}`;
              const row: OperatingLine = {
                id: rowId,
                code: String(entity.code ?? ""),
                line: String(entity.line ?? suggestion.label ?? "Imported line"),
                dept: coerceOpDept(entity.dept),
                category: coerceOpCategory(entity.category),
                amount: Number(entity.amount ?? 0) || 0,
                source: `AI · ${suggestion.lineage.file}`,
                include: entity.include === false ? false : true,
              };
              next = { operating: [...s.operating, row], lineage: { ...s.lineage, [rowId]: lineage } };
              break;
            }
            case "services":
            case "fees": {
              const existingByName = new Map(s.services.map((sv) => [sv.name.toLowerCase().trim(), sv]));
              const name = String(entity.name ?? suggestion.label ?? "Imported service");
              const existing = existingByName.get(name.toLowerCase().trim());
              const merged: Service = existing
                ? {
                    ...existing,
                    fee: Number(entity.fee ?? existing.fee),
                    peer: Number(entity.peer ?? existing.peer),
                    target: Number(entity.target ?? existing.target),
                    ...(entity.hours != null ? { hours: Number(entity.hours) } : {}),
                    ...(entity.volume != null ? { volume: Number(entity.volume) } : {}),
                  }
                : {
                    id: `svc-ai-${id}`,
                    name,
                    dept: coerceDeptCode(entity.dept),
                    hours: Number(entity.hours ?? 0) || 0,
                    volume: Number(entity.volume ?? 0) || 0,
                    cost: 0,
                    fee: Number(entity.fee ?? 0) || 0,
                    peer: Number(entity.peer ?? 0) || 0,
                    target: Number(entity.target ?? 100) || 100,
                  };
              const services = existing
                ? s.services.map((sv) => sv.id === existing.id ? merged : sv)
                : [...s.services, merged];
              next = { services, lineage: { ...s.lineage, [merged.id]: lineage } };
              break;
            }
            case "workload": {
              const name = String(entity.name ?? suggestion.label ?? "");
              const matchedService = s.services.find(
                (sv) => sv.name.toLowerCase().trim() === name.toLowerCase().trim(),
              );
              if (!matchedService) return s;
              const rowId = matchedService.id;
              const existing = s.workload.find((w) => w.id === rowId);
              const merged: WorkloadRow = {
                id: rowId,
                current: Number(entity.current ?? existing?.current ?? 0),
                prior: entity.prior != null ? Number(entity.prior) : (existing?.prior ?? null),
                unit: String(entity.unit ?? existing?.unit ?? "Item"),
                source: "imported",
                status: "Imported",
                sourceFile: suggestion.lineage.file,
              };
              next = {
                workload: existing
                  ? s.workload.map((w) => w.id === rowId ? merged : w)
                  : [...s.workload, merged],
                lineage: { ...s.lineage, [rowId]: lineage },
              };
              break;
            }
            case "cap": {
              const rowId = `cap-ai-${id}`;
              const row: CapPool = {
                id: rowId,
                center: String(entity.center ?? ""),
                pool: String(entity.pool ?? suggestion.label ?? "Imported pool"),
                amount: Number(entity.amount ?? 0),
                basis: String(entity.basis ?? "FY budgeted"),
                receiving: "Multiple departments",
                recoverability: String(entity.recoverability ?? "Partially recoverable"),
                review: "Reviewed",
              };
              next = { capPools: [...s.capPools, row], lineage: { ...s.lineage, [rowId]: lineage } };
              break;
            }
          }

          return {
            ...s, ...next,
            aiSuggestions: {
              ...s.aiSuggestions,
              [domain]: s.aiSuggestions[domain].filter((x) => x.id !== id),
            },
            pendingReview: {
              ...s.pendingReview,
              [domain]: s.pendingReview[domain].filter((_, i) => i !== suggestion.sourceIndex),
            },
          };
        });
      },

      rejectAiSuggestion: (domain, id) =>
        set((s) => ({
          aiSuggestions: { ...s.aiSuggestions, [domain]: s.aiSuggestions[domain].filter((x) => x.id !== id) },
        })),

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

      resetAll: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        set(initialState());
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
      state.services, fbhr, state.policyTargets, state.policyExceptions,
    );
    const impact = policyImpact(
      state.services, fbhr, state.policyTargets, state.policyExceptions,
    );
    return { labor, operatingByDept, fbhr, costs, comparisons, impact };
  }, [
    state.positions, state.operating, state.capAllocation,
    state.services, state.policyTargets, state.policyExceptions,
  ]);

  const lineageFor = (id: string) => state.lineage[id];

  return { ...state, derived, lineageFor };
}
