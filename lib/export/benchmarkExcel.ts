/* Excel exporter for the Fee Benchmark deliverable. Builds a focused
 * multi-sheet workbook via SheetJS and triggers a client-side download.
 *
 * Sheets:
 *   1. Summary    — city info + KPI counts (with-peer, above/in-line/below).
 *   2. Benchmark  — every fee with our fee, per-peer-city columns, peer
 *                   median, variance vs. median, variance vs. cost.
 *   3. Notes      — method, source, caveats.
 *
 * Mirrors lib/export/capExcel.ts and lib/export/excel.ts (fee-study). */

import type { DeptCode } from "../types";

type Cell = string | number | null | { v: string | number; t?: "s" | "n"; z?: string; s?: unknown };

export interface BenchmarkRow {
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

export interface BenchmarkExportPayload {
  cityName: string;
  fiscal: string;
  preparedBy: string;
  peers: string[];
  generatedAt: string;
  rows: BenchmarkRow[];
  summary: {
    total: number;
    withPeer: number;
    aboveMedian: number;
    inLine: number;
    belowMedian: number;
    avgVariance: number;
  };
}

export async function exportBenchmarkXlsx(p: BenchmarkExportPayload): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  addSheet(XLSX, wb, "Summary",   buildSummary(p),   [28, 24]);
  addSheet(XLSX, wb, "Benchmark", buildBenchmark(p), [40, 8, 12, ...new Array(p.peers.length).fill(12), 12, 12, 12]);
  addSheet(XLSX, wb, "Notes",     buildNotes(p),     [28, 60]);

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ============================================================================
// Sheet builders
// ============================================================================

function buildSummary(p: BenchmarkExportPayload): Cell[][] {
  const s = p.summary;
  return [
    [h("Fee Benchmark · Export Summary")],
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

function buildBenchmark(p: BenchmarkExportPayload): Cell[][] {
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

function buildNotes(p: BenchmarkExportPayload): Cell[][] {
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
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
}
