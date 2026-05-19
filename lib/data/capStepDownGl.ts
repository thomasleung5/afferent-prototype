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
  AllocationBasis, BasisKey, CapPool, DeptCode, MatrixDeptCode,
} from "../types";
import {
  basisForPool, CENTER_NAME_TO_CODE, DRIVERS, INDIRECT_DEPTS,
  type CapStepDownMethod,
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

export interface GlStepContribution {
  poolId: string;
  fromKey: NodeKey;
  fromName: string;
  stepIndex: number;
  amount: number;
  toKey: NodeKey;
}

export interface GlStepDownModel {
  alloc1: Record<string, Record<NodeKey, number>>;
  alloc2: Record<string, Record<NodeKey, number>>;
  /** Indirect-node keys in step order. */
  stepOrder: NodeKey[];
  contributions: GlStepContribution[];
  directTotals: Record<NodeKey, number>;
  byPool: Record<string, {
    rawAmount: number;
    eligibleAmount: number;
    excluded: number;
    allocatedToDirect: number;
    residual: number;
    leakage: number;
  }>;
  method: CapStepDownMethod;
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

  // 2. Direct nodes — per fee dept, one node per imported direct-classified
  //    receiver glCode; else a single seed:dept node.
  const directNodesByDept = new Map<DeptCode, NodeKey[]>();
  for (const dept of FEE_DEPTS) {
    const directReceivers = capReceivers.filter(
      (r) => r.deptCode === dept && r.glCode,
    );
    if (directReceivers.length === 0) {
      const key = seedDeptKey(dept);
      addNode({
        key, glCode: key, name: dept, role: "direct", feeDept: dept,
        classification: dept,
      });
      directNodesByDept.set(dept, [key]);
    } else {
      const keys: NodeKey[] = [];
      for (const r of directReceivers) {
        const key = r.glCode!;
        addNode({
          key, glCode: key, name: r.dept, role: "direct", feeDept: dept,
          classification: dept,
        });
        keys.push(key);
      }
      directNodesByDept.set(dept, keys);
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
      const targetKey = resolveReceiverNode(r, nodeByKey, indirectNodeByCenter, directNodesByDept);
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

/** Map an imported receiver onto an engine node. Prefers an exact glCode
 *  match against an existing node; falls back to classification → first
 *  direct node for fee depts or the seed indirect node for indirect depts. */
function resolveReceiverNode(
  r: { glCode?: string; dept: string; deptCode: MatrixDeptCode | "OTHER" },
  nodeByKey: Map<NodeKey, GlNode>,
  indirectNodeByCenter: Map<string, NodeKey>,
  directNodesByDept: Map<DeptCode, NodeKey[]>,
): NodeKey | undefined {
  if (r.glCode && nodeByKey.has(r.glCode)) return r.glCode;
  if (r.deptCode === "OTHER") return undefined;
  if (r.deptCode === "PLAN" || r.deptCode === "BLDG" || r.deptCode === "ENG") {
    return directNodesByDept.get(r.deptCode)?.[0];
  }
  const centerEntry = Object.entries(CENTER_NAME_TO_CODE)
    .find(([, code]) => code === r.deptCode);
  return centerEntry ? indirectNodeByCenter.get(centerEntry[0]) : undefined;
}

// ---------------------------------------------------------------------------
// Step-down compute
// ---------------------------------------------------------------------------

/** Step-down over the glCode graph. Same conservation as the legacy engine:
 *  Σ pool.eligibleAmount ≈ Σ alloc2[pool][directNode] (FP rounding aside). */
export function computeStepDownGl(args: {
  pools: CapPool[];
  centerOrder: string[];
  bases: AllocationBasis[];
  graph: GlEngineGraph;
  method?: CapStepDownMethod;
}): GlStepDownModel {
  const { pools, centerOrder, bases, graph } = args;
  const method = args.method ?? "step-down";
  const { nodes, drivers, resolveCenterNode, resolveDirectNode } = graph;

  const indirectNodes = nodes.filter((n) => n.role === "indirect");
  const directNodes   = nodes.filter((n) => n.role === "direct");
  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));

  // Step order: user-defined centerOrder first, then any indirect nodes the
  // user hasn't placed yet (mirrors legacy indirectOrder).
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

  // === INITIAL PLACEMENT ===
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

  // === STEP-DOWN ===
  const running: Record<string, Record<NodeKey, number>> = {};
  for (const p of pools) running[p.id] = { ...alloc1[p.id] };

  const contributions: GlStepContribution[] = [];

  const pushSitting = (
    p: CapPool, fromKey: NodeKey, receivers: GlNode[], stepIndex: number,
  ) => {
    const sitting = running[p.id][fromKey] ?? 0;
    if (sitting <= 0) return;
    const { basis } = basisForPool(p, bases);
    if (basis === "DIRECT") return;
    const fromNode = nodeByKey.get(fromKey);
    const fromName = fromNode?.name ?? fromKey;

    const totalDriver = receivers.reduce(
      (a, r) => a + (drivers[r.key]?.[basis] ?? 0), 0,
    );
    if (totalDriver <= 0) return;

    for (const r of receivers) {
      const drv = drivers[r.key]?.[basis] ?? 0;
      if (drv <= 0) continue;
      const share = sitting * (drv / totalDriver);
      running[p.id][r.key] = (running[p.id][r.key] ?? 0) + share;
      contributions.push({
        poolId: p.id, fromKey, fromName, stepIndex, amount: share, toKey: r.key,
      });
    }
    running[p.id][fromKey] = 0;
  };

  if (method === "double-step-down") {
    // First allocation: each pool's eligible amount goes from its home to
    // all other indirect nodes plus all direct nodes.
    for (const p of pools) {
      const homeKey = resolveCenterNode(p.center);
      if (!homeKey) continue;
      const others = indirectNodes.filter((n) => n.key !== homeKey);
      pushSitting(p, homeKey, [...others, ...directNodes], 1);
    }
    // Second allocation: each indirect node closes to direct nodes only.
    stepOrder.forEach((I, i) => {
      for (const p of pools) pushSitting(p, I, directNodes, i + 2);
    });
  } else {
    stepOrder.forEach((I, i) => {
      const remainingIndirects = stepOrder.slice(i + 1)
        .map((k) => nodeByKey.get(k))
        .filter((n): n is GlNode => !!n);
      const receivers = [...remainingIndirects, ...directNodes];
      for (const p of pools) pushSitting(p, I, receivers, i + 1);
    });
  }

  const alloc2 = running;

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
    const residual = indirectNodes.reduce(
      (a, d) => a + (alloc2[p.id]?.[d.key] ?? 0), 0,
    );
    byPool[p.id] = {
      rawAmount, eligibleAmount, excluded, allocatedToDirect, residual,
      leakage: eligibleAmount - allocatedToDirect - residual,
    };
  }

  return {
    alloc1, alloc2, stepOrder, contributions, directTotals, byPool, method, nodes,
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
