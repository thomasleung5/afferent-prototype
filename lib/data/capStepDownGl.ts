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
  /** Per-pool Second Allocation — pool's share of incoming $ at its home
   *  center × receiver percent. Matches "Second Allocation". */
  secondAllocation: Record<string, Record<NodeKey, number>>;
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

/** Single-pass sequential step-down over the glCode graph, with
 *  processing-pool attribution (matches the NBS CAP PDF format).
 *
 *  Each indirect center I closes once in `centerOrder`. When I closes:
 *    - X = incoming[I], the $ accumulated at I from earlier centers.
 *    - For each of I's own pools `op`:
 *        opEligible  = op.amount × op.eligiblePercent / 100
 *        opWeight    = opEligible / totalOwnEligible  (or 1/N if all zero)
 *        firstAmount  = opEligible             // pool's own
 *        secondAmount = X × opWeight           // pool's share of incoming
 *        Distribute (firstAmount + secondAmount) via op's receiver schedule,
 *        filtered to downstream-or-direct and renormalized to 100%.
 *        Each receiver share goes into:
 *           - firstAllocation[op.id][receiver] (the first slice)
 *           - secondAllocation[op.id][receiver] (the second slice)
 *           - alloc2[op.id][receiver] (the combined cell value)
 *        If the receiver is an indirect downstream center, also accumulate
 *        in incoming[receiver] so the receiver's own pools can redistribute
 *        when their turn comes.
 *    - I is closed (incoming[I] := 0). Predecessors cannot receive from I.
 *
 *  Per-pool conservation:
 *    Σ over receivers of alloc2[op.id][r] = opEligible + opWeight × incoming
 *
 *  System conservation:
 *    Σ over pools of allocatedToDirect ≈ Σ pool eligibles (modulo leakage
 *    when a pool's schedule has no allowed receivers).
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
  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));

  // Step order: user-defined centerOrder first, then any indirect nodes the
  // user hasn't placed yet (cleanup tail).
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

  // === INITIAL PLACEMENT (alloc1) ===
  // Each pool's eligible $ sits on its home center (or DIRECT target).
  // Diagnostic only — engine uses incoming[] for the actual flow.
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

  // === PER-POOL ATTRIBUTION ===
  // What THIS pool distributed to each receiver. First = own × percent;
  // Second = incoming portion × percent; Total in alloc2 = first + second.
  const firstAllocation: Record<string, Record<NodeKey, number>> = {};
  const secondAllocation: Record<string, Record<NodeKey, number>> = {};
  for (const p of pools) {
    firstAllocation[p.id] = zeroRow();
    secondAllocation[p.id] = zeroRow();
  }

  // DIRECT-basis pools route their full eligible amount straight to the
  // single target — that's First Allocation with no schedule.
  for (const p of pools) {
    const eligible = p.amount * (p.eligiblePercent / 100);
    const { basis, directTo } = basisForPool(p, bases);
    if (basis === "DIRECT" && directTo) {
      const k = resolveDirectNode(directTo);
      if (k) firstAllocation[p.id][k] += eligible;
    }
  }

  // incoming[centerKey] — $ accumulated at an indirect center waiting for
  // it to close and redistribute via its own pool schedules.
  const incoming: Record<NodeKey, number> = {};
  for (const n of indirectNodes) incoming[n.key] = 0;

  const contributions: GlStepContribution[] = [];

  // Pre-bucket each center's own pools.
  const ownPoolsByCenter = new Map<NodeKey, CapPool[]>();
  for (const p of pools) {
    const homeKey = resolveCenterNode(p.center);
    if (!homeKey) continue;
    const list = ownPoolsByCenter.get(homeKey) ?? [];
    list.push(p);
    ownPoolsByCenter.set(homeKey, list);
  }

  // ------------------------------------------------------------------------
  // distributeAmount — apply pool op's schedule to `amount`, writing into
  // `allocMap` (firstAllocation or secondAllocation). Filters receivers to
  // downstream-or-direct, renormalizes percents, and updates incoming[]
  // for indirect receivers. Returns the share distributed per receiver,
  // keyed by glCode, so contributions can aggregate first/second together.
  const distributeAmount = (
    op: CapPool, amount: number, allocMap: Record<NodeKey, number>,
    allowedKeys: Set<NodeKey>, allowedNodes: GlNode[],
  ): Record<NodeKey, number> => {
    const distributed: Record<NodeKey, number> = {};
    if (amount <= 0) return distributed;

    // Try the published receiver schedule first.
    const receivers = op.receivers ?? [];
    const validReceivers = receivers.filter(
      (r) => r.glCode && allowedKeys.has(r.glCode) && (r.percent ?? 0) > 0,
    );
    const totalPct = validReceivers.reduce((a, r) => a + (r.percent ?? 0), 0);

    if (totalPct > 0) {
      for (const r of validReceivers) {
        const targetKey = r.glCode!;
        const share = amount * ((r.percent ?? 0) / totalPct);
        allocMap[targetKey] = (allocMap[targetKey] ?? 0) + share;
        distributed[targetKey] = (distributed[targetKey] ?? 0) + share;
        const targetNode = nodeByKey.get(targetKey);
        if (targetNode?.role === "indirect") {
          incoming[targetKey] = (incoming[targetKey] ?? 0) + share;
        }
      }
      return distributed;
    }

    // Fall back to driver units (seed pools without imported receivers).
    const { basis } = basisForPool(op, bases);
    if (basis === "DIRECT") return distributed;
    const totalDriver = allowedNodes.reduce(
      (a, n) => a + (drivers[n.key]?.[basis] ?? 0), 0,
    );
    if (totalDriver <= 0) return distributed;
    for (const n of allowedNodes) {
      const drv = drivers[n.key]?.[basis] ?? 0;
      if (drv <= 0) continue;
      const share = amount * (drv / totalDriver);
      allocMap[n.key] = (allocMap[n.key] ?? 0) + share;
      distributed[n.key] = (distributed[n.key] ?? 0) + share;
      if (n.role === "indirect") {
        incoming[n.key] = (incoming[n.key] ?? 0) + share;
      }
    }
    return distributed;
  };

  // ------------------------------------------------------------------------
  // SEQUENTIAL CLOSURE — process each indirect center once in centerOrder.
  for (let i = 0; i < stepOrder.length; i++) {
    const I = stepOrder[i];
    const nodeI = nodeByKey.get(I);
    if (!nodeI) continue;
    const stepIndex = i + 1;

    const downstreamIndirects = stepOrder.slice(i + 1)
      .map((k) => nodeByKey.get(k))
      .filter((n): n is GlNode => !!n);
    const allowedNodes = [...downstreamIndirects, ...directNodes];
    const allowedKeys = new Set<NodeKey>(allowedNodes.map((n) => n.key));

    const ownPools = ownPoolsByCenter.get(I) ?? [];
    if (ownPools.length === 0) {
      // No schedule — anything accumulated here cannot be redistributed.
      // Close and lose the residual as leakage.
      incoming[I] = 0;
      continue;
    }

    const totalOwnEligible = ownPools.reduce(
      (a, p) => a + p.amount * (p.eligiblePercent / 100), 0,
    );
    const X = incoming[I];

    for (const op of ownPools) {
      const opEligible = op.amount * (op.eligiblePercent / 100);
      const opWeight = totalOwnEligible > 0
        ? opEligible / totalOwnEligible
        : 1 / ownPools.length;
      const firstAmount  = opEligible;       // pool's own
      const secondAmount = X * opWeight;     // pool's share of incoming

      // Distribute each slice independently so first/second remain
      // separately attributable. Both write into alloc2 indirectly via
      // their respective maps; the alloc2 sum is computed below.
      const firstDist = distributeAmount(
        op, firstAmount, firstAllocation[op.id], allowedKeys, allowedNodes,
      );
      const secondDist = distributeAmount(
        op, secondAmount, secondAllocation[op.id], allowedKeys, allowedNodes,
      );

      // Emit one combined contribution per receiver for the trace UI.
      const seenReceivers = new Set<NodeKey>([
        ...Object.keys(firstDist),
        ...Object.keys(secondDist),
      ]);
      for (const targetKey of seenReceivers) {
        const f = firstDist[targetKey] ?? 0;
        const s = secondDist[targetKey] ?? 0;
        contributions.push({
          poolId: op.id, fromKey: I, fromName: nodeI.name, stepIndex,
          firstAmount: f, secondAmount: s, amount: f + s, toKey: targetKey,
        });
      }
    }

    incoming[I] = 0;
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
