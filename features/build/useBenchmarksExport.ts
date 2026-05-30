
import { useCallback, useMemo } from "react";
import { useBuildState } from "@/lib/store";
import { useActiveJurisdiction, useActiveFiscalYear } from "@/lib/active";
import { downloadBlob } from "@/lib/export/excel";
import { slugCity } from "@/lib/printing";
import {
  exportBenchmarksXlsx,
  type BenchmarksExportPayload,
  type BenchmarksRow,
} from "@/lib/export/benchmarksExcel";

// Same deterministic jitter the BenchmarksTable + PDF route use so the
// per-peer columns are consistent everywhere they appear. Peers come
// from the active jurisdiction.
const OFFSETS = [-0.18, -0.07, 0.04, 0.12, 0.22];

function peerJitter(id: string, median: number, peers: string[]): number[] {
  if (!median) return peers.map(() => 0);
  const seed = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return peers.map((_, i) => {
    const off = OFFSETS[(seed + i) % OFFSETS.length];
    return Math.round((median * (1 + off)) / 5) * 5;
  });
}

/** Build the Fee Benchmarks payload from BuildState. Reused by the PDF
 *  route component and the Excel exporter so both stay in sync. */
export function useBenchmarksPayload(): BenchmarksExportPayload {
  const { services, derived } = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const fiscalYear = useActiveFiscalYear();
  return useMemo<BenchmarksExportPayload>(() => {
    const rows: BenchmarksRow[] = services.map((s) => {
      const fbhr = derived.fbhr[s.dept]?.fbhr ?? 0;
      const cost = s.hours * fbhr;
      const peerValues = peerJitter(s.id, s.peer, jurisdiction.peers);
      const varianceVsMedian = s.peer > 0 ? ((s.fee - s.peer) / s.peer) * 100 : 0;
      const varianceVsCost = cost > 0 ? ((s.fee - cost) / cost) * 100 : 0;
      return {
        id: s.id, name: s.name, dept: s.dept, hours: s.hours,
        fee: s.fee, cost, peerMedian: s.peer, peerValues,
        varianceVsMedian, varianceVsCost,
      };
    });
    const withPeer = rows.filter((r) => r.peerMedian > 0);
    const aboveMedian = withPeer.filter((r) => r.fee > r.peerMedian * 1.05).length;
    const belowMedian = withPeer.filter((r) => r.fee < r.peerMedian * 0.95).length;
    const inLine = withPeer.length - aboveMedian - belowMedian;
    const avgVariance = withPeer.length > 0
      ? withPeer.reduce((a, r) => a + r.varianceVsMedian, 0) / withPeer.length
      : 0;
    return {
      cityName: jurisdiction.name,
      fiscal: fiscalYear,
      preparedBy: jurisdiction.preparedBy,
      peers: jurisdiction.peers,
      generatedAt: new Date().toISOString(),
      rows,
      summary: { total: rows.length, withPeer: withPeer.length, aboveMedian, inLine, belowMedian, avgVariance },
    };
  }, [services, derived.fbhr, jurisdiction, fiscalYear]);
}

/** Fee Benchmarks export handlers — PDF opens the print route in a new
 *  tab; Excel builds an .xlsx workbook from the live state. */
export function useBenchmarksExport() {
  const payload = useBenchmarksPayload();

  const downloadExcel = useCallback(async () => {
    const blob = await exportBenchmarksXlsx(payload);
    const city = slugCity(payload.cityName);
    downloadBlob(blob, `${city}-fee-benchmarks.xlsx`);
  }, [payload]);

  const pdfHref = "/export/fee-benchmarks";

  return { downloadExcel, pdfHref };
}
