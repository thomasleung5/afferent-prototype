/* glCode-native CAP step-down engine.
 *
 * Successor to the MatrixDeptCode-keyed engine in capStepDown.ts. The graph
 * is built directly out of glCodes: one indirect node per cost center
 * (identified by capCenterGlCodes[center], else a synth seed:center:* key)
 * plus one direct node per imported PLAN/BLDG/ENG-classified receiver glCode
 * (or a synth seed:dept:* node when no imports cover a fee dept).
 *
 * DeptCode survives only as a classification helper to (a) decide direct vs
 * indirect role and (b) feed FBHR — it never appears inside the engine math.
 *
 * Behind useGlCodeEngine flag until matrix tabs + traces switch over. */

import type {
  AllocationBasis, BasisKey, CapPool, DeptCode, MatrixDeptCode, PoolReceiver,
} from "../types";
import {
  basisForPool, CENTER_NAME_TO_CODE, DRIVERS, INDIRECT_DEPTS,
} from "./capStepDown";
import type { ReceiverEntry } from "./capReceiverRegistry";

const FEE_DEPTS: DeptCode[] = ["PLAN", "BLDG", "ENG"];

const seedCenterKey = (centerName: string) => `seed:center:${centerName}`;
const seedDeptKey   = (deptCode: DeptCode | MatrixDeptCode) => `seed:dept:${deptCode}`;

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
  /** PLAN/BLDG/ENG when role = direct; used by FBHR roll-up. */
  feeDept?: DeptCode;
  /** Underlying MatrixDeptCode classification; used only for display + the
   *  seed-fallback resolution. The engine never branches on it. */
  classification?: MatrixDeptCode | "OTHER";
}

export type GlDriverMatrix = Record<NodeKey, Partial<Record<BasisKey, number>>>;

export interface GlEngineGraph {
  nodes: GlNode[];
  drivers: GlDriverMatrix;
  /** centerName → indirect node key. */
  resolveCenterNode: (centerName: string) => NodeKey | undefined;
  /** direct routing for DIRECT-basis pools. Returns the first direct node
   *  for the requested fee dept, or undefined for non-fee depts. */
  resolveDirectNode: (deptCode: MatrixDeptCode) => NodeKey | undefined;
}

/** One per (processing pool, receiver). The processing pool's home center
 *  is `fromKey`; the receiver is `toKey`. firstAmount is the pool's own
 *  eligible × percent; secondAmount is the pool's share of incoming $ at
 *  its home center × percent; amount = first + second. */
export interface GlStepContribution {
  poolId: string;
  fromKey: NodeKey;
  fromName: string;
  stepIndex: number;
  firstAmount: number;
  secondAmount: number;
  amount: number;
  toKey: NodeKey;
}

export interface GlStepDownModel {
  /** Pre-step-down placement — each pool's eligible $ sits on its home
   *  center (or DIRECT target). Diagnostic only; the engine doesn't read
   *  this after init. */
  alloc1: Record<string, Record<NodeKey, number>>;
  /** Per-pool distribution after sequential closure. Each pool row shows
   *  what THAT pool distributed to each receiver via its own schedule —
   *  pool's own eligible + pool's share of any incoming $ at its home
   *  center. Matches NBS per-pool "Allocation Detail" attribution.
   *  Σ over pools of alloc2[*][node] = total $ landing on the node. */
  alloc2: Record<string, Record<NodeKey, number>>;
  /** Per-pool First Allocation — pool's own eligible × receiver percent.
   *  Matches the "First Allocation" column on a CAP PDF. */
  firstAllocation: Record<string, Record<NodeKey, number>>;
  /** Per-pool Second Allocation — pool's share of incomingRound1 at its
   *  home center × receiver percent (self excluded, renormalized). Single
   *  pass per the NBS two-step methodology — no iteration past Round 2. */
  secondAllocation: Record<string, Record<NodeKey, number>>;
  /** Per-center Round 1 incoming = Σ over pools of firstAllocation[*][center].
   *  Matches the "First Allocation" column in NBS's "Costs to be Allocated"
   *  report for the receiving center. */
  incomingRound1: Record<NodeKey, number>;
  /** Per-center Round 2 incoming = Σ over pools of secondAllocation[*][center].
   *  The Round 2 cross-flows that landed on this center from other pools'
   *  redistribution. Matches the "Second Allocation" column in NBS's
   *  "Costs to be Allocated" report. */
  incomingRound2: Record<NodeKey, number>;
  /** Indirect-node keys in step order. */
  stepOrder: NodeKey[];
  contributions: GlStepContribution[];
  /** Σ over pools of alloc2[*][direct]. The total $ each direct node
   *  received across every pool's distribution. */
  directTotals: Record<NodeKey, number>;
  byPool: Record<string, {
    rawAmount: number;
    eligibleAmount: number;
    excluded: number;
    /** $ this pool distributed to direct (terminal) nodes. */
    allocatedToDirect: number;
    /** $ this pool distributed to indirect nodes — not residual; the
     *  receiving indirect's own pools redistribute these via their own
     *  schedules and that flow shows up in their pool rows. */
    routedToIndirect: number;
    /** Eligible $ that did not reach any allowed receiver (the pool's
     *  schedule had no valid downstream target). */
    leakage: number;
  }>;
  nodes: GlNode[];
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

/** Build the engine graph from store state. Returns the node list, the
 *  driver matrix (per-node, per-basis units), and resolvers used by
 *  computeStepDownGl. */
export function buildEngineGraph(args: {
  capPools: CapPool[];
  allocationBases: AllocationBasis[];
  capCenterTotals: Record<string, number>;
  capCenterGlCodes: Record<string, string>;
  capReceivers: ReceiverEntry[];
}): GlEngineGraph {
  const {
    capPools, allocationBases, capCenterTotals, capCenterGlCodes, capReceivers,
  } = args;

  const nodes: GlNode[] = [];
  const nodeByKey = new Map<NodeKey, GlNode>();
  const addNode = (n: GlNode) => {
    if (nodeByKey.has(n.key)) return;
    nodes.push(n);
    nodeByKey.set(n.key, n);
  };

  // 1. Indirect nodes — one per cost center.
  const indirectNodeByCenter = new Map<string, NodeKey>();
  for (const centerName of Object.keys(capCenterTotals)) {
    const importedGl = capCenterGlCodes[centerName];
    const key = importedGl ?? seedCenterKey(centerName);
    addNode({
      key, glCode: key, name: centerName, role: "indirect",
      classification: CENTER_NAME_TO_CODE[centerName],
    });
    indirectNodeByCenter.set(centerName, key);
  }

  // 2. Every imported receiver glCode that isn't already an indirect center
  //    becomes a direct (terminal) node. Allocations stop here — sub-receivers
  //    are destinations, not pass-throughs. feeDept is set only when the
  //    receiver's classification matches PLAN/BLDG/ENG (the one place
  //    deptCode is consulted, for FBHR roll-up); every other classification
  //    leaves feeDept undefined and the node is invisible to FBHR.
  for (const r of capReceivers) {
    if (!r.glCode) continue;
    if (nodeByKey.has(r.glCode)) continue; // already an indirect center
    const isFeeDept = r.deptCode === "PLAN" || r.deptCode === "BLDG" || r.deptCode === "ENG";
    addNode({
      key: r.glCode, glCode: r.glCode, name: r.dept,
      role: "direct",
      feeDept: isFeeDept ? (r.deptCode as DeptCode) : undefined,
      classification: r.deptCode,
    });
  }

  // 3. Fee-dept fallbacks — ensure each PLAN/BLDG/ENG has at least one
  //    direct node so FBHR has somewhere to route to even when the import
  //    didn't publish a receiver for that fee dept.
  const directNodesByDept = new Map<DeptCode, NodeKey[]>();
  for (const dept of FEE_DEPTS) {
    const covered = nodes
      .filter((n) => n.role === "direct" && n.feeDept === dept)
      .map((n) => n.key);
    if (covered.length === 0) {
      const key = seedDeptKey(dept);
      addNode({
        key, glCode: key, name: dept, role: "direct", feeDept: dept,
        classification: dept,
      });
      directNodesByDept.set(dept, [key]);
    } else {
      directNodesByDept.set(dept, covered);
    }
  }

  // 3. Driver matrix.
  const drivers: GlDriverMatrix = {};
  for (const n of nodes) drivers[n.key] = {};

  // Seed indirect drivers: only when the indirect node is a seed node
  // (= no imported glCode for that center). Otherwise the seed values would
  // collide with imported per-receiver units and double-count.
  for (const indirectDept of INDIRECT_DEPTS) {
    const centerEntry = Object.entries(CENTER_NAME_TO_CODE)
      .find(([, code]) => code === indirectDept.code);
    if (!centerEntry) continue;
    const [centerName] = centerEntry;
    const nodeKey = indirectNodeByCenter.get(centerName);
    if (!nodeKey) continue;
    const node = nodeByKey.get(nodeKey)!;
    if (node.key.startsWith("seed:")) {
      drivers[nodeKey] = { ...(DRIVERS[indirectDept.code] ?? {}) };
    }
  }

  // Seed direct drivers: only when there's a single seed:dept node (no
  // imported direct receivers for that dept). Imported nodes get their
  // units from the receiver-aggregation pass below.
  for (const dept of FEE_DEPTS) {
    const keys = directNodesByDept.get(dept) ?? [];
    if (keys.length === 1 && keys[0].startsWith("seed:")) {
      drivers[keys[0]] = { ...(DRIVERS[dept] ?? {}) };
    }
  }

  // Imported drivers: walk each pool's receivers and aggregate per-glCode
  // units per basis. Dedup within a (target node, basis) cell so a receiver
  // listed in multiple pools contributes its units once.
  const seenInCell = new Map<string, Set<string>>();
  for (const p of capPools) {
    if (!p.receivers || p.receivers.length === 0) continue;
    const { basis: driverKey } = basisForPool(p, allocationBases);
    if (driverKey === "DIRECT") continue;
    for (const r of p.receivers) {
      if (typeof r.units !== "number" || !Number.isFinite(r.units) || r.units <= 0) continue;
      const targetKey = resolveReceiverNode(r, nodeByKey);
      if (!targetKey) continue;
      const cellKey = `${targetKey}|${driverKey}`;
      let seen = seenInCell.get(cellKey);
      if (!seen) { seen = new Set(); seenInCell.set(cellKey, seen); }
      const receiverId = r.glCode ?? `noglcode:${r.dept.toLowerCase()}`;
      if (seen.has(receiverId)) continue;
      seen.add(receiverId);
      drivers[targetKey][driverKey] = (drivers[targetKey][driverKey] ?? 0) + r.units;
    }
  }

  const resolveCenterNode = (centerName: string): NodeKey | undefined =>
    indirectNodeByCenter.get(centerName);

  const resolveDirectNode = (deptCode: MatrixDeptCode): NodeKey | undefined => {
    if (deptCode === "PLAN" || deptCode === "BLDG" || deptCode === "ENG") {
      return directNodesByDept.get(deptCode)?.[0];
    }
    return undefined;
  };

  return { nodes, drivers, resolveCenterNode, resolveDirectNode };
}

/** Look up the node for an imported receiver. glCode is the only signal —
 *  no classification fallback. Receivers without a glCode are surfaced to
 *  the review queue upstream (buildReceiverRegistry.missing). */
function resolveReceiverNode(
  r: { glCode?: string },
  nodeByKey: Map<NodeKey, GlNode>,
): NodeKey | undefined {
  if (r.glCode && nodeByKey.has(r.glCode)) return r.glCode;
  return undefined;
}

// ---------------------------------------------------------------------------
// Step-down compute
// ---------------------------------------------------------------------------

/** Sequential two-phase CAP allocation over the glCode graph — matches NBS
 *  published full-cost methodology.
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
 *        (= NBS's "Gross Allocation" / "First Allocation" column total)
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
 *  Matches the per-pool "Allocation Detail" page in the NBS PDF cell-for-
 *  cell. DIRECT-basis pools route their full eligible to their single
 *  fee-dept target in Phase 1 and skip Phase 2.
 */
export function computeStepDownGl(args: {
  pools: CapPool[];
  centerOrder: string[];
  bases: AllocationBasis[];
  graph: GlEngineGraph;
}): GlStepDownModel {
  const { pools, centerOrder, bases, graph } = args;
  const { nodes, drivers, resolveCenterNode, resolveDirectNode } = graph;

  const indirectNodes = nodes.filter((n) => n.role === "indirect");
  const directNodes   = nodes.filter((n) => n.role === "direct");
  const allNodeKeys   = new Set<NodeKey>(nodes.map((n) => n.key));
  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));

  // Step order — display ordering only. Math runs in parallel.
  const stepOrder: NodeKey[] = [];
  const seenStep = new Set<NodeKey>();
  for (const cn of centerOrder) {
    const k = resolveCenterNode(cn);
    if (k && !seenStep.has(k)) { stepOrder.push(k); seenStep.add(k); }
  }
  for (const n of indirectNodes) {
    if (!seenStep.has(n.key)) { stepOrder.push(n.key); seenStep.add(n.key); }
  }

  const zeroRow = (): Record<NodeKey, number> =>
    Object.fromEntries(nodes.map((n) => [n.key, 0])) as Record<NodeKey, number>;

  // alloc1 — pre-step-down placement. Diagnostic only.
  const alloc1: Record<string, Record<NodeKey, number>> = {};
  for (const p of pools) {
    const row = zeroRow();
    const eligible = p.amount * (p.eligiblePercent / 100);
    const { basis, directTo } = basisForPool(p, bases);
    if (basis === "DIRECT") {
      if (directTo) {
        const k = resolveDirectNode(directTo);
        if (k) row[k] = eligible;
      }
    } else {
      const k = resolveCenterNode(p.center);
      if (k) row[k] = eligible;
    }
    alloc1[p.id] = row;
  }

  const firstAllocation: Record<string, Record<NodeKey, number>> = {};
  const secondAllocation: Record<string, Record<NodeKey, number>> = {};
  for (const p of pools) {
    firstAllocation[p.id] = zeroRow();
    secondAllocation[p.id] = zeroRow();
  }

  // Pre-bucket each center's own pools (used for Round 2 weighting).
  const ownPoolsByCenter = new Map<NodeKey, CapPool[]>();
  for (const p of pools) {
    const homeKey = resolveCenterNode(p.center);
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

    // Published receiver schedule.
    const receivers = op.receivers ?? [];
    const validReceivers = receivers.filter(
      (r) => r.glCode
        && allNodeKeys.has(r.glCode)
        && !excludeKeys.has(r.glCode)
        && (r.percent ?? 0) > 0,
    );
    const totalPct = validReceivers.reduce((a, r) => a + (r.percent ?? 0), 0);

    if (totalPct > 0) {
      for (const r of validReceivers) {
        const targetKey = r.glCode!;
        const share = amount * ((r.percent ?? 0) / totalPct);
        allocMap[targetKey] = (allocMap[targetKey] ?? 0) + share;
        distributed[targetKey] = (distributed[targetKey] ?? 0) + share;
      }
      return distributed;
    }

    // Driver-unit fallback (seed pools without imported receivers).
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

  // incomingRound1 will hold per-center First Incoming (= upstream Phase 1
  // contributions to center). NBS reports this as the "First Allocation"
  // column in the receiving center's "Costs to be Allocated" view.
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
      const ph = resolveCenterNode(p.center);
      if (!ph || !upstreamKeys.has(ph)) continue;
      firstInc += firstAllocation[p.id]?.[centerKey] ?? 0;
    }
    incomingRound1[centerKey] = firstInc;

    const centerPools = ownPoolsByCenter.get(centerKey) ?? [];

    // Pool weight at this center = pool.allocationPercent ÷ Σ allocationPercent.
    // This is the published split (e.g. Town Center Operations' 64.40 / 25 /
    // 10.60), and it works for zero-eligible internal-service centers where
    // an eligible-derived ratio would be 0/0. For ordinary pools the
    // allocationPercent column already equals each pool's share of total
    // center eligible, so the two formulas agree. Fall back to an even
    // split only when no allocationPercent is published anywhere.
    const totalAllocPct = centerPools.reduce(
      (a, p) => a + (p.allocationPercent ?? 0), 0,
    );
    const weightOf = (p: CapPool): number =>
      totalAllocPct > 0
        ? (p.allocationPercent ?? 0) / totalAllocPct
        : 1 / Math.max(1, centerPools.length);

    for (const p of centerPools) {
      const eligible = p.amount * (p.eligiblePercent / 100);
      const poolWeight = weightOf(p);
      const { basis, directTo } = basisForPool(p, bases);
      if (basis === "DIRECT") {
        // Direct-billed pools route own + share-of-incoming to the single
        // fee-dept target — no schedule, no exclusions, no Phase 2.
        const firstPool = eligible + poolWeight * firstInc;
        if (firstPool > 0 && directTo) {
          const k = resolveDirectNode(directTo);
          if (k) firstAllocation[p.id][k] = (firstAllocation[p.id][k] ?? 0) + firstPool;
        }
        continue;
      }
      const firstPool = eligible + poolWeight * firstInc;
      if (firstPool <= 0) continue;
      distributeAmount(p, firstPool, firstAllocation[p.id], new Set());
    }
  }

  // Also handle pools whose home center isn't in stepOrder (defensive —
  // shouldn't happen, but covers any legacy data).
  const stepOrderSet = new Set(stepOrder);
  for (const p of pools) {
    const homeKey = resolveCenterNode(p.center);
    if (homeKey && stepOrderSet.has(homeKey)) continue;
    const eligible = p.amount * (p.eligiblePercent / 100);
    if (eligible <= 0) continue;
    const { basis, directTo } = basisForPool(p, bases);
    if (basis === "DIRECT") {
      if (directTo) {
        const k = resolveDirectNode(directTo);
        if (k) firstAllocation[p.id][k] = (firstAllocation[p.id][k] ?? 0) + eligible;
      }
      continue;
    }
    distributeAmount(p, eligible, firstAllocation[p.id], new Set());
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
      const ph = resolveCenterNode(p.center);
      if (ph && upstreamKeys.has(ph)) {
        totalReceived += secondAllocation[p.id]?.[centerKey] ?? 0;
      }
    }
    const firstInc = incomingRound1[centerKey] ?? 0;
    const secondInc = totalReceived - firstInc;
    if (secondInc <= 0) continue;

    const centerPools = ownPoolsByCenter.get(centerKey) ?? [];

    // Same weight rule as Phase 1: published allocationPercent split.
    const totalAllocPct = centerPools.reduce(
      (a, p) => a + (p.allocationPercent ?? 0), 0,
    );
    const weightOf = (p: CapPool): number =>
      totalAllocPct > 0
        ? (p.allocationPercent ?? 0) / totalAllocPct
        : 1 / Math.max(1, centerPools.length);

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

  // incomingRound2[centerKey] = Σ over pools of secondAllocation[*][centerKey]
  // The Phase 2 cross-flows that landed on this center, summed across all
  // sources. Equals NBS's "Second Allocation" column total minus the
  // self + downstream Phase 1 contributions (which are also categorized
  // there in NBS's per-source view).
  const incomingRound2: Record<NodeKey, number> = {};
  for (const n of indirectNodes) incomingRound2[n.key] = 0;
  for (const p of pools) {
    for (const n of indirectNodes) {
      const share = secondAllocation[p.id]?.[n.key] ?? 0;
      if (share > 0) incomingRound2[n.key] = (incomingRound2[n.key] ?? 0) + share;
    }
  }

  // -----------------------------------------------------------------------
  // Contributions — one entry per (pool, receiver) carrying first + second.
  const contributions: GlStepContribution[] = [];
  for (const p of pools) {
    const homeKey = resolveCenterNode(p.center);
    const homeNode = homeKey ? nodeByKey.get(homeKey) : undefined;
    const fromName = homeNode?.name ?? p.center;
    const stepIndex = homeKey ? Math.max(1, stepOrder.indexOf(homeKey) + 1) : 1;

    const f = firstAllocation[p.id] ?? {};
    const s = secondAllocation[p.id] ?? {};
    const seen = new Set<NodeKey>();
    for (const k of Object.keys(f)) if ((f[k] ?? 0) > 0) seen.add(k);
    for (const k of Object.keys(s)) if ((s[k] ?? 0) > 0) seen.add(k);
    for (const targetKey of seen) {
      const firstAmount  = f[targetKey] ?? 0;
      const secondAmount = s[targetKey] ?? 0;
      contributions.push({
        poolId: p.id,
        fromKey: homeKey ?? p.center,
        fromName,
        stepIndex,
        firstAmount, secondAmount, amount: firstAmount + secondAmount,
        toKey: targetKey,
      });
    }
  }

  // === alloc2 = First + Second per pool per receiver ===
  const alloc2: Record<string, Record<NodeKey, number>> = {};
  for (const p of pools) {
    const row = zeroRow();
    const f = firstAllocation[p.id] ?? {};
    const s = secondAllocation[p.id] ?? {};
    for (const n of nodes) {
      row[n.key] = (f[n.key] ?? 0) + (s[n.key] ?? 0);
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

  const byPool: GlStepDownModel["byPool"] = {};
  for (const p of pools) {
    const rawAmount = p.amount;
    const eligibleAmount = rawAmount * (p.eligiblePercent / 100);
    const excluded = rawAmount - eligibleAmount;
    const allocatedToDirect = directNodes.reduce(
      (a, d) => a + (alloc2[p.id]?.[d.key] ?? 0), 0,
    );
    const routedToIndirect = indirectNodes.reduce(
      (a, d) => a + (alloc2[p.id]?.[d.key] ?? 0), 0,
    );
    // Leakage = pool's eligible that didn't reach any receiver via First
    // Allocation. (Pool may have gotten a second allocation portion too,
    // but that's tracked through the receiving center's flow and isn't a
    // separate "leakage" attributable to this pool.)
    const firstAllocSum = nodes.reduce(
      (a, n) => a + (firstAllocation[p.id]?.[n.key] ?? 0), 0,
    );
    const leakage = Math.max(0, eligibleAmount - firstAllocSum);
    byPool[p.id] = {
      rawAmount, eligibleAmount, excluded,
      allocatedToDirect, routedToIndirect, leakage,
    };
  }

  return {
    alloc1, alloc2, firstAllocation, secondAllocation,
    incomingRound1, incomingRound2,
    stepOrder, contributions, directTotals, byPool, nodes,
  };
}

/** FBHR roll-up (reading B): sum direct-node totals into each fee dept by
 *  the node's feeDept classification. Multiple direct nodes per dept (i.e.
 *  several imported PLAN-classified glCodes) all contribute. */
export function capAllocatedFromGl(
  model: GlStepDownModel,
): Record<DeptCode, number> {
  const out: Record<DeptCode, number> = { PLAN: 0, BLDG: 0, ENG: 0 };
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
