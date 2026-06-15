/* Excel exporter for the Cost Allocation Plan deliverable. Builds a
 * multi-sheet workbook via the shared `buildXlsxBlob` helper and
 * triggers a client-side download.
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
import type { GlNode, GlStepDownModel, StepDownMethod } from "../data/capStepDownEngine";
import { basisForPool } from "../data/capBasisRouting";
import { FEE_DEPTS } from "../data/departments";
import { buildXlsxBlob, h, n, type Cell, type SheetSpec } from "./xlsx";

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
  /** Allocation method the engine ran. Drives the Summary sheet's
   *  methodology labels and descriptions so the exported workbook
   *  matches what the analyst selected in Allocation Detail. */
  stepDownMethod: StepDownMethod;
}

export async function exportCapXlsx(p: CapExportPayload): Promise<Blob> {
  const sheets: SheetSpec[] = [
    { name: "Summary",              rows: buildSummary(p),             columnWidths: [28, 60] },
    { name: "Cost Centers",         rows: buildCenters(p),             columnWidths: [4, 12, 36, 16, 16, 16, 8] },
    { name: "Allocation Bases",     rows: buildBases(p),               columnWidths: [30, 14, 50] },
    { name: "Cost Pools",           rows: buildPools(p),               columnWidths: [12, 30, 38, 14, 12, 12, 14] },
    {
      name: "Allocation by Center",
      rows: buildAllocationByCenter(p),
      // Trailing widths track the allocation-column block: 3 columns
      // (First/Second/Total) for double, 1 column (Allocation) for
      // single. Stays aligned with the row builders' column counts.
      columnWidths: p.stepDownMethod === "single"
        ? [4, 30, 36, 16, 12, 12, 14, 14]
        : [4, 30, 36, 16, 12, 12, 14, 14, 14, 14],
    },
    { name: "Allocation Matrix",    rows: buildAllocationMatrix(p),    columnWidths: [12, 30, 38, ...new Array(20).fill(14)] },
    { name: "FBHR Roll-up",         rows: buildFbhrRollup(p),          columnWidths: [20, 16, 60] },
  ];
  return buildXlsxBlob(sheets);
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
    ...methodologyRows(p.stepDownMethod),
    [],
    [h("Step-down order")],
    ...p.model.stepOrder.map((k, i) => {
      const node = p.model.nodes.find((n) => n.key === k);
      return [String(i + 1).padStart(2, "0"), node?.name ?? k];
    }),
  ];
}

// Methodology block for the Summary sheet. The double method is the
// historical NBS-aligned two-phase step-down; the single method is a
// one-pass variant that allocates each indirect center's costs directly
// to direct receivers only. Both labels match the Allocation Detail
// MethodPicker hint text so the export reads consistently with the UI.
function methodologyRows(method: StepDownMethod): Cell[][] {
  if (method === "single") {
    return [
      ["Approach", "Single step-down allocation (one pass, direct receivers only)"],
      [
        "Allocation",
        "Each indirect cost center allocates its costs once, distributing only to direct receivers. Receiver percents renormalize across the surviving direct receivers; no second pass.",
      ],
      [
        "Indirect-to-indirect transfers",
        "Suppressed — indirect centers do not receive from one another, so First Incoming is structurally zero and Phase 2 is skipped.",
      ],
    ];
  }
  return [
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
  ];
}

function buildCenters(p: CapExportPayload): Cell[][] {
  const rows: Cell[][] = [
    [h("#"), h("Code"), h("Center"), h("Total Expenses"), h("Disallowed"), h("Net Allocable"), h("Pools")],
  ];
  const poolCountByKey = new Map<string, number>();
  for (const pl of p.capPools) {
    poolCountByKey.set(pl.centerGlCode, (poolCountByKey.get(pl.centerGlCode) ?? 0) + 1);
  }
  const meta = centerMeta(p);
  let totalGross = 0;
  let totalDisallowed = 0;
  p.capCenterOrder.forEach((key, i) => {
    const gross = p.capCenterTotals[key] ?? 0;
    const dis   = p.capCenterDisallowed[key] ?? 0;
    const net   = Math.max(0, gross - dis);
    totalGross += gross;
    totalDisallowed += dis;
    const m = meta.get(key);
    rows.push([
      i + 1,
      m?.glCode ?? "—",
      m?.name ?? key,
      n(gross, "$#,##0"),
      n(dis, "$#,##0"),
      n(net, "$#,##0"),
      poolCountByKey.get(key) ?? 0,
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

/** Shared helper: center identity key → {name, glCode} pair. glCode is
 *  undefined for synth `seed:center:*` centers. Reads from the model's
 *  indirect nodes (which the engine populated from capCenterSources). */
function centerMeta(p: CapExportPayload): Map<string, { name: string; glCode?: string }> {
  const m = new Map<string, { name: string; glCode?: string }>();
  for (const nn of p.model.nodes) {
    if (nn.role !== "indirect") continue;
    m.set(nn.key, {
      name: nn.name,
      glCode: nn.glCode.startsWith("seed:") ? undefined : nn.glCode,
    });
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
    [h("Code"), h("Center"), h("Pool"), h("Basis"), h("Net allocable $")],
  ];
  const meta = centerMeta(p);
  let total = 0;
  for (const pl of p.capPools) {
    const resolution = basisForPool(pl, p.allocationBases);
    const basisLabel = resolution.status === "resolved"
      ? resolution.basis.name
      : "(unresolved basis)";
    total += pl.amount;
    rows.push([
      meta.get(pl.centerGlCode)?.glCode ?? "—",
      pl.center,
      pl.pool,
      basisLabel,
      n(pl.amount, "$#,##0"),
    ]);
  }
  rows.push(["", "", h("Total"), "", n(total, "$#,##0")]);
  return rows;
}

export function buildAllocationByCenter(p: CapExportPayload): Cell[][] {
  // Wide schema that holds both blocks:
  //   1. Costs to be Allocated header → A=#, B=Center, C=Source, F=Pct,
  //      G=Gross, then per-method allocation columns
  //   2. Pool Allocation Detail header → A=Step, B=Pool, C=Receiver glCode,
  //      D=Receiver name, E=Section, F=Pct, G=Gross, then per-method
  //      allocation columns
  // Re-using the same column grid keeps everything in one sheet and lets
  // Excel filters / freezes apply uniformly. Single mode collapses
  // First / Second / Total into one Allocation column.
  const isSingle = p.stepDownMethod === "single";
  // Column count drops from 10 → 8 in single mode. The two trailing
  // columns are stripped from every row builder below via this width.
  const colWidth = isSingle ? 8 : 10;
  const trailingHeaders: Cell[] = isSingle
    ? [h("Allocation")]
    : [h("First"), h("Second"), h("Total")];
  const rows: Cell[][] = [
    [
      h("#"), h("Center / Pool"), h("Source / Receiver Code"), h("Receiver Name"),
      h("Section"), h("Pct"), h("Gross"), ...trailingHeaders,
    ],
  ];

  const stepIndex = new Map<string, number>();
  p.model.stepOrder.forEach((k, i) => stepIndex.set(k, i));
  const meta = centerMeta(p);

  const poolsByCenterKey = new Map<string, CapPool[]>();
  for (const pl of p.capPools) {
    const list = poolsByCenterKey.get(pl.centerGlCode) ?? [];
    list.push(pl);
    poolsByCenterKey.set(pl.centerGlCode, list);
  }
  for (const list of poolsByCenterKey.values()) {
    list.sort((a, b) => a.pool.localeCompare(b.pool));
  }

  const indirectNodes = p.model.nodes
    .filter((nn) => nn.role === "indirect")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));
  const directNodes = p.model.nodes
    .filter((nn) => nn.role === "direct")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));

  p.model.stepOrder.forEach((centerKey, centerIdx) => {
    const centerMetaEntry = meta.get(centerKey);
    if (!centerMetaEntry) return;
    const centerName = centerMetaEntry.name;
    const targetStep = stepIndex.get(centerKey) ?? -1;
    const centerPools = poolsByCenterKey.get(centerKey) ?? [];

    // -------- Center header band --------
    const stepLabel = String(centerIdx + 1).padStart(2, "0");
    const centerGl = centerMetaEntry.glCode;
    const centerHeader = centerGl
      ? `${centerGl} · ${centerName.toUpperCase()}`
      : centerName.toUpperCase();
    rows.push(padRow([h(`STEP ${stepLabel}`), h(centerHeader)], colWidth));

    // -------- Costs to be Allocated --------
    const departmental = centerPools
      .reduce((a, pl) => a + pl.amount, 0);

    const sources = new Map<string, { first: number; second: number }>();
    for (const node of p.model.nodes) {
      if (node.role === "indirect") sources.set(node.key, { first: 0, second: 0 });
    }
    for (const sp of p.capPools) {
      const srcStep = stepIndex.get(sp.centerGlCode) ?? -1;
      const isUpstream = srcStep !== -1 && targetStep !== -1 && srcStep < targetStep;
      const r1 = p.model.firstAllocation[sp.id]?.[centerKey] ?? 0;
      const r2 = p.model.secondAllocation[sp.id]?.[centerKey] ?? 0;
      const first = isUpstream ? r1 : 0;
      const second = isUpstream ? r2 : (r1 + r2);
      const cur = sources.get(sp.centerGlCode) ?? { first: 0, second: 0 };
      cur.first += first;
      cur.second += second;
      sources.set(sp.centerGlCode, cur);
    }
    const sourceRows = [...sources.entries()]
      .map(([key, v]) => ({ key, name: meta.get(key)?.name ?? key, ...v }))
      .sort((a, b) => (stepIndex.get(a.key) ?? 999) - (stepIndex.get(b.key) ?? 999));
    const totalFirst = sourceRows.reduce((a, r) => a + r.first, 0);
    const totalSecond = sourceRows.reduce((a, r) => a + r.second, 0);

    rows.push(padRow(["", h("Costs to be Allocated")], colWidth));
    // Departmental row: gross = departmental; under single mode the
    // single "Allocation" column carries the same dollars as the gross
    // (no second-pass redistribution).
    rows.push(padRow(
      isSingle
        ? [
          "", "", "Departmental Expenditures", "", "", "",
          n(departmental, "$#,##0"),
          n(departmental, "$#,##0"),
        ]
        : [
          "", "", "Departmental Expenditures", "", "", "",
          n(departmental, "$#,##0"), n(departmental, "$#,##0"),
          n(0, "$#,##0"), n(departmental, "$#,##0"),
        ],
      colWidth,
    ));
    for (const r of sourceRows) {
      const sourceGl = meta.get(r.key)?.glCode;
      const baseLabel = sourceGl ? `${sourceGl} · ${r.name}` : r.name;
      const label = r.key === centerKey ? `${baseLabel} (self)` : baseLabel;
      rows.push(padRow(
        isSingle
          ? [
            "", "", label, "", "Incoming", "",
            "",
            n(r.first + r.second, "$#,##0"),
          ]
          : [
            "", "", label, "", "Incoming", "",
            "",
            n(r.first, "$#,##0"), n(r.second, "$#,##0"),
            n(r.first + r.second, "$#,##0"),
          ],
        colWidth,
      ));
    }
    rows.push(padRow(
      isSingle
        ? [
          "", h("Total Incoming"), "", "", "", "",
          "",
          n(totalFirst + totalSecond, "$#,##0"),
        ]
        : [
          "", h("Total Incoming"), "", "", "", "",
          "",
          n(totalFirst, "$#,##0"), n(totalSecond, "$#,##0"),
          n(totalFirst + totalSecond, "$#,##0"),
        ],
      colWidth,
    ));
    rows.push(padRow(
      isSingle
        ? [
          "", h("Total Costs to be Allocated"), "", "", "", "",
          "",
          n(departmental + totalFirst + totalSecond, "$#,##0"),
        ]
        : [
          "", h("Total Costs to be Allocated"), "", "", "", "",
          "",
          n(departmental + totalFirst, "$#,##0"),
          n(totalSecond, "$#,##0"),
          n(departmental + totalFirst + totalSecond, "$#,##0"),
        ],
      colWidth,
    ));
    rows.push([]);

    // -------- Pool Allocation Detail for each pool at this center --------
    for (const pl of centerPools) {
      rows.push(padRow(["", h(`Pool · ${pl.pool}`)], colWidth));

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
        const head: Cell[] = [
          "", "",
          node.glCode.startsWith("seed:") ? "" : node.glCode,
          node.name,
          section,
          n(pct / 100, "0.000%"),
          n(gross, "$#,##0"),
        ];
        // Under single mode, firstAllocation already equals the
        // per-receiver final allocation (alloc2) — surface that as the
        // single Allocation column. Double mode keeps the historical
        // First / Second / Total triple.
        rows.push(isSingle
          ? [...head, n(first, "$#,##0")]
          : [...head, n(first, "$#,##0"), n(second, "$#,##0"), n(total, "$#,##0")]);
      };
      for (const node of indirectNodes) emit(node, "Allocable");
      for (const node of directNodes)   emit(node, "Receiving");

      const allKeys = [...indirectNodes, ...directNodes].map((nn) => nn.key);
      const poolFirstTotal  = allKeys.reduce((a, k) => a + (p.model.firstAllocation[pl.id]?.[k] ?? 0), 0);
      const secondTotal = allKeys.reduce((a, k) => a + (p.model.secondAllocation[pl.id]?.[k] ?? 0), 0);
      const totalsHead: Cell[] = [
        "", "", "", h("Pool total"), "",
        n(1, "0.000%"),
        n(poolFirstTotal, "$#,##0"),
      ];
      rows.push(isSingle
        ? [...totalsHead, n(poolFirstTotal, "$#,##0")]
        : [
          ...totalsHead,
          n(poolFirstTotal, "$#,##0"),
          n(secondTotal, "$#,##0"),
          n(poolFirstTotal + secondTotal, "$#,##0"),
        ]);
      rows.push([]);
    }
  });

  return rows;
}

// Right-pad a partial row to the sheet's column count. The
// AllocationByCenter sheet shifts between 8 and 10 columns depending on
// stepDownMethod, so every banner / label / total row goes through this
// helper rather than hard-coded "" arrays at each call site.
function padRow(cells: Cell[], width: number): Cell[] {
  if (cells.length >= width) return cells;
  return [...cells, ...new Array(width - cells.length).fill("") as Cell[]];
}

function buildAllocationMatrix(p: CapExportPayload): Cell[][] {
  const directNodes = p.model.nodes
    .filter((n) => n.role === "direct")
    .sort((a, b) => a.glCode.localeCompare(b.glCode));
  const meta = centerMeta(p);

  const header: Cell[] = [
    h("Code"), h("Center"), h("Pool"),
    ...directNodes.map((n) => h(`${n.glCode.startsWith("seed:") ? "—" : n.glCode} · ${n.name}`)),
    h("Row total"),
  ];
  const rows: Cell[][] = [header];

  const sortByCenterKey = new Map<string, number>();
  p.model.stepOrder.forEach((k, i) => sortByCenterKey.set(k, i));
  const sortedPools = [...p.capPools].sort((a, b) => {
    const ai = sortByCenterKey.get(a.centerGlCode) ?? 999;
    const bi = sortByCenterKey.get(b.centerGlCode) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.pool.localeCompare(b.pool);
  });

  const colTotals = new Array<number>(directNodes.length).fill(0);
  for (const pl of sortedPools) {
    const row: Cell[] = [meta.get(pl.centerGlCode)?.glCode ?? "—", pl.center, pl.pool];
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
  // Only surface fee depts the jurisdiction actually routes CAP $ to.
  const activeDepts = FEE_DEPTS.filter((d) => (p.fbhrRollup[d] ?? 0) > 0.5);
  const rows: Cell[][] = [
    [h("Fee Dept"), h("Allocated overhead $"), h("Notes")],
  ];
  for (const d of activeDepts) {
    rows.push([d, n(p.fbhrRollup[d] ?? 0, "$#,##0"), "Sum of direct-node totals tagged feeDept=" + d]);
  }
  const total = activeDepts.reduce((a, d) => a + (p.fbhrRollup[d] ?? 0), 0);
  rows.push(["", h("Total"), n(total, "$#,##0")]);
  return rows;
}

