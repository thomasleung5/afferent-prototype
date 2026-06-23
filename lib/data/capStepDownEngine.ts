/* glCode-native CAP step-down engine.
 *
 * STRICT glCode routing: every allocation flow routes through a node.key
 * (which IS the node's glCode). deptCode is classification metadata:
 *   - feeDept tags direct nodes for FBHR roll-up (sum by classification).
 *   - classification labels nodes for display / debug.
 *
 * Routing model — uniform pool → basisId → BasisUnitRow → receivers path:
 *   - Imported direct receiver → real glCode is the node.key.
 *   - Imported indirect center → imported glCode (or synth seed:center:*
 *     for centers that never had a glCode imported) is the node.key.
 *   - Every pool's basisId resolves to a BasisUnitRow. Receiver percents
 *     are derived as `units / Σ units across the basis schedule`. One
 *     schedule serves every pool with the same basisId; receivers are
 *     counted ONCE per basis.
 *   - Direct allocations are folded into per-pool synthetic basis
 *     schedules by `materializeDirectAsBasisUnits` BEFORE this engine
 *     runs (see lib/data/capBasisRouting.ts). The engine itself no
 *     longer branches on driverKey; that field survives only as legacy
 *     metadata on AllocationBasis.
 *   - If the basisId is missing, orphaned, or has no imported schedule
 *     with valid receivers, the pool's $ leaks and a diagnostic is
 *     recorded. */

import type {
  AllocationBasis, BasisUnitRow, CapPool, DeptCode, InstDeptCode,
} from "../types";
import { basisForPool } from "./capBasisRouting";
import { INDIRECT_CODE_BY_NAME } from "./institutionalDepts";
import type { ReceiverEntry } from "./capReceiverRegistry";

/** Internal per-pool per-receiver share derived from the pool's basis
 *  schedule. Computed once per (engine build) and reused across Phase 1
 *  + Phase 2. After direct-allocation materialization, every routable
 *  pool produces one of these via the same code path. */
interface PoolSchedule {
  receivers: { glCode: string; percent: number }[];
}

import { FEE_DEPTS } from "./departments";
const FEE_DEPT_SET = new Set<string>(FEE_DEPTS);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeKey = string;

export interface GlNode {
  key: NodeKey;
  /** Same as `key` — for centers without an imported glCode the
   *  `seed:center:*` synthetic stands in. */
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

interface GlEngineGraph {
  nodes: GlNode[];
  /** centerName → indirect node key. Used by stepOrder construction in
   *  computeStepDownGl (centerOrder is still name-keyed). Pool home
   *  resolution should use resolvePoolHome instead so glCode-stamped
   *  pools route via glCode. */
  resolveCenterNode: (centerName: string) => NodeKey | undefined;
  /** Pool → indirect node key. Prefers pool.centerGlCode (glCode → node
   *  via the centerNodeByGlCode index) and falls back to pool.center
   *  (name → node via indirectNodeByCenter). The glCode path is the
   *  load-bearing routing identity; the name path is the fallback for
   *  pools whose centerGlCode hasn't been backfilled (manually-added
   *  centers, etc.). */
  resolvePoolHome: (pool: CapPool) => NodeKey | undefined;
}

/** Per-pool diagnostic surfaced when the engine can't route a pool's
 *  net allocable $ to any node. Review tooling renders these for the
 *  analyst to fix; exports surface the leakage total so the report
 *  never claims unresolved pools were authoritatively allocated.
 *
 *  Consolidated to three kinds after direct-allocation materialization:
 *  former DIRECT-specific "no-receivers" / "no-valid-glcodes" failures
 *  now surface as "no-schedule" because the materializer would have
 *  produced an empty/invalid synthetic schedule (or no schedule at all)
 *  for the pool. */
export type PoolDiagnosticKind =
  | "missing-basisId"
  | "orphaned-basisId"
  | "no-schedule";

export interface PoolDiagnostic {
  poolId: string;
  center: string;
  pool: string;
  kind: PoolDiagnosticKind;
  amount: number;
  message: string;
}

export interface GlStepDownModel {
  /** Per-pool distribution after sequential closure. Each pool row shows
   *  what THAT pool distributed to each receiver via its own schedule —
   *  pool's own eligible + pool's share of any incoming $ at its home
   *  center. Matches the standard per-pool "Allocation Detail" attribution.
   *  Σ over pools of alloc2[*][node] = total $ landing on the node minus
   *  any leakage (see leakageByPoolId). */
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
  /** Per-pool routing diagnostics. Populated when a pool's basisId is
   *  missing / orphaned, or when its BasisUnitRow is missing / has no
   *  receivers with a valid glCode + non-zero share. Review tooling
   *  surfaces these so the user can fix the underlying pool/basis data. */
  diagnostics: PoolDiagnostic[];
  /** Per-pool leaked $ — the dollars the engine could not route because
   *  the pool's basis or schedule failed to resolve. Σ leakageByPoolId
   *  + Σ alloc2 equals Σ pool.amount: conservation holds across
   *  allocated dollars and leakage. Sparse — pools that routed
   *  successfully are absent from the map. */
  leakageByPoolId: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

/** Build the engine graph from store state. Returns the node list and
 *  resolvers used by computeStepDownGl. Pool schedules are derived
 *  on-demand inside computeStepDownGl from the imported BasisUnitRow
 *  (one row per basis serves every pool that selects that basis). After
 *  `materializeDirectAsBasisUnits`, former direct allocations have been
 *  folded into per-pool synthetic basis schedules — the graph builder
 *  doesn't need to know about DirectAllocationRow because every receiver
 *  reaches it through `capReceivers` (the unified registry). No driver
 *  matrix is exposed — the legacy seed-driver fallback was removed; a
 *  pool whose basis fails to resolve leaks and surfaces a diagnostic. */
export function buildEngineGraph(args: {
  allocationBases: AllocationBasis[];
  basisUnits: BasisUnitRow[];
  /** Center totals keyed by center identity (glCode or `seed:center:*`).
   *  The key IS the indirect node's NodeKey — no second resolution step. */
  capCenterTotals: Record<string, number>;
  /** Center metadata keyed alongside capCenterTotals. Provides the
   *  display name + classification lookup the engine stamps on each
   *  indirect node. Missing entries fall back to using the key itself
   *  as the name (defensive — production state always has metadata). */
  capCenterSources: Record<string, { name: string; source: unknown; sourceFile?: string }>;
  capReceivers: ReceiverEntry[];
}): GlEngineGraph {
  // basisUnits / allocationBases are read by computeStepDownGl for
  // schedule derivation; the graph builder no longer materializes a
  // seed-driver matrix from them.
  const { capCenterTotals, capCenterSources, capReceivers } = args;

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
  //    routing destination. Direct nodes come exclusively from imported
  //    basisUnits (after direct-allocation materialization) via the
  //    receiver registry — there is no empty-state placeholder fallback.
  //    A jurisdiction with no imported receivers shows zero direct nodes
  //    (and the consuming UI renders its empty state).
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

  const resolveCenterNode = (centerName: string): NodeKey | undefined =>
    indirectNodeByCenter.get(centerName);

  // Build the by-glCode index AFTER step 2's defensive seed-center →
  // real-glCode promotion has settled, so a promoted center is found
  // under its real glCode (not the `seed:center:*` synthetic key it
  // was first inserted under).
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

  return { nodes, resolveCenterNode, resolvePoolHome };
}

// ---------------------------------------------------------------------------
// Step-down compute
// ---------------------------------------------------------------------------

/** Per-method allocation method. See computeStepDownGl docstring. */
export type StepDownMethod = "double" | "single";

/** Sequential CAP allocation over the glCode graph. The `method` arg
 *  selects between the standard double step-down (default) and a single-
 *  pass variant that allocates each indirect center's costs once,
 *  directly to direct cost centers only.
 *
 *  Step ordering matters: each center sits at a position in stepOrder, and
 *  "upstream" = centers at earlier positions.
 *
 *  ── DOUBLE STEP-DOWN (method = "double") ──
 *  PHASE 1 (First Allocation, in step order):
 *  For each center C in step order:
 *      firstIncoming[C]   = Σ over UPSTREAM pools q of firstAllocation[q][C]
 *      For each pool p at C:
 *        firstPool[p]     = p.eligible + p.weight × firstIncoming[C]
 *        distribute firstPool[p] via p's schedule, NO exclusions
 *        (= published "Gross Allocation" / "First Allocation" column total)
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
 *  cell-for-cell.
 *
 *  ── SINGLE STEP-DOWN (method = "single") ──
 *  Each indirect center allocates its costs ONCE, directly to direct cost
 *  centers only. Indirect centers do NOT receive allocations from other
 *  indirect centers — so firstIncoming is structurally zero, no
 *  redistribution happens, and Phase 2 is skipped entirely. Concretely:
 *      For each pool p at center C in step order:
 *        distribute p.eligible via p's schedule, INDIRECT nodes excluded,
 *        percents renormalized across the surviving (= direct) receivers.
 *
 *  Conservation still holds: Σ alloc2 + Σ leakage = Σ pool.amount. The
 *  alloc2 row for each pool lists $0 against every indirect node and the
 *  full direct distribution against direct nodes. secondAllocation is
 *  zero everywhere; firstAllocation carries the full per-pool routing.
 *
 *  ── COMMON TO BOTH METHODS ──
 *  Every pool routes through the same path: basisForPool resolves the
 *  pool's basisId in the catalog; the matching BasisUnitRow supplies the
 *  receiver schedule. Direct allocations published by the source document
 *  are folded into per-pool synthetic basis schedules by
 *  `materializeDirectAsBasisUnits` before this engine runs — the engine
 *  no longer reads driverKey. A pool whose basisId is missing, orphaned,
 *  or whose schedule has no valid receivers leaks its eligible $ and
 *  surfaces a diagnostic.
 */
export function computeStepDownGl(args: {
  pools: CapPool[];
  centerOrder: string[];
  bases: AllocationBasis[];
  basisUnits: BasisUnitRow[];
  graph: GlEngineGraph;
  /** Per-pool per-receiver direct-bill carve-outs. Clamped to
   *  [0, grossAllocation] per (pool, receiver) so a stale or oversized
   *  entry can never produce a negative first allocation. Omit / pass {}
   *  when no direct bills are in play (default behaviour). */
  directBills?: Record<string, Record<NodeKey, number>>;
  /** Step-down method. "double" (default) preserves the standard
   *  two-phase methodology; "single" runs one pass that excludes
   *  indirect receivers from every distribution and skips Phase 2. */
  method?: StepDownMethod;
}): GlStepDownModel {
  const {
    pools, centerOrder, bases, basisUnits, graph,
    directBills = {}, method = "double",
  } = args;
  const { nodes, resolveCenterNode, resolvePoolHome } = graph;
  const diagnostics: PoolDiagnostic[] = [];
  const leakageByPoolId: Record<string, number> = {};

  const indirectNodes = nodes.filter((n) => n.role === "indirect");
  const directNodes   = nodes.filter((n) => n.role === "direct");
  const allNodeKeys   = new Set<NodeKey>(nodes.map((n) => n.key));

  // Index basisUnits for quick lookup. Every pool — including former
  // direct allocations now materialized as per-pool synthetic schedules —
  // resolves through this single index.
  const basisUnitsById = new Map(basisUnits.map((bu) => [bu.basisId, bu]));

  // Pre-compute each pool's route status + schedule once. Routable pools
  // get a populated `schedule`; the rest carry a discriminant the Phase 1
  // loop turns into a diagnostic + leakage entry. No text-match fallback:
  // a pool whose basis fails to resolve never finds its way back into the
  // matrix via a seed driver. The engine routes what it can route, and
  // surfaces what it can't.
  type PoolRoute =
    | { state: "routable"; schedule: PoolSchedule }
    | { state: "missing-basisId" }
    | { state: "orphaned-basisId"; basisId: string }
    | { state: "no-schedule"; basisName: string };

  const routeByPoolId = new Map<string, PoolRoute>();
  for (const p of pools) {
    const resolution = basisForPool(p, bases);
    if (resolution.status === "missing-basisId") {
      routeByPoolId.set(p.id, { state: "missing-basisId" });
      continue;
    }
    if (resolution.status === "orphaned-basisId") {
      routeByPoolId.set(p.id, {
        state: "orphaned-basisId", basisId: resolution.basisId,
      });
      continue;
    }
    const basis = resolution.basis;
    const bu = basisUnitsById.get(basis.id);
    const validRows = bu?.receivers.filter(
      (r) => r.glCode && allNodeKeys.has(r.glCode) && r.units > 0,
    ) ?? [];
    const totalUnits = validRows.reduce((a, r) => a + r.units, 0);
    if (!bu || totalUnits <= 0) {
      routeByPoolId.set(p.id, { state: "no-schedule", basisName: basis.name });
      continue;
    }
    routeByPoolId.set(p.id, {
      state: "routable",
      schedule: {
        receivers: validRows.map((r) => ({
          glCode: r.glCode, percent: (r.units / totalUnits) * 100,
        })),
      },
    });
  }

  // Build a human-readable diagnostic message from the route + leaked $.
  // Centralized so Phase 1's two leakage points use the same wording.
  const messageForRoute = (
    route: Exclude<PoolRoute, { state: "routable" }>,
    amount: number,
  ): string => {
    switch (route.state) {
      case "missing-basisId":
        return `Pool has no allocation basis selected. ${fmtUSD(amount)} leaks; pick a basis in the Cost Pools table.`;
      case "orphaned-basisId":
        return `Pool references basis "${route.basisId}" which is not in the current catalog. ${fmtUSD(amount)} leaks; re-select a basis.`;
      case "no-schedule":
        return `Basis "${route.basisName}" has no schedule with at least one receiver carrying a glCode + non-zero share. ${fmtUSD(amount)} leaks; import a BasisUnitRow for this basis, or fix the receivers.`;
    }
  };

  // Note an unresolved pool's leakage + diagnostic. Called from Phase 1
  // with the actual eligible $ that couldn't be routed.
  const noteLeakage = (
    p: CapPool, route: Exclude<PoolRoute, { state: "routable" }>, amount: number,
  ) => {
    if (amount <= 0) return;
    diagnostics.push({
      poolId: p.id, center: p.center, pool: p.pool,
      kind: route.state, amount,
      message: messageForRoute(route, amount),
    });
    leakageByPoolId[p.id] = (leakageByPoolId[p.id] ?? 0) + amount;
  };

  // Pool sizing for center-level weighting. Primary source is
  // `pool.amount` (own net allocable dollars). When that's zero —
  // typical for redistribution units like Town Center Operations whose
  // departmental expenditures are $0 but whose document publishes incoming
  // functional-cost rows — prefer functionalCost, then fall back to
  // (personnelCost + operatingCost). This ratio determines each pool's
  // share of its center's incoming dollars; it does NOT add own dollars
  // (which would double-count the incoming flow).
  const poolSize = (p: CapPool): number => {
    if (p.amount > 0) return p.amount;
    if ((p.functionalCost ?? 0) > 0) return p.functionalCost ?? 0;
    const breakdown = (p.personnelCost ?? 0) + (p.operatingCost ?? 0);
    return breakdown > 0 ? breakdown : 0;
  };

  const publishedIncomingByPool = (
    centerPools: CapPool[],
    field: "firstIncomingCost" | "secondIncomingCost",
    expectedTotal: number,
  ): Map<string, number> | null => {
    if (expectedTotal <= 0) return null;
    const values = new Map<string, number>();
    let sum = 0;
    for (const p of centerPools) {
      const raw = p[field];
      const value = Number.isFinite(raw) && raw != null && raw > 0 ? raw : 0;
      values.set(p.id, value);
      sum += value;
    }
    if (sum <= 0) return null;
    const tolerance = Math.max(1, Math.abs(expectedTotal) * 0.005);
    return Math.abs(sum - expectedTotal) <= tolerance ? values : null;
  };

  // Step order — drives the engine. Both Phase 1 and Phase 2 iterate
  // stepOrder in sequence so each center's First Pool can include its
  // upstream centers' First contributions, and each center's Phase 2
  // input can include upstream centers' Phase 2 contributions.
  // centerOrder entries are NodeKeys (glCodes or `seed:center:*`
  // synthetics). If a caller passes a center name instead, the
  // resolveCenterNode fallback finds the matching key via the
  // name→key map so name-keyed callers keep working.
  const stepOrder: NodeKey[] = [];
  const seenStep = new Set<NodeKey>();
  for (const entry of centerOrder) {
    const k = allNodeKeys.has(entry) ? entry : resolveCenterNode(entry);
    if (k && !seenStep.has(k)) { stepOrder.push(k); seenStep.add(k); }
  }
  for (const n of indirectNodes) {
    if (!seenStep.has(n.key)) { stepOrder.push(n.key); seenStep.add(n.key); }
  }

  // For "single" mode, every Phase 1 distribution excludes indirect
  // receivers. That collapses firstIncoming to zero structurally (no
  // pool ever puts $ on an indirect node) so Phase 2 has nothing to
  // redistribute — we skip it entirely. The same exclude set is the
  // mechanism that "normalizes the driver across eligible direct cost
  // centers only" in single mode.
  const indirectKeySet = new Set<NodeKey>(indirectNodes.map((n) => n.key));
  const phase1Exclude = method === "single" ? indirectKeySet : new Set<NodeKey>();

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
  // distributeAmount — apply the precomputed schedule to `amount`, writing
  // into allocMap. `excludeKeys` is the set of node keys filtered out and
  // renormalized over (Phase 2 self + upstream exclusion); pass an empty
  // set in Phase 1 so every listed receiver is eligible. Returns the
  // per-node distribution. Callers must only call this for "routable"
  // pools — unresolved pools take the leakage branch in Phase 1.
  const distributeAmount = (
    schedule: PoolSchedule, amount: number,
    allocMap: Record<NodeKey, number>, excludeKeys: Set<NodeKey>,
  ): Record<NodeKey, number> => {
    const distributed: Record<NodeKey, number> = {};
    if (amount <= 0) return distributed;
    const validReceivers = schedule.receivers.filter(
      (r) => !excludeKeys.has(r.glCode),
    );
    const totalPct = validReceivers.reduce((a, r) => a + r.percent, 0);
    if (totalPct <= 0) return distributed;
    for (const r of validReceivers) {
      const share = amount * (r.percent / totalPct);
      allocMap[r.glCode] = (allocMap[r.glCode] ?? 0) + share;
      distributed[r.glCode] = (distributed[r.glCode] ?? 0) + share;
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
    const publishedFirstIncoming = publishedIncomingByPool(
      centerPools, "firstIncomingCost", firstInc,
    );

    for (const p of centerPools) {
      const poolWeight = weightOf(p);
      const incomingShare = publishedFirstIncoming?.get(p.id) ?? (poolWeight * firstInc);
      const firstPool = p.amount + incomingShare;
      if (firstPool <= 0) continue;

      const route = routeByPoolId.get(p.id);
      if (!route || route.state !== "routable") {
        if (route) noteLeakage(p, route, firstPool);
        settleDirectBills(p.id);
        continue;
      }
      // route.schedule was already filtered to receivers with a known
      // node + non-zero share. distributeAmount handles renormalization.
      // In single mode, phase1Exclude removes indirect receivers so the
      // percent denominator collapses to direct-only.
      distributeAmount(route.schedule, firstPool, grossAllocation[p.id], phase1Exclude);
      settleDirectBills(p.id);
    }
  }

  // Also handle pools whose home center isn't in stepOrder (defensive —
  // shouldn't happen in well-formed state, but covers persisted bundles
  // where centerOrder doesn't enumerate every populated center).
  const stepOrderSet = new Set(stepOrder);
  for (const p of pools) {
    const homeKey = resolvePoolHome(p);
    if (homeKey && stepOrderSet.has(homeKey)) continue;
    if (p.amount <= 0) continue;
    const route = routeByPoolId.get(p.id);
    if (!route || route.state !== "routable") {
      if (route) noteLeakage(p, route, p.amount);
      settleDirectBills(p.id);
      continue;
    }
    distributeAmount(route.schedule, p.amount, grossAllocation[p.id], phase1Exclude);
    settleDirectBills(p.id);
  }

  // -----------------------------------------------------------------------
  // PHASE 2 — sequential in step order.
  // For each center C:
  //   totalReceived[C]   = Σ firstAllocation[*][C] + Σ secondAllocation[upstream][C]
  //   secondIncoming[C]  = totalReceived[C] - firstIncoming[C]
  // Each pool at C redistributes its share via the schedule with self +
  // upstream excluded; surviving percents renormalize to 100%.
  //
  // Single step-down skips Phase 2 entirely — by construction Phase 1
  // never put $ on any indirect node, so secondIncoming would be zero
  // for every center and the loop would no-op. The explicit guard keeps
  // the math contract self-documenting.
  if (method === "double") for (const centerKey of stepOrder) {
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
    const publishedSecondIncoming = publishedIncomingByPool(
      centerPools, "secondIncomingCost", secondInc,
    );

    // Phase 2 schedule excludes self (center) AND every upstream center.
    const excludeKeys = new Set<NodeKey>([centerKey, ...upstreamKeys]);

    for (const p of centerPools) {
      const route = routeByPoolId.get(p.id);
      // Phase 2 only redistributes for routable pools. Unresolved pools
      // have already been settled in Phase 1's leakage branch.
      if (!route || route.state !== "routable") continue;
      const poolWeight = weightOf(p);
      const secondPool = publishedSecondIncoming?.get(p.id) ?? (poolWeight * secondInc);
      if (secondPool <= 0) continue;
      distributeAmount(route.schedule, secondPool, secondAllocation[p.id], excludeKeys);
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
    diagnostics, leakageByPoolId,
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
 *  panels (OverheadSummary, CostOfServiceTable, RateDerivation). */
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
