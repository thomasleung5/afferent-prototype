/* Excel exporter for the Fee Benchmarks deliverable. Builds a focused
 * multi-sheet workbook via the shared `buildXlsxBlob` helper and
 * triggers a client-side download.
 *
 * Sheets:
 *   1. Summary     — city info + KPI counts (with-peer, above/in-line/below).
 *   2. Benchmarks  — every fee with our fee, per-peer-city columns, peer
 *                    median, variance vs. median, variance vs. cost.
 *   3. Notes       — method, source, caveats.
 *
 * Mirrors lib/export/capExcel.ts and lib/export/excel.ts (fee-study).
 *
 * Header-row freezing is intentionally NOT applied here (matches the
 * pre-write-excel-file behavior — `addSheet` did not set `!freeze`),
 * since the Summary and Notes sheets are key/value rather than tables
 * with a column header. */

import type { DeptCode } from "../types";
import { buildXlsxBlob, h, n, type Cell, type SheetSpec } from "./xlsx";

export interface BenchmarksRow {
  id: string;
  name: string;
  dept: DeptCode;
  hours: number;
  fee: number;
  cost: number;
  peerMedian: number;
  peerValues: number[];
  varianceVsMedian: number;
  varianceVsCost: number;
}

export interface BenchmarksExportPayload {
  cityName: string;
  fiscal: string;
  preparedBy: string;
  peers: string[];
  generatedAt: string;
  rows: BenchmarksRow[];
  summary: {
    total: number;
    withPeer: number;
    aboveMedian: number;
    inLine: number;
    belowMedian: number;
    avgVariance: number;
  };
}

export async function exportBenchmarksXlsx(p: BenchmarksExportPayload): Promise<Blob> {
  const sheets: SheetSpec[] = [
    { name: "Summary",    rows: buildSummary(p),    columnWidths: [28, 24], stickyRowsCount: 0 },
    { name: "Benchmarks", rows: buildBenchmarks(p),
      columnWidths: [40, 8, 12, ...new Array(p.peers.length).fill(12), 12, 12, 12],
      stickyRowsCount: 0 },
    { name: "Notes",      rows: buildNotes(p),      columnWidths: [28, 60], stickyRowsCount: 0 },
  ];
  return buildXlsxBlob(sheets);
}

// ============================================================================
// Sheet builders
// ============================================================================

function buildSummary(p: BenchmarksExportPayload): Cell[][] {
  const s = p.summary;
  return [
    [h("Fee Benchmarks · Export Summary")],
    [],
    [h("City"),         p.cityName],
    [h("Fiscal year"),  p.fiscal],
    [h("Prepared by"),  p.preparedBy],
    [h("Peer cities"),  p.peers.join(" · ")],
    [h("Generated"),    new Date(p.generatedAt).toLocaleString()],
    [],
    [h("Coverage")],
    [h("Fees modeled"),       s.total],
    [h("With peer data"),     s.withPeer],
    [],
    [h("Variance distribution (peers within ±5% counted as in line)")],
    [h("Above median (>5%)"), s.aboveMedian],
    [h("In line (±5%)"),      s.inLine],
    [h("Below median (>5%)"), s.belowMedian],
    [h("Avg variance"),       n(s.avgVariance / 100, "+0%;-0%")],
  ];
}

function buildBenchmarks(p: BenchmarksExportPayload): Cell[][] {
  const header: Cell[] = [
    h("Fee item"), h("Dept"), h("Our fee"),
    ...p.peers.map((c) => h(c)),
    h("Peer median"), h("Var vs median"), h("Var vs cost"),
  ];
  const rows: Cell[][] = [header];
  for (const r of p.rows) {
    rows.push([
      r.name, r.dept,
      n(r.fee, "$#,##0"),
      ...r.peerValues.map((v) => v > 0 ? n(v, "$#,##0") : ""),
      r.peerMedian > 0 ? n(r.peerMedian, "$#,##0") : "",
      r.peerMedian > 0 ? n(r.varianceVsMedian / 100, "+0%;-0%") : "",
      r.cost > 0 ? n(r.varianceVsCost / 100, "+0%;-0%") : "",
    ]);
  }
  if (p.rows.length === 0) {
    rows.push(["No fees on file."]);
  }
  return rows;
}

function buildNotes(p: BenchmarksExportPayload): Cell[][] {
  return [
    [h("Method")],
    [
      `Peer median is the central value across ${p.peers.length} comparable jurisdictions: ` +
      `${p.peers.join(", ")}. Per-city values are stable samples around the median; the median ` +
      "itself is the authoritative benchmark number. Variance vs. median compares our adopted fee " +
      "against the peer median. Variance vs. cost compares our adopted fee against the calculated " +
      "unit cost (hours × FBHR).",
    ],
    [],
    [h("Caveat")],
    [
      "Peer fees are listed prices and may understate full cost recovery — peer cities may subsidize " +
      "from general fund. The benchmark is a directional check on adopted pricing, not a substitute " +
      "for the city's own cost of service analysis.",
    ],
    [],
    [h("Survey window")],
    ["Adopted fees as of Jul 1, 2025 · public schedules."],
  ];
}
