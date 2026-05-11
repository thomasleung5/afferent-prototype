"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
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
  deptLabor, deptOperating, deptFBHR, feeComparisons, policyImpact,
  serviceCosts,
  type DeptLabor, type DeptOperating, type FBHR, type FeeComparison,
  type PolicyImpact, type ServiceCost,
} from "@/lib/calc";
import type {
  ExtractionResult, ImportApplyResult, SourceLineage, UnmappedRow,
} from "@/lib/parse";
import type { AiSuggestion } from "@/lib/ai/types";

export type Domain =
  | "positions" | "operating" | "services"
  | "fees" | "workload" | "cap";

export interface BuildImportLog {
  id: number;
  domain: Domain;
  result: ImportApplyResult;
  at: string;
}

interface BuildState {
  positions: Position[];
  operating: OperatingLine[];
  capAllocation: Record<DeptCode, CapAllocation>;
  capPools: CapPool[];
  workload: WorkloadRow[];
  services: Service[];
  policyTargets: PolicyTarget[];
  policyExceptions: PolicyException[];
  /** Per-row source attribution keyed by id. */
  lineage: Record<string, SourceLineage>;
  /** Rows that couldn't be auto-mapped, grouped by domain. */
  pendingReview: Record<Domain, UnmappedRow[]>;
  /** AI-suggested mappings awaiting user approval, grouped by domain. */
  aiSuggestions: Record<Domain, AiSuggestion[]>;
  /** Per-domain status of the most recent AI assist call. */
  aiStatus: Record<Domain, { running: boolean; message?: string }>;
  /** Ordered list of cost-center names that drives the step-down sequence on
   *  the Cost Allocation screen. Defaults to amount-desc, persisted across
   *  reorder via the moveCenter action. */
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

interface BuildDerived {
  labor: Record<DeptCode, DeptLabor>;
  operatingByDept: Record<DeptCode, DeptOperating>;
  fbhr: Record<DeptCode, FBHR>;
  costs: ServiceCost[];
  comparisons: FeeComparison[];
  impact: PolicyImpact;
}

type Ctx = BuildState & BuildActions & {
  derived: BuildDerived;
  /** Helper: look up the source-of-record for a given row id. */
  lineageFor: (id: string) => SourceLineage | undefined;
};

const BuildCtx = createContext<Ctx | null>(null);

const emptyPending: Record<Domain, UnmappedRow[]> = {
  positions: [], operating: [], services: [],
  fees: [], workload: [], cap: [],
};
const emptyAi: Record<Domain, AiSuggestion[]> = {
  positions: [], operating: [], services: [],
  fees: [], workload: [], cap: [],
};
const emptyAiStatus: Record<Domain, { running: boolean; message?: string }> = {
  positions: { running: false }, operating: { running: false }, services: { running: false },
  fees: { running: false }, workload: { running: false }, cap: { running: false },
};

/** Default cost-center order — amount descending, with stable name fallback.
 *  Used to seed `capCenterOrder` and to backfill it if the persisted snapshot
 *  was written before this slice existed. */
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

/** Merge new entities onto an existing list by id. Mapped + lowConfidence rows
 *  with new ids get appended; duplicates patch the matching record. */
function mergeRows<T extends { id: string }>(
  existing: T[],
  result: ExtractionResult<T>,
): { merged: T[]; lineagePatch: Record<string, SourceLineage> } {
  const lineagePatch: Record<string, SourceLineage> = {};
  const byId = new Map(existing.map((r) => [r.id, r]));

  // Duplicates patch in place
  for (const { entity, lineage } of result.duplicates) {
    byId.set(entity.id, { ...byId.get(entity.id)!, ...entity });
    lineagePatch[entity.id] = lineage;
  }
  // Mapped rows append (or patch if id collides for some reason)
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

/** Map any string-ish value to a valid Position/Service dept code. Defaults
 *  to "PLAN" so a row with a bad dept still lands in the table — the user can
 *  re-pick it via the editable cell. Without this, calc.deptLabor would crash. */
function coerceDeptCode(v: unknown): DeptCode {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "PLAN" || s === "BLDG" || s === "ENG") return s;
  // Common aliases the AI sometimes returns when the source file uses a
  // full or abbreviated name.
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
  return (OP_CATEGORIES.find((c) => c.toLowerCase() === s.toLowerCase()) ?? "Other");
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

const STORAGE_KEY = "afferent.build.v1";

/** Hydrate from localStorage so a new tab (e.g. /export/fee-study) sees the
 *  current model state. State is written on every change. */
function readPersisted(): BuildState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BuildState;
  } catch {
    return null;
  }
}

function writePersisted(state: BuildState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — silently skip; in-memory state still works */
  }
}

function clearPersisted(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function BuildProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BuildState>(initialState);
  const hydratedRef = useRef(false);

  // First-mount: replace state with persisted snapshot if one exists.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const persisted = readPersisted();
    if (persisted) {
      // Backfill any state slices added after the snapshot was written.
      if (!persisted.capCenterOrder || persisted.capCenterOrder.length === 0) {
        persisted.capCenterOrder = defaultCenterOrder(persisted.capPools ?? []);
      }
      setState(persisted);
    }
  }, []);

  // Write on every change, but only after first hydration completes.
  useEffect(() => {
    if (!hydratedRef.current) return;
    writePersisted(state);
  }, [state]);

  const updatePosition = useCallback((id: string, patch: Partial<Position>) => {
    setState((s) => ({ ...s, positions: s.positions.map((p) => p.id === id ? { ...p, ...patch } : p) }));
  }, []);
  const updateOperating = useCallback((id: string, patch: Partial<OperatingLine>) => {
    setState((s) => ({ ...s, operating: s.operating.map((o) => o.id === id ? { ...o, ...patch } : o) }));
  }, []);
  const updateCapAllocation = useCallback((dept: DeptCode, allocated: number) => {
    setState((s) => ({
      ...s,
      capAllocation: { ...s.capAllocation, [dept]: { dept, allocated: Math.max(0, allocated) } },
    }));
  }, []);
  const updateWorkload = useCallback((id: string, patch: Partial<WorkloadRow>) => {
    setState((s) => ({ ...s, workload: s.workload.map((w) => w.id === id ? { ...w, ...patch } : w) }));
  }, []);
  const updateService = useCallback((id: string, patch: Partial<Service>) => {
    setState((s) => ({ ...s, services: s.services.map((sv) => sv.id === id ? { ...sv, ...patch } : sv) }));
  }, []);
  const updatePolicyTarget = useCallback((id: string, patch: Partial<PolicyTarget>) => {
    setState((s) => ({ ...s, policyTargets: s.policyTargets.map((t) => t.id === id ? { ...t, ...patch } : t) }));
  }, []);
  const updatePolicyException = useCallback((id: string, patch: Partial<PolicyException>) => {
    setState((s) => ({ ...s, policyExceptions: s.policyExceptions.map((e) => e.id === id ? { ...e, ...patch } : e) }));
  }, []);
  const addPolicyException = useCallback(() => {
    setState((s) => ({
      ...s,
      policyExceptions: [
        ...s.policyExceptions,
        { id: `exc-${Date.now()}`, fee: "New fee exception", target: 50, note: "" },
      ],
    }));
  }, []);
  const removePolicyException = useCallback((id: string) => {
    setState((s) => ({ ...s, policyExceptions: s.policyExceptions.filter((e) => e.id !== id) }));
  }, []);

  const applyMerge = useCallback(<T extends { id: string }>(
    domain: Domain,
    fileName: string,
    selector: (s: BuildState) => T[],
    setter: (s: BuildState, next: T[]) => BuildState,
    result: ExtractionResult<T>,
  ): ImportApplyResult => {
    const r = toApplyResult(domain, fileName, result);
    setState((s) => {
      const { merged, lineagePatch } = mergeRows(selector(s), result);
      return setter(
        {
          ...s,
          lineage: { ...s.lineage, ...lineagePatch },
          pendingReview: {
            ...s.pendingReview,
            [domain]: [...s.pendingReview[domain], ...result.unmapped],
          },
          imports: [
            ...s.imports,
            { id: Date.now(), domain, result: r, at: new Date().toISOString() },
          ],
        },
        merged,
      );
    });
    return r;
  }, []);

  const mergePositions = useCallback(
    (r: ExtractionResult<Position>, fileName: string) =>
      applyMerge<Position>(
        "positions", fileName,
        (s) => s.positions, (s, next) => ({ ...s, positions: next }),
        r,
      ),
    [applyMerge],
  );

  const mergeOperating = useCallback(
    (r: ExtractionResult<OperatingLine>, fileName: string) =>
      applyMerge<OperatingLine>(
        "operating", fileName,
        (s) => s.operating, (s, next) => ({ ...s, operating: next }),
        r,
      ),
    [applyMerge],
  );

  const mergeServices = useCallback(
    (r: ExtractionResult<Service>, fileName: string) =>
      applyMerge<Service>(
        "services", fileName,
        (s) => s.services, (s, next) => ({ ...s, services: next }),
        r,
      ),
    [applyMerge],
  );

  const mergeFeeSchedule = useCallback(
    (r: ExtractionResult<Service>, fileName: string) =>
      applyMerge<Service>(
        "fees", fileName,
        (s) => s.services, (s, next) => ({ ...s, services: next }),
        r,
      ),
    [applyMerge],
  );

  const mergeWorkload = useCallback(
    (r: ExtractionResult<WorkloadRow>, fileName: string) =>
      applyMerge<WorkloadRow>(
        "workload", fileName,
        (s) => s.workload, (s, next) => ({ ...s, workload: next }),
        r,
      ),
    [applyMerge],
  );

  const mergeCap = useCallback(
    (r: ExtractionResult<CapPool>, fileName: string) =>
      applyMerge<CapPool>(
        "cap", fileName,
        (s) => s.capPools, (s, next) => ({ ...s, capPools: next }),
        r,
      ),
    [applyMerge],
  );

  const dismissUnmapped = useCallback((domain: Domain, index: number) => {
    setState((s) => ({
      ...s,
      pendingReview: {
        ...s.pendingReview,
        [domain]: s.pendingReview[domain].filter((_, i) => i !== index),
      },
    }));
  }, []);

  const clearReview = useCallback((domain: Domain) => {
    setState((s) => ({
      ...s,
      pendingReview: { ...s.pendingReview, [domain]: [] },
    }));
  }, []);

  const setAiStatus = useCallback((domain: Domain, status: { running: boolean; message?: string }) => {
    setState((s) => ({ ...s, aiStatus: { ...s.aiStatus, [domain]: status } }));
  }, []);

  const addAiSuggestions = useCallback((domain: Domain, items: AiSuggestion[]) => {
    if (items.length === 0) return;
    setState((s) => ({
      ...s,
      aiSuggestions: {
        ...s.aiSuggestions,
        [domain]: [...s.aiSuggestions[domain], ...items],
      },
    }));
  }, []);

  /** Accept a suggestion: merge its entity into the appropriate domain list,
   *  write lineage with the AI confidence, and drop both the suggestion and
   *  its source unmapped row. `override` lets the reviewer edit fields before
   *  approving. */
  const acceptAiSuggestion = useCallback((
    domain: Domain,
    id: string,
    override?: Partial<AiSuggestion["entity"]>,
  ) => {
    setState((s) => {
      const suggestion = s.aiSuggestions[domain].find((x) => x.id === id);
      if (!suggestion) return s;
      const entity = { ...suggestion.entity, ...(override ?? {}) };
      const lineage: SourceLineage = {
        ...suggestion.lineage,
        confidence: suggestion.confidence,
        importedAt: new Date().toISOString(),
      };

      // Each domain has its own row shape — build the merged list per case.
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
          const existingByName = new Map(
            s.services.map((sv) => [sv.name.toLowerCase().trim(), sv]),
          );
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
          if (!matchedService) return s; // unmappable — leave suggestion in place
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
  }, []);

  const rejectAiSuggestion = useCallback((domain: Domain, id: string) => {
    setState((s) => ({
      ...s,
      aiSuggestions: {
        ...s.aiSuggestions,
        [domain]: s.aiSuggestions[domain].filter((x) => x.id !== id),
      },
    }));
  }, []);

  const moveCenter = useCallback((name: string, direction: "up" | "down") => {
    setState((s) => {
      // If a new pool's center was added since the order was set, slot it in
      // at the natural position instead of dropping the move.
      const known = new Set(s.capCenterOrder);
      const missing = [...new Set(s.capPools.map((p) => p.center))]
        .filter((c) => !known.has(c));
      const base = [...s.capCenterOrder, ...missing];
      const idx = base.indexOf(name);
      if (idx < 0) return s;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= base.length) return s;
      const next = [...base];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return { ...s, capCenterOrder: next };
    });
  }, []);

  const resetAll = useCallback(() => {
    clearPersisted();
    setState(initialState());
  }, []);

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

  const lineageFor = useCallback(
    (id: string) => state.lineage[id], [state.lineage],
  );

  const value: Ctx = {
    ...state, derived, lineageFor,
    updatePosition, updateOperating, updateCapAllocation,
    updateWorkload, updateService, updatePolicyTarget, updatePolicyException,
    addPolicyException, removePolicyException,
    mergePositions, mergeOperating, mergeServices, mergeFeeSchedule,
    mergeWorkload, mergeCap,
    dismissUnmapped, clearReview,
    setAiStatus, addAiSuggestions, acceptAiSuggestion, rejectAiSuggestion,
    moveCenter,
    resetAll,
  };

  return <BuildCtx.Provider value={value}>{children}</BuildCtx.Provider>;
}

export function useBuildState(): Ctx {
  const ctx = useContext(BuildCtx);
  if (!ctx) throw new Error("useBuildState must be used inside <BuildProvider>");
  return ctx;
}
