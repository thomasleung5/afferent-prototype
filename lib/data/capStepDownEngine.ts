/* glCode-native CAP step-down engine.
 *
 * STRICT glCode routing: every allocation flow routes through a node.key
 * (which IS the node's glCode). deptCode survives ONLY as classification
 * metadata — it never determines a routing destination:
 *   - feeDept tags direct nodes for FBHR roll-up (sum by classification).
 *   - classification labels nodes for display / debug.
 *
 * Routing model:
 *   - Imported direct receiver → real glCode is the node.key.
 *   - Imported indirect center → imported glCode (or synth seed:center:*
 *     for centers that never had a glCode imported) is the node.key.
 *   - Synth direct nodes for PLAN/BLDG/ENG are created so the seed CAP
 *     state has somewhere to land before any import — they hold seeded
 *     DRIVERS values used by the basis-unit fallback path for pools
 *     whose basisId points at a basis with no imported BasisUnitRow.
 *     Their node.key is a stable synth glCode (seed:dept:PLAN etc.).
 *   - Non-DIRECT pools share a per-basis BasisUnitRow — receiver percents
 *     are derived as `units / Σ units across the basis schedule`.
 *     One schedule serves every pool with the same basisId; receivers
 *     are counted ONCE per basis (never per pool).
 *   - DIRECT-basis pools route via their explicit DirectAllocationRow —
 *     each receiver has a glCode + percent. No deptCode fallback. If a
 *     DIRECT pool has no DirectAllocationRow (or no valid receivers),
 *     its $ leaks and the pool is surfaced in model.diagnostics for
 *     review tooling. */

import type {
  AllocationBasis, BasisKey, BasisUnitRow, CapPool, DeptCode,
  DirectAllocationRow, InstDeptCode,
} from "../types";
import {
  basisForPool, DRIVERS,
} from "./capStepDown";
import { INST_DEPTS, INDIRECT_CODE_BY_NAME } from "./institutionalDepts";
import type { ReceiverEntry } from "./capReceiverRegistry";

/** Internal per-pool per-receiver share derived from the pool's basis
 *  schedule (for non-DIRECT pools) or its DirectAllocationRow (for
 *  DIRECT pools). Computed once per (engine build) and reused across
 *  Phase 1 + Phase 2. */
interface PoolSchedule {
  receivers: { glCode: string; percent: number }[];
}

import { FEE_DEPTS } from "./departments";
const FEE_DEPT_SET = new Set<string>(FEE_DEPTS);

/** Stable synth glCode used for PLAN/BLDG/ENG direct nodes when no
 *  imported receiver covers a fee dept. These nodes exist to hold seeded
 *  DRIVERS values for the driver-unit fallback; they are NOT a routing
 *  fallback in the deptCode sense — the engine routes via node.key
 *  (the synth glCode). */
const seedDeptKey = (deptCode: DeptCode) => `seed:dept:${deptCode}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeKey = string;

export interface GlNode {
  key: NodeKey;
  /** Same as `key` — synth seed keys also count as the node's glCode. */
  glCode: string;
  name: string;
  role: "indirect" | "direct";
  /** PLAN/BLDG/ENG when role = direct; classification metadata used by
   *  FBHR roll-up (sum direct totals by feeDept). Never used for routing
   *  decisions inside the engine. */
  feeDept?: DeptCode;
  /** Underlying InstDeptCode classification — display/debug only. */
  classification?: InstDeptCode | "OTHER";
}

export type GlDriverMatrix = Record<NodeKey, Partial<Record<BasisKey, number>>>;

interface GlEngineGraph {
  nodes: GlNode[];
  drivers: GlDriverMatrix;
  /** centerName → indirect node key. Used by stepOrder construction in
   *  computeStepDownGl (centerOrder is still name-keyed). Pool home
   *  resolution should use resolvePoolHome instead so glCode-stamped
   *  pools route via glCode. */
  resolveCenterNode: (centerName: string) => NodeKey | undefined;
  /** Pool → indirect node key. Prefers pool.centerGlCode (glCode → node
   *  via the centerNodeByGlCode index) and falls back to pool.center
   *  (name → node via indirectNodeByCenter). The glCode path is the
   *  load-bearing routing identity; the name path is the legacy
   *  fallback for pools whose centerGlCode wasn't backfilled (manually-
   *  added centers, etc.). */
  resolvePoolHome: (pool: CapPool) => NodeKey | undefined;
}

/** Per-pool diagnostic surfaced when the engine can't route a pool's
 *  net allocable $ to any node — typically a DIRECT pool whose receivers
 *  list is empty or all-zero-glCode. Review tooling can render these
 *  for the user to fix. */
interface PoolDiagnostic {
  poolId: string;
  center: string;
  pool: string;
  kind: "no-receivers" | "no-valid-glcodes" | "zero-percent-receivers";
  amount: number;
  message: string;
}

export interface GlStepDownModel {
  /** Per-pool distribution after sequential closure. Each pool row shows
   *  what THAT pool distributed to each receiver via its own schedule —
   *  pool's own eligible + pool's share of any incoming $ at its home
   *  center. Matches the standard per-pool "Allocation Detail" attribution.
   *  Σ over pools of alloc2[*][node] = total $ landing on the node. */
  alloc2: Record<string, Record<NodeKey, number>>;
  /** Per-pool gross first-round allocation — pool's own eligible × receiver
   *  percent, BEFORE any direct-bill carve-out. This is the published
   *  "Gross Allocation" column. firstAllocation = grossAllocation −
   *  directBillAllocation per (pool, receiver). */
  grossAllocation: Record<string, Record<NodeKey, number>>;
  /** Per-pool direct-bill carve-out, sourced from BuildState.directBills.
   *  Subtracted from grossAllocation to produce firstAllocation; rolled
   *  into alloc2 so totals still reconcile to the receiver. */
  directBillAllocation: Record<string, Record<NodeKey, number>>;
  /** Per-pool First Allocation — pool's own eligible × receiver percent,
   *  MINUS the per-receiver direct-bill amount. Matches the "First
   *  Allocation" column on a CAP PDF (post-direct-bill). */
  firstAllocation: Record<string, Record<NodeKey, number>>;
  /** Per-pool Second Allocation — pool's share of upstream incoming at
   *  its home center × receiver percent (self excluded, renormalized).
   *  Single pass per the standard two-step methodology — no iteration past
   *  Round 2. */
  secondAllocation: Record<string, Record<NodeKey, number>>;
  /** Indirect-node keys in step order. */
  stepOrder: NodeKey[];
  /** Σ over pools of alloc2[*][direct]. The total $ each direct node
   *  received across every pool's distribution. */
  directTotals: Record<NodeKey, number>;
  nodes: GlNode[];
  /** Per-pool routing diagnostics. Populated when a DIRECT pool has no
   *  DirectAllocationRow / no valid glCodes / all-zero percents, or
   *  when a non-DIRECT pool's basisUnits + driver-unit fallback yield
   *  no usable denominator. Review tooling surfaces these so the user
   *  can fix the underlying pool/receiver data. */
  diagnostics: PoolDiagnostic[];
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

/** Build the engine graph from store state. Returns the node list, the
 *  driver matrix (per-node, per-basis units), and resolvers used by
 *  computeStepDownGl. Driver units come from basisUnits — one schedule
 *  per basis serves every pool that selects that basis. */
export function buildEngineGraph(args: {
  allocationBases: AllocationBasis[];
  basisUnits: BasisUnitRow[];
  directAllocations: DirectAllocationRow[];
  /** Center totals keyed by center identity (glCode or `seed:center:*`).
   *  The key IS the indirect node's NodeKey — no second resolution step. */
  capCenterTotals: Record<string, number>;
  /** Center metadata keyed alongside capCenterTotals. Provides the
   *  display name + classification lookup the engine stamps on each
   *  indirect node. Missing entries fall back to using the key itself
   *  as the name (defensive — production state always has metadata). */
  capCenterSources: Record<string, { name: string; source: unknown; sourceFile?: string }>;
  capReceivers: ReceiverEntry[];
  /** Fee depts the active jurisdiction actually models (typically derived
   *  from state.positions / state.services). Scopes the synthetic
   *  fallback direct nodes (step 3 below) so jurisdictions that don't
   *  model e.g. PARKS / PD / FIRE don't end up with phantom receivers
   *  catching CAP allocation via the seed DRIVERS matrix. Omit for the
   *  legacy behavior (seed every entry in FEE_DEPTS). */
  modeledFeeDepts?: DeptCode[];
}): GlEngineGraph {
  const {
    allocationBases, basisUnits, directAllocations,
    capCenterTotals, capCenterSources, capReceivers,
    modeledFeeDepts,
  } = args;

  const nodes: GlNode[] = [];
  const nodeByKey = new Map<NodeKey, GlNode>();
  const addNode = (n: GlNode) => {
    if (nodeByKey.has(n.key)) return;
    nodes.push(n);
    nodeByKey.set(n.key, n);
  };

  // 1. Indirect nodes — one per cost center. The center's identity key
  //    (glCode for imported centers, `seed:center:NAME` synth for
  //    manually-added or pre-glCode-import centers) IS the node key, so
  //    no name→key resolution is needed at routing time. Display name +
  //    classification come from capCenterSources, with defensive
  //    fallbacks for snapshots that predate the metadata field.
  const indirectNodeByCenter = new Map<string, NodeKey>();
  for (const key of Object.keys(capCenterTotals)) {
    const meta = capCenterSources[key];
    const name = meta?.name ?? key;
    addNode({
      key, glCode: key, name, role: "indirect",
      classification: INDIRECT_CODE_BY_NAME.get(name),
    });
    indirectNodeByCenter.set(name, key);
  }

  // 2. Every imported receiver glCode that isn't already an indirect center
  //    becomes a direct (terminal) node. Allocations stop here — sub-receivers
  //    are destinations, not pass-throughs. feeDept is set only when the
  //    receiver's classification matches PLAN/BLDG/ENG so FBHR can sum by
  //    fee dept; classification is metadata only and never determines a
  //    routing destination.
  //
  //    No modeledFeeDepts filter here: every receiver in capReceivers came
  //    from real basisUnits or directAllocations imports (the LAH FY 24/25
  //    seed bundle has actual Public Safety / Parks / Fire receivers at
  //    real LAH glCodes). The previous filter was guarding against phantom
  //    fee-dept receivers in older seed data; that data is gone. FBHR
  //    roll-up at the edge (capAllocatedFromGl) is what scopes per-dept
  //    display to the jurisdiction's modeled fee depts — the engine's job
  //    is to distribute faithfully.
  for (const r of capReceivers) {
    if (!r.glCode) continue;
    if (nodeByKey.has(r.glCode)) continue;

    const isFeeDept = FEE_DEPT_SET.has(r.deptCode);
    addNode({
      key: r.glCode, glCode: r.glCode, name: r.dept,
      role: "direct",
      feeDept: isFeeDept ? (r.deptCode as DeptCode) : undefined,
      classification: r.deptCode,
    });
  }

  // 3. Synthetic PLAN/BLDG/ENG direct nodes — empty-state fallback only.
  //    These exist so the prototype has stable, glCode-keyed receivers when
  //    no CAP import has been loaded yet. As soon as any imported receiver
  //    shows up in step 2, the imports own the receiver set and we skip
  //    seed creation entirely. They are NOT a deptCode-routing fallback
  //    for DIRECT pools — DIRECT pools route only via their
  //    DirectAllocationRow (see Phase 1 below).
  const anyImportedDirect = nodes.some(
    (n) => n.role === "direct" && !n.key.startsWith("seed:"),
  );
  if (!anyImportedDirect) {
    const seedDepts = modeledFeeDepts && modeledFeeDepts.length > 0
      ? modeledFeeDepts
      : FEE_DEPTS;
    for (const dept of seedDepts) {
      const key = seedDeptKey(dept);
      addNode({
        key, glCode: key, name: dept, role: "direct", feeDept: dept,
        classification: dept,
      });
    }
  }

  // 4. Driver matrix — values keyed by node.key (= glCode). DRIVERS values
  //    seed onto synth nodes at INIT time; the engine reads drivers[node.key]
  //    at run time, never by deptCode.
  const drivers: GlDriverMatrix = {};
  for (const n of nodes) drivers[n.key] = {};

  // Seed indirect drivers onto synth seed:center:* nodes (centers with no
  // imported glCode). Imported indirect glCodes get their units later from
  // receiver-aggregation, so seeding them here would double-count.
  for (const dept of INST_DEPTS) {
    if (dept.kind !== "indirect") continue;
    const nodeKey = indirectNodeByCenter.get(dept.name);
    if (!nodeKey) continue;
    const node = nodeByKey.get(nodeKey)!;
    if (node.key.startsWith("seed:")) {
      drivers[nodeKey] = { ...(DRIVERS[dept.code] ?? {}) };
    }
  }

  // Seed direct drivers onto synth seed:dept:PLAN/BLDG/ENG nodes when
  // present. Imported direct nodes get their units from the receiver-
  // aggregation pass below, never from this seed path.
  for (const dept of FEE_DEPTS) {
    const key = seedDeptKey(dept);
    if (nodeByKey.has(key)) {
      drivers[key] = { ...(DRIVERS[dept] ?? {}) };
    }
  }

  // Imported drivers: walk each BasisUnitRow once and write its receivers'
  // units into the driver matrix. One BasisUnitRow per basis, so each
  // receiver glCode contributes its units exactly once per basis — no
  // per-pool duplication is possible.
  const basisById = new Map(allocationBases.map((b) => [b.id, b]));
  for (const bu of basisUnits) {
    const basis = basisById.get(bu.basisId);
    if (!basis) continue;
    const driverKey = basis.driverKey;
    if (driverKey === "DIRECT") continue;
    for (const r of bu.receivers) {
      if (!r.glCode || !nodeByKey.has(r.glCode)) continue;
      if (!Number.isFinite(r.units) || r.units <= 0) continue;
      drivers[r.glCode][driverKey] = (drivers[r.glCode][driverKey] ?? 0) + r.units;
    }
  }

  // Direct-allocation receivers are nodes too — buildReceiverRegistry
  // surfaces them, but defensively walk directAllocations here so the
  // graph is self-consistent even if the registry is built differently.
  for (const da of directAllocations) {
    for (const r of da.receivers) {
      if (!r.glCode || nodeByKey.has(r.glCode)) continue;
      const isFeeDept = FEE_DEPT_SET.has(r.deptCode);
      addNode({
        key: r.glCode, glCode: r.glCode, name: r.dept,
        role: "direct",
        feeDept: isFeeDept ? (r.deptCode as DeptCode) : undefined,
        classification: r.deptCode,
      });
      drivers[r.glCode] = {};
    }
  }

  const resolveCenterNode = (centerName: string): NodeKey | undefined =>
    indirectNodeByCenter.get(centerName);

  // Build the by-glCode index AFTER step 2's defensive seed-center →
  // real-glCode promotion has settled, so a promoted center is found
  // under its real glCode (not its old synth seed:center:* key).
  const centerNodeByGlCode = new Map<string, NodeKey>();
  for (const n of nodes) {
    if (n.role === "indirect") centerNodeByGlCode.set(n.glCode, n.key);
  }

  const resolvePoolHome = (pool: CapPool): NodeKey | undefined => {
    if (pool.centerGlCode) {
      const byGl = centerNodeByGlCode.get(pool.centerGlCode);
      if (byGl) return byGl;
    }
    return indirectNodeByCenter.get(pool.center);
  };

  return { nodes, drivers, resolveCenterNode, resolvePoolHome };
}

// ---------------------------------------------------------------------------
// Step-down compute
// ---------------------------------------------------------------------------

/** Sequential two-phase CAP allocation over the glCode graph — implements
 *  the standard full-cost step-down methodology.
 *
 *  Step ordering matters: each center sits at a position in stepOrder, and
 *  "upstream" = centers at earlier positions.
 *
 *  PHASE 1 (First Allocation, in step order):
 *  For each center C in step order:
 *      firstIncoming[C]   = Σ over UPSTREAM pools q of firstAllocation[q][C]
 *      For each pool p at C:
 *        firstPool[p]     = p.eligible + p.weight × firstIncoming[C]
 *        distribute firstPool[p] via p's schedule, NO exclusions
 *        (= published "Gross Allocation" / "First Allocation" column total)
 *
 *  Each pool's First Allocation column thus equals (own + share of upstream
 *  contributions) × schedule percent. Self-allocation rows are populated
 *  when the schedule names the pool's home center.
 *
 *  PHASE 2 (Second Allocation, in step order):
 *  After Phase 1 completes, then for each center C in step order:
 *      totalReceived[C]   = Σ firstAllocation[*][C]
 *                         + Σ secondAllocation[upstream-of-C][C]
 *      secondIncoming[C]  = totalReceived[C] - firstIncoming[C]
 *      For each pool p at C:
 *        secondPool[p]    = p.weight × secondIncoming[C]
 *        distribute secondPool[p] via p's schedule, SELF + UPSTREAM excluded,
 *        percents renormalized over the surviving (= self + downstream)
 *        receivers.
 *
 *  Phase 2 is also processed in step order so upstream centers' Phase 2
 *  contributions are available when downstream centers compute their
 *  totalReceived. No further iteration.
 *
 *  alloc2[pool.id][receiver] = First + Second per pool per receiver.
 *  Matches the per-pool "Allocation Detail" page in the published CAP PDF
 *  cell-for-cell. DIRECT-basis pools route their full eligible via their
 *  imported receivers list (each receiver's glCode is the routing target).
 *  If a DIRECT pool has no valid receivers, its eligible $ leaks and the
 *  pool is added to model.diagnostics — never silently rerouted by
 *  deptCode. DIRECT pools skip Phase 2.
 */
export function computeStepDownGl(args: {
  pools: CapPool[];
  centerOrder: string[];
  bases: AllocationBasis[];
  basisUnits: BasisUnitRow[];
  directAllocations: DirectAllocationRow[];
  graph: GlEngineGraph;
  /** Per-pool per-receiver direct-bill carve-outs. Clamped to
   *  [0, grossAllocation] per (pool, receiver) so a stale or oversized
   *  entry can never produce a negative first allocation. Omit / pass {}
   *  when no direct bills are in play (default behaviour). */
  directBills?: Record<string, Record<NodeKey, number>>;
}): GlStepDownModel {
  const {
    pools, centerOrder, bases, basisUnits, directAllocations, graph,
    directBills = {},
  } = args;
  const { nodes, drivers, resolveCenterNode, resolvePoolHome } = graph;
  const diagnostics: PoolDiagnostic[] = [];

  const indirectNodes = nodes.filter((n) => n.role === "indirect");
  const directNodes   = nodes.filter((n) => n.role === "direct");
  const allNodeKeys   = new Set<NodeKey>(nodes.map((n) => n.key));

  // Index basisUnits and directAllocations for quick lookup.
  const basisUnitsById = new Map(basisUnits.map((bu) => [bu.basisId, bu]));
  const directByPoolId = new Map(directAllocations.map((da) => [da.poolId, da]));

  // Pre-compute each pool's per-receiver schedule once. Non-DIRECT pools
  // derive their percents from the shared BasisUnitRow (units / Σ units);
  // DIRECT pools take their percents straight from DirectAllocationRow.
  // Receivers without a valid node are filtered out — same node-validity
  // check Phase 1 / Phase 2 would do, just earlier.
  const scheduleByPoolId = new Map<string, PoolSchedule>();
  for (const p of pools) {
    const { basis } = basisForPool(p, bases);
    if (basis === "DIRECT") {
      const da = directByPoolId.get(p.id);
      if (!da) { scheduleByPoolId.set(p.id, { receivers: [] }); continue; }
      const valid = da.receivers.filter(
        (r) => r.glCode && allNodeKeys.has(r.glCode) && r.percent > 0,
      );
      scheduleByPoolId.set(p.id, {
        receivers: valid.map((r) => ({ glCode: r.glCode, percent: r.percent })),
      });
      continue;
    }
    const bu = basisUnitsById.get(p.basisId);
    if (!bu) { scheduleByPoolId.set(p.id, { receivers: [] }); continue; }
    const validRows = bu.receivers.filter(
      (r) => r.glCode && allNodeKeys.has(r.glCode) && r.units > 0,
    );
    const totalUnits = validRows.reduce((a, r) => a + r.units, 0);
    if (totalUnits <= 0) { scheduleByPoolId.set(p.id, { receivers: [] }); continue; }
    scheduleByPoolId.set(p.id, {
      receivers: validRows.map((r) => ({
        glCode: r.glCode, percent: (r.units / totalUnits) * 100,
      })),
    });
  }

  // Helper: does this pool have at least one receiver row that the engine
  // can route to?
  const hasValidReceivers = (p: CapPool): boolean =>
    (scheduleByPoolId.get(p.id)?.receivers.length ?? 0) > 0;

  // Helper: append a routing diagnostic for a pool that couldn't reach a
  // node. The pool's $ becomes leakage.
  const noteDiagnostic = (
    p: CapPool, kind: PoolDiagnostic["kind"], amount: number, message: string,
  ) => {
    diagnostics.push({
      poolId: p.id, center: p.center, pool: p.pool,
      kind, amount, message,
    });
  };

  // Pool sizing for center-level weighting. Primary source is
  // `pool.amount` (the net-allocable headline). When that's zero —
  // typical for redistribution units like Town Center Operations whose
  // headline is $0 but whose document publishes personnel + operating
  // as the implicit weighting basis — fall back to (personnelCost +
  // operatingCost). This ratio is used to determine each pool's share
  // of its center's incoming dollars; it does NOT add own dollars
  // (which would double-count the incoming flow).
  const poolSize = (p: CapPool): number => {
    if (p.amount > 0) return p.amount;
    const breakdown = (p.personnelCost ?? 0) + (p.operatingCost ?? 0);
    return breakdown > 0 ? breakdown : 0;
  };

  // Step order — drives the engine. Both Phase 1 and Phase 2 iterate
  // stepOrder in sequence so each center's First Pool can include its
  // upstream centers' First contributions, and each center's Phase 2
  // input can include upstream centers' Phase 2 contributions.
  // centerOrder entries are NodeKeys (glCodes / `seed:center:*` synth)
  // post-PR-11. If a stale name slips through (legacy caller), the
  // resolveCenterNode fallback finds it via the name→key map.
  const stepOrder: NodeKey[] = [];
  const seenStep = new Set<NodeKey>();
  for (const entry of centerOrder) {
    const k = allNodeKeys.has(entry) ? entry : resolveCenterNode(entry);
    if (k && !seenStep.has(k)) { stepOrder.push(k); seenStep.add(k); }
  }
  for (const n of indirectNodes) {
    if (!seenStep.has(n.key)) { stepOrder.push(n.key); seenStep.add(n.key); }
  }

  const zeroRow = (): Record<NodeKey, number> =>
    Object.fromEntries(nodes.map((n) => [n.key, 0])) as Record<NodeKey, number>;

  // grossAllocation captures Phase 1's per-receiver first-round shares
  // BEFORE any direct-bill carve-out. firstAllocation is derived from it
  // below once Phase 1 has settled. Phase 2 reads firstAllocation so
  // direct-billed dollars do not propagate downstream.
  const grossAllocation: Record<string, Record<NodeKey, number>> = {};
  const firstAllocation: Record<string, Record<NodeKey, number>> = {};
  const secondAllocation: Record<string, Record<NodeKey, number>> = {};
  const directBillAllocation: Record<string, Record<NodeKey, number>> = {};
  for (const p of pools) {
    grossAllocation[p.id] = zeroRow();
    firstAllocation[p.id] = zeroRow();
    secondAllocation[p.id] = zeroRow();
    directBillAllocation[p.id] = zeroRow();
  }

  // Pre-bucket each center's own pools (used for Round 2 weighting).
  const ownPoolsByCenter = new Map<NodeKey, CapPool[]>();
  for (const p of pools) {
    const homeKey = resolvePoolHome(p);
    if (!homeKey) continue;
    const list = ownPoolsByCenter.get(homeKey) ?? [];
    list.push(p);
    ownPoolsByCenter.set(homeKey, list);
  }

  // -----------------------------------------------------------------------
  // distributeAmount — apply pool op's schedule to `amount`, writing into
  // allocMap. `excludeKeys` is the set of node keys filtered out and
  // renormalized over (Phase 2 self + upstream exclusion); pass an empty
  // set in Phase 1 so every listed receiver is eligible. Returns the
  // per-node distribution.
  const distributeAmount = (
    op: CapPool, amount: number, allocMap: Record<NodeKey, number>,
    excludeKeys: Set<NodeKey>,
  ): Record<NodeKey, number> => {
    const distributed: Record<NodeKey, number> = {};
    if (amount <= 0) return distributed;

    // Per-pool schedule derived earlier from basisUnits (or
    // directAllocations for DIRECT pools). Already filtered to receivers
    // that resolve to a known node and have a non-zero share; apply the
    // Phase-2 exclude set on top.
    const schedule = scheduleByPoolId.get(op.id);
    const validReceivers = (schedule?.receivers ?? []).filter(
      (r) => !excludeKeys.has(r.glCode),
    );
    const totalPct = validReceivers.reduce((a, r) => a + r.percent, 0);

    if (totalPct > 0) {
      for (const r of validReceivers) {
        const share = amount * (r.percent / totalPct);
        allocMap[r.glCode] = (allocMap[r.glCode] ?? 0) + share;
        distributed[r.glCode] = (distributed[r.glCode] ?? 0) + share;
      }
      return distributed;
    }

    // Basis-unit fallback (seed pools whose basis has no imported
    // BasisUnitRow). Walk synth seed nodes' driver units for the pool's
    // basis. DIRECT pools never fall back — they leak instead.
    const { basis } = basisForPool(op, bases);
    if (basis === "DIRECT") return distributed;
    const denomNodes = excludeKeys.size > 0
      ? nodes.filter((n) => !excludeKeys.has(n.key))
      : nodes;
    const totalDriver = denomNodes.reduce(
      (a, n) => a + (drivers[n.key]?.[basis] ?? 0), 0,
    );
    if (totalDriver <= 0) return distributed;
    for (const n of denomNodes) {
      const drv = drivers[n.key]?.[basis] ?? 0;
      if (drv <= 0) continue;
      const share = amount * (drv / totalDriver);
      allocMap[n.key] = (allocMap[n.key] ?? 0) + share;
      distributed[n.key] = (distributed[n.key] ?? 0) + share;
    }
    return distributed;
  };

  // Build upstream key sets — used by both phases. The upstream of a
  // center at step S is everything at step < S in stepOrder.
  const upstreamKeysFor = (targetKey: NodeKey): Set<NodeKey> => {
    const idx = stepOrder.indexOf(targetKey);
    return new Set(idx > 0 ? stepOrder.slice(0, idx) : []);
  };

  // Materialise a pool's post-direct-bill firstAllocation from its just-
  // computed grossAllocation. Called incrementally inside the Phase 1
  // loop so downstream centers' firstInc calculations see post-direct-bill
  // upstream values — direct-billed dollars must not propagate.
  const settleDirectBills = (poolId: string): void => {
    const gross = grossAllocation[poolId];
    const first = firstAllocation[poolId];
    const db    = directBillAllocation[poolId];
    const userDb = directBills[poolId] ?? {};
    for (const k of Object.keys(gross)) {
      const g = gross[k] ?? 0;
      const dbAmt = Math.max(0, Math.min(userDb[k] ?? 0, g));
      db[k] = dbAmt;
      first[k] = g - dbAmt;
    }
  };

  // incomingRound1 will hold per-center First Incoming (= upstream Phase 1
  // contributions to center). Surfaces as the "First Allocation" column in
  // the receiving center's "Costs to be Allocated" view.
  const incomingRound1: Record<NodeKey, number> = {};
  for (const n of indirectNodes) incomingRound1[n.key] = 0;

  // -----------------------------------------------------------------------
  // PHASE 1 — sequential in step order.
  // Each center's pools distribute (own + pool-weight × firstIncoming[C])
  // via the schedule with NO exclusions. Upstream centers run before
  // downstream so firstIncoming[C] only sees finalized upstream Phase 1
  // contributions.
  for (const centerKey of stepOrder) {
    const upstreamKeys = upstreamKeysFor(centerKey);

    // firstIncoming[centerKey] = Σ upstream pools' Phase 1 contributions
    // to centerKey, finalized in earlier loop iterations.
    let firstInc = 0;
    for (const p of pools) {
      const ph = resolvePoolHome(p);
      if (!ph || !upstreamKeys.has(ph)) continue;
      firstInc += firstAllocation[p.id]?.[centerKey] ?? 0;
    }
    incomingRound1[centerKey] = firstInc;

    const centerPools = ownPoolsByCenter.get(centerKey) ?? [];

    // Pool weight at this center = pool's effective own dollars
    // (amount, falling back to personnel + operating when amount is 0) ÷
    // Σ effective dollars across the center's pools. For ordinary pools
    // this equals the published allocationPercent split. For zero-amount
    // internal-service centers (e.g. Town Center Operations) where the
    // pools publish only personnel + operating, this routes incoming
    // dollars in proportion to each pool's cost breakdown — which is the
    // ratio the published worksheets compute against.
    //
    // Fall back to allocationPercent when no pool has effective dollars
    // (defensive), and to an even split only when allocationPercent is
    // also absent.
    const totalSize = centerPools.reduce(
      (a, p) => a + poolSize(p), 0,
    );
    const totalAllocPct = centerPools.reduce(
      (a, p) => a + (p.allocationPercent ?? 0), 0,
    );
    const weightOf = (p: CapPool): number => {
      if (totalSize > 0) return poolSize(p) / totalSize;
      if (totalAllocPct > 0) return (p.allocationPercent ?? 0) / totalAllocPct;
      return 1 / Math.max(1, centerPools.length);
    };

    for (const p of centerPools) {
      const poolWeight = weightOf(p);
      const { basis } = basisForPool(p, bases);
      const firstPool = p.amount + poolWeight * firstInc;
      if (firstPool <= 0) continue;

      // DIRECT pools route strictly via imported receiver glCodes. No
      // deptCode-derived fallback — if a DIRECT pool has no valid
      // receivers, the eligible $ leaks and a diagnostic is recorded
      // for review tooling (per the strict glCode-routing rule).
      if (basis === "DIRECT") {
        if (hasValidReceivers(p)) {
          distributeAmount(p, firstPool, grossAllocation[p.id], new Set());
        } else {
          noteDiagnostic(
            p, "no-valid-glcodes", firstPool,
            `DIRECT pool has no imported receiver with a valid glCode + non-zero percent. ${fmtUSD(firstPool)} leaks; add a receiver row with a real glCode to route this pool.`,
          );
        }
        settleDirectBills(p.id);
        continue;
      }
      distributeAmount(p, firstPool, grossAllocation[p.id], new Set());
      settleDirectBills(p.id);
    }
  }

  // Also handle pools whose home center isn't in stepOrder (defensive —
  // shouldn't happen, but covers any legacy data).
  const stepOrderSet = new Set(stepOrder);
  for (const p of pools) {
    const homeKey = resolvePoolHome(p);
    if (homeKey && stepOrderSet.has(homeKey)) continue;
    if (p.amount <= 0) continue;
    const { basis } = basisForPool(p, bases);
    if (basis === "DIRECT") {
      if (hasValidReceivers(p)) {
        distributeAmount(p, p.amount, grossAllocation[p.id], new Set());
      } else {
        noteDiagnostic(
          p, "no-valid-glcodes", p.amount,
          `DIRECT pool (orphaned home center) has no imported receiver with a valid glCode + non-zero percent. ${fmtUSD(p.amount)} leaks.`,
        );
      }
      settleDirectBills(p.id);
      continue;
    }
    distributeAmount(p, p.amount, grossAllocation[p.id], new Set());
    settleDirectBills(p.id);
  }

  // -----------------------------------------------------------------------
  // PHASE 2 — sequential in step order.
  // For each center C:
  //   totalReceived[C]   = Σ firstAllocation[*][C] + Σ secondAllocation[upstream][C]
  //   secondIncoming[C]  = totalReceived[C] - firstIncoming[C]
  // Each pool at C redistributes its share via the schedule with self +
  // upstream excluded; surviving percents renormalize to 100%.
  for (const centerKey of stepOrder) {
    const upstreamKeys = upstreamKeysFor(centerKey);

    let totalReceived = 0;
    for (const p of pools) {
      totalReceived += firstAllocation[p.id]?.[centerKey] ?? 0;
      const ph = resolvePoolHome(p);
      if (ph && upstreamKeys.has(ph)) {
        totalReceived += secondAllocation[p.id]?.[centerKey] ?? 0;
      }
    }
    const firstInc = incomingRound1[centerKey] ?? 0;
    const secondInc = totalReceived - firstInc;
    if (secondInc <= 0) continue;

    const centerPools = ownPoolsByCenter.get(centerKey) ?? [];

    // Same weight rule as Phase 1: effective dollars first
    // (amount, or personnel + operating when amount is 0), then
    // allocationPercent, then even split.
    const totalSize = centerPools.reduce(
      (a, p) => a + poolSize(p), 0,
    );
    const totalAllocPct = centerPools.reduce(
      (a, p) => a + (p.allocationPercent ?? 0), 0,
    );
    const weightOf = (p: CapPool): number => {
      if (totalSize > 0) return poolSize(p) / totalSize;
      if (totalAllocPct > 0) return (p.allocationPercent ?? 0) / totalAllocPct;
      return 1 / Math.max(1, centerPools.length);
    };

    // Phase 2 schedule excludes self (center) AND every upstream center.
    const excludeKeys = new Set<NodeKey>([centerKey, ...upstreamKeys]);

    for (const p of centerPools) {
      const { basis } = basisForPool(p, bases);
      if (basis === "DIRECT") continue;
      const poolWeight = weightOf(p);
      const secondPool = poolWeight * secondInc;
      if (secondPool <= 0) continue;
      distributeAmount(p, secondPool, secondAllocation[p.id], excludeKeys);
    }
  }

  // === alloc2 = First + Second + DirectBilled per pool per receiver.
  // Direct-billed dollars land at the receiver even though they bypassed
  // the basis math, so they must show up in the receiver's total (and in
  // the rolled-up matrix). Equivalent to Gross + Second.
  const alloc2: Record<string, Record<NodeKey, number>> = {};
  for (const p of pools) {
    const row = zeroRow();
    const f = firstAllocation[p.id] ?? {};
    const s = secondAllocation[p.id] ?? {};
    const d = directBillAllocation[p.id] ?? {};
    for (const n of nodes) {
      row[n.key] = (f[n.key] ?? 0) + (s[n.key] ?? 0) + (d[n.key] ?? 0);
    }
    alloc2[p.id] = row;
  }

  // === ROLLUPS ===
  const directTotals: Record<NodeKey, number> = {};
  for (const d of directNodes) {
    directTotals[d.key] = pools.reduce(
      (a, p) => a + (alloc2[p.id]?.[d.key] ?? 0), 0,
    );
  }

  return {
    alloc2,
    grossAllocation, directBillAllocation,
    firstAllocation, secondAllocation,
    stepOrder, directTotals, nodes,
    diagnostics,
  };
}

/** Format a dollar amount for diagnostic messages. Self-contained so the
 *  engine module doesn't depend on the UI's fmt helper. */
function fmtUSD(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** FBHR roll-up (reading B): sum direct-node totals into each fee dept by
 *  the node's feeDept classification. Multiple direct nodes per dept (i.e.
 *  several imported PLAN-classified glCodes) all contribute. */
export function capAllocatedFromGl(
  model: GlStepDownModel,
): Record<DeptCode, number> {
  const out = {} as Record<DeptCode, number>;
  for (const d of FEE_DEPTS) out[d] = 0;
  for (const n of model.nodes) {
    if (n.role === "direct" && n.feeDept) {
      out[n.feeDept] += model.directTotals[n.key] ?? 0;
    }
  }
  return out;
}

/** Per-pool allocation into a single fee dept. Sums alloc2 cells across
 *  every direct node whose feeDept matches. Used by the per-pool drilldown
 *  panels (CapSummary, CostOfServiceTable, RateDerivation). */
export function poolToFeeDept(
  model: GlStepDownModel, poolId: string, dept: DeptCode,
): number {
  let total = 0;
  for (const n of model.nodes) {
    if (n.role === "direct" && n.feeDept === dept) {
      total += model.alloc2[poolId]?.[n.key] ?? 0;
    }
  }
  return total;
}
