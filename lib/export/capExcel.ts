/* Excel exporter for the Cost Allocation Plan deliverable. Builds a
 * multi-sheet workbook via SheetJS and triggers a client-side download.
 *
 * Sheets:
 *   1. Summary            — methodology overview + step-down ordering
 *   2. Cost Centers       — gross/disallowed/net per center
 *   3. Allocation Bases   — driver definitions + units per node
 *   4. Cost Pools         — per-pool eligible $ + basis + recovery target
 *   5. Allocation by Center — for each center in step order: its
 *                                "Costs to be Allocated" summary block
 *                                followed by every pool's per-receiver
 *                                schedule (First, Second, Total).
 *   6. Allocation Matrix  — pool×direct-receiver final allocations
 *   7. FBHR Roll-up       — direct-dept totals → PLAN / BLDG / ENG
 *
 * Mirrors the structure of lib/export/excel.ts (fee study exporter). */

import type { AllocationBasis, CapPool } from "../types";
import type { GlNode, GlStepDownModel } from "../data/capStepDownGl";
import { basisForPool } from "../data/capStepDown";
import { FEE_DEPTS } from "../data/departments";

type Cell = string | number | null | { v: string | number; t?: "s" | "n"; z?: string; s?: unknown };

export interface CapExportPayload {
  cityName: string;
  fiscal: string;
  generatedAt: string;
  capPools: CapPool[];
  allocationBases: AllocationBasis[];
  capCenterTotals: Record<string, number>;
  capCenterDisallowed: Record<string, number>;
  capCenterOrder: string[];
  model: GlStepDownModel;
  fbhrRollup: Record<string, number>;
}

export async function exportCapXlsx(p: CapExportPayload): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  addSheet(XLSX, wb, "Summary",                 buildSummary(p),              [28, 60]);
  addSheet(XLSX, wb, "Cost Centers",            buildCenters(p),              [4, 12, 36, 16, 16, 16, 8]);
  addSheet(XLSX, wb, "Allocation Bases",        buildBases(p),                [30, 14, 50]);
  addSheet(XLSX, wb, "Cost Pools",              buildPools(p),                [12, 30, 38, 14, 12, 12, 14]);
  addSheet(XLSX, wb, "Allocation by Center",    buildAllocationByCenter(p),   [4, 30, 36, 16, 12, 12, 14, 14, 14, 14]);
  addSheet(XLSX, wb, "Allocation Matrix",       buildAllocationMatrix(p),     [12, 30, 38, ...new Array(20).fill(14)]);
  addSheet(XLSX, wb, "FBHR Roll-up",            buildFbhrRollup(p),           [20, 16, 60]);

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ============================================================================
// Sheet builders
// ============================================================================

function buildSummary(p: CapExportPayload): Cell[][] {
  const totalGross = Object.values(p.capCenterTotals).reduce((a, v) => a + v, 0);
  const totalDisallowed = Object.values(p.capCenterDisallowed).reduce((a, v) => a + v, 0);
  const totalNet = Math.max(0, totalGross - totalDisallowed);
  const indirectNodes = p.model.nodes.filter((n) => n.role === "indirect");
  const directNodes = p.model.nodes.filter((n) => n.role === "direct");

  return [
    [h("Cost Allocation Plan — Summary")],
    [],
    ["City",            p.cityName],
    ["Fiscal year",     p.fiscal],
    ["Generated",       new Date(p.generatedAt).toLocaleString()],
    [],
    [h("Scope")],
    ["Indirect cost centers",        indirectNodes.length],
    ["Direct receiving departments", directNodes.length],
    ["Cost pools",                   p.capPools.length],
    ["Allocation bases",             p.allocationBases.length],
    [],
    [h("Allocable budget")],
    ["Total Expenses (gross)",       n(totalGross, "$#,##0")],
    ["Disallowed Expenses",          n(totalDisallowed, "$#,##0")],
    ["Net Allocable Expenses",       n(totalNet, "$#,##0")],
    [],
    [h("Methodology")],
    ["Approach", "Sequential two-phase step-down allocation (NBS-aligned)"],
    [
      "Phase 1 (First Allocation)",
      "Each pool distributes (own eligible + pool-weight × upstream First Incoming) via its receiver schedule with no exclusions.",
    ],
    [
      "Phase 2 (Second Allocation)",
      "Each pool distributes (pool-weight × Second Incoming) via its schedule with self + upstream excluded; surviving percents renormalized to 100%.",
    ],
    [
      "First Incoming",
      "Σ upstream centers' Phase 1 contributions to this center (= NBS \"First Allocation\" incoming column).",
    ],
    [
      "Second Incoming",
      "Total Received − First Incoming (= self + downstream Phase 1 + upstream Phase 2).",
    ],
    [],
    [h("Step-down order")],
    ...p.model.stepOrder.map((k, i) => {
      const node = p.model.nodes.find((n) => n.key === k);
      return [String(i + 1).padStart(2, "0"), node?.name ?? k];
    }),
  ];
}

function buildCenters(p: CapExportPayload): Cell[][] {
  const rows: Cell[][] = [
    [h("#"), h("glCode"), h("Center"), h("Total Expenses"), h("Disallowed"), h("Net Allocable"), h("Pools")],
  ];
  const poolCountByCenter = new Map<string, number>();
  for (const pl of p.capPools) {
    poolCountByCenter.set(pl.center, (poolCountByCenter.get(pl.center) ?? 0) + 1);
  }
  const glByName = glCodeByCenter(p);
  let totalGross = 0;
  let totalDisallowed = 0;
  p.capCenterOrder.forEach((name, i) => {
    const gross = p.capCenterTotals[name] ?? 0;
    const dis   = p.capCenterDisallowed[name] ?? 0;
    const net   = Math.max(0, gross - dis);
    totalGross += gross;
    totalDisallowed += dis;
    rows.push([
      i + 1,
      glByName.get(name) ?? "—",
      name,
      n(gross, "$#,##0"),
      n(dis, "$#,##0"),
      n(net, "$#,##0"),
      poolCountByCenter.get(name) ?? 0,
    ]);
  });
  rows.push([
    "", "",
    h("Total"),
    n(totalGross, "$#,##0"),
    n(totalDisallowed, "$#,##0"),
    n(Math.max(0, totalGross - totalDisallowed), "$#,##0"),
    "",
  ]);
  return rows;
}

/** Shared helper: center name → imported glCode (e.g. "011-1200" for City
 *  Manager). Returns an empty Map when no centers have imported glCodes. */
function glCodeByCenter(p: CapExportPayload): Map<string, string> {
  const m = new Map<string, string>();
  for (const nn of p.model.nodes) {
    if (nn.role !== "indirect") continue;
    if (nn.glCode.startsWith("seed:")) continue;
    m.set(nn.name, nn.glCode);
  }
  return m;
}

function buildBases(p: CapExportPayload): Cell[][] {
  const rows: Cell[][] = [
    [h("Allocation Basis"), h("Key"), h("Description")],
  ];
  for (const b of p.allocationBases) {
    rows.push([b.name, b.driverKey, b.methodologyNote ?? b.source ?? ""]);
  }
  return rows;
}

function buildPools(p: CapExportPayload): Cell[][] {
  const rows: Cell[][] = [
    [h("glCode"), h("Center"), h("Pool"), h("Basis"), h("Net allocable $")],
  ];
  const glByName = glCodeByCenter(p);
  let total = 0;
  for (const pl of p.capPools) {
    const { basis } = basisForPool(pl, p.allocationBases);
    total += pl.amount;
    rows.push([
      glByName.get(pl.center) ?? "—",
      pl.center,
      pl.pool,
      basis,
      n(pl.amount, "$#,##0"),
    ]);
  }
  rows.push(["", "", h("Total"), "", n(total, "$#,##0")]);
  return rows;
}

function buildAllocationByCenter(p: CapExportPayload): Cell[][] {
  // Wide schema that holds both blocks:
  //   1. Costs to be Allocated header → A=#, B=Center, C=Source, F=Pct,
  //      G=Gross, H=First, I=Second, J=Total
  //   2. Pool Allocation Detail header → A=Step, B=Pool, C=Receiver glCode,
  //      D=Receiver name, E=Section, F=Pct, G=Gross, H=First, I=Second, J=Total
  // Re-using the same 10-column grid keeps everything in one sheet and lets
  // Excel filters / freezes apply uniformly.
  const rows: Cell[][] = [
    [h("#"), h("Center / Pool"), h("Source / Receiver glCode"), h("Receiver Name"),
     h("Section"), h("Pct"), h("Gross"), h("First"), h("Second"), h("Total")],
  ];

  const stepIndex = new Map<string, number>();
  p.model.stepOrder.forEach((k, i) => {
    const node = p.model.nodes.find((nn) => nn.key === k);
    if (node) stepIndex.set(node.name, i);
  });
  const glByName = glCodeByCenter(p);

  const poolsByCenter = new Map<string, CapPool[]>();
  for (const pl of p.capPools) {
    const list = poolsByCenter.get(pl.center) ?? [];
    list.push(pl);
    poolsByCenter.set(pl.center, list);
  }
  for (const list of poolsByCenter.values()) {
    list.sort((a, b) => a.pool.localeCompare(b.pool));
  }

  const indirectNodes = p.model.nodes
    .filter((nn) => nn.role === "indirect")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));
  const directNodes = p.model.nodes
    .filter((nn) => nn.role === "direct")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));

  p.model.stepOrder.forEach((centerKey, centerIdx) => {
    const centerNode = p.model.nodes.find((nn) => nn.key === centerKey);
    if (!centerNode) return;
    const centerName = centerNode.name;
    const targetStep = stepIndex.get(centerName) ?? -1;
    const centerPools = poolsByCenter.get(centerName) ?? [];

    // -------- Center header band --------
    const stepLabel = String(centerIdx + 1).padStart(2, "0");
    const centerGl = glByName.get(centerName);
    const centerHeader = centerGl
      ? `${centerGl} · ${centerName.toUpperCase()}`
      : centerName.toUpperCase();
    rows.push([
      h(`STEP ${stepLabel}`),
      h(centerHeader),
      "", "", "", "", "", "", "", "",
    ]);

    // -------- Costs to be Allocated --------
    const departmental = centerPools
      .reduce((a, pl) => a + pl.amount, 0);

    const sources = new Map<string, { first: number; second: number }>();
    for (const node of p.model.nodes) {
      if (node.role === "indirect") sources.set(node.name, { first: 0, second: 0 });
    }
    for (const sp of p.capPools) {
      const srcStep = stepIndex.get(sp.center) ?? -1;
      const isUpstream = srcStep !== -1 && targetStep !== -1 && srcStep < targetStep;
      const r1 = p.model.firstAllocation[sp.id]?.[centerKey] ?? 0;
      const r2 = p.model.secondAllocation[sp.id]?.[centerKey] ?? 0;
      const first = isUpstream ? r1 : 0;
      const second = isUpstream ? r2 : (r1 + r2);
      const cur = sources.get(sp.center) ?? { first: 0, second: 0 };
      cur.first += first;
      cur.second += second;
      sources.set(sp.center, cur);
    }
    const sourceRows = [...sources.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (stepIndex.get(a.name) ?? 999) - (stepIndex.get(b.name) ?? 999));
    const totalFirst = sourceRows.reduce((a, r) => a + r.first, 0);
    const totalSecond = sourceRows.reduce((a, r) => a + r.second, 0);

    rows.push(["", h("Costs to be Allocated"), "", "", "", "", "", "", "", ""]);
    rows.push([
      "", "", "Departmental Expenditures", "", "", "",
      n(departmental, "$#,##0"), n(departmental, "$#,##0"), n(0, "$#,##0"), n(departmental, "$#,##0"),
    ]);
    for (const r of sourceRows) {
      const sourceGl = glByName.get(r.name);
      const baseLabel = sourceGl ? `${sourceGl} · ${r.name}` : r.name;
      const label = r.name === centerName ? `${baseLabel} (self)` : baseLabel;
      rows.push([
        "", "", label, "", "Incoming", "",
        "", n(r.first, "$#,##0"), n(r.second, "$#,##0"), n(r.first + r.second, "$#,##0"),
      ]);
    }
    rows.push([
      "", h("Total Incoming"), "", "", "", "",
      "", n(totalFirst, "$#,##0"), n(totalSecond, "$#,##0"), n(totalFirst + totalSecond, "$#,##0"),
    ]);
    rows.push([
      "", h("Total Costs to be Allocated"), "", "", "", "",
      "",
      n(departmental + totalFirst, "$#,##0"),
      n(totalSecond, "$#,##0"),
      n(departmental + totalFirst + totalSecond, "$#,##0"),
    ]);
    rows.push([]);

    // -------- Pool Allocation Detail for each pool at this center --------
    for (const pl of centerPools) {
      rows.push(["", h(`Pool · ${pl.pool}`), "", "", "", "", "", "", "", ""]);

      // Derive per-receiver percent from the engine's Phase 1 distribution
      // — first / Σ first across receivers. Reproduces the schedule that
      // actually got applied without re-reading the source basisUnits.
      const firstByNode = p.model.firstAllocation[pl.id] ?? {};
      const firstTotal = Object.values(firstByNode).reduce((a, v) => a + v, 0);

      const emit = (node: GlNode, section: string) => {
        const first = firstByNode[node.key] ?? 0;
        const second = p.model.secondAllocation[pl.id]?.[node.key] ?? 0;
        const gross = first;
        const total = first + second;
        if (first < 0.5 && second < 0.5) return;
        const pct = firstTotal > 0 ? (first / firstTotal) * 100 : 0;
        rows.push([
          "", "",
          node.glCode.startsWith("seed:") ? "" : node.glCode,
          node.name,
          section,
          n(pct / 100, "0.000%"),
          n(gross, "$#,##0"),
          n(first, "$#,##0"),
          n(second, "$#,##0"),
          n(total, "$#,##0"),
        ]);
      };
      for (const node of indirectNodes) emit(node, "Allocable");
      for (const node of directNodes)   emit(node, "Receiving");

      const allKeys = [...indirectNodes, ...directNodes].map((nn) => nn.key);
      const poolFirstTotal  = allKeys.reduce((a, k) => a + (p.model.firstAllocation[pl.id]?.[k] ?? 0), 0);
      const secondTotal = allKeys.reduce((a, k) => a + (p.model.secondAllocation[pl.id]?.[k] ?? 0), 0);
      rows.push([
        "", "", "", h("Pool total"), "",
        n(1, "0.000%"),
        n(poolFirstTotal, "$#,##0"),
        n(poolFirstTotal, "$#,##0"),
        n(secondTotal, "$#,##0"),
        n(poolFirstTotal + secondTotal, "$#,##0"),
      ]);
      rows.push([]);
    }
  });

  return rows;
}

function buildAllocationMatrix(p: CapExportPayload): Cell[][] {
  const directNodes = p.model.nodes
    .filter((n) => n.role === "direct")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));
  const glByName = glCodeByCenter(p);

  const header: Cell[] = [
    h("glCode"), h("Center"), h("Pool"),
    ...directNodes.map((n) => h(`${n.glCode.startsWith("seed:") ? "—" : n.glCode} · ${n.name}`)),
    h("Row total"),
  ];
  const rows: Cell[][] = [header];

  const sortByCenter = new Map<string, number>();
  p.model.stepOrder.forEach((k, i) => {
    const n = p.model.nodes.find((nn) => nn.key === k);
    if (n) sortByCenter.set(n.name, i);
  });
  const sortedPools = [...p.capPools].sort((a, b) => {
    const ai = sortByCenter.get(a.center) ?? 999;
    const bi = sortByCenter.get(b.center) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.pool.localeCompare(b.pool);
  });

  const colTotals = new Array<number>(directNodes.length).fill(0);
  for (const pl of sortedPools) {
    const row: Cell[] = [glByName.get(pl.center) ?? "—", pl.center, pl.pool];
    let rowTotal = 0;
    for (let i = 0; i < directNodes.length; i++) {
      const v = p.model.alloc2[pl.id]?.[directNodes[i].key] ?? 0;
      colTotals[i] += v;
      rowTotal += v;
      row.push(n(v, "$#,##0"));
    }
    row.push(n(rowTotal, "$#,##0"));
    rows.push(row);
  }
  const totalRow: Cell[] = ["", "", h("Column total")];
  for (const v of colTotals) totalRow.push(n(v, "$#,##0"));
  totalRow.push(n(colTotals.reduce((a, v) => a + v, 0), "$#,##0"));
  rows.push(totalRow);
  return rows;
}

function buildFbhrRollup(p: CapExportPayload): Cell[][] {
  const rows: Cell[][] = [
    [h("Fee Dept"), h("Allocated CAP $"), h("Notes")],
  ];
  for (const d of FEE_DEPTS) {
    rows.push([d, n(p.fbhrRollup[d] ?? 0, "$#,##0"), "Sum of direct-node totals tagged feeDept=" + d]);
  }
  const total = FEE_DEPTS.reduce((a, d) => a + (p.fbhrRollup[d] ?? 0), 0);
  rows.push(["", h("Total"), n(total, "$#,##0")]);
  return rows;
}

// ============================================================================
// Cell helpers
// ============================================================================

function h(label: string): Cell {
  return { v: label, t: "s", s: { font: { bold: true } } };
}

function n(value: number, format: string): Cell {
  if (!Number.isFinite(value)) return "";
  return { v: value, t: "n", z: format };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addSheet(XLSX: any, wb: any, name: string, rows: Cell[][], colWidths?: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (colWidths) {
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  } else {
    const first = rows[0] ?? [];
    ws["!cols"] = first.map(() => ({ wch: 18 }));
  }
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, name);
}
