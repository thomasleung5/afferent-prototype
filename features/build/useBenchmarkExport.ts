
import { useCallback, useMemo } from "react";
import { useBuildState } from "@/lib/store";
import { CITY } from "@/lib/data/city";
import { downloadBlob } from "@/lib/export/excel";
import {
  exportBenchmarkXlsx,
  type BenchmarkExportPayload,
  type BenchmarkRow,
} from "@/lib/export/benchmarkExcel";

// Same deterministic jitter the BenchmarkTable + PDF route use so the
// per-peer columns are consistent everywhere they appear.
const OFFSETS = [-0.18, -0.07, 0.04, 0.12, 0.22];

function peerJitter(id: string, median: number): number[] {
  if (!median) return CITY.peers.map(() => 0);
  const seed = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return CITY.peers.map((_, i) => {
    const off = OFFSETS[(seed + i) % OFFSETS.length];
    return Math.round((median * (1 + off)) / 5) * 5;
  });
}

/** Build the Fee Benchmark payload from BuildState. Reused by the PDF
 *  route component and the Excel exporter so both stay in sync. */
export function useBenchmarkPayload(): BenchmarkExportPayload {
  const { services, derived } = useBuildState();
  return useMemo<BenchmarkExportPayload>(() => {
    const rows: BenchmarkRow[] = services.map((s) => {
      const fbhr = derived.fbhr[s.dept]?.fbhr ?? 0;
      const cost = s.hours * fbhr;
      const peerValues = peerJitter(s.id, s.peer);
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
      cityName: CITY.name,
      fiscal: CITY.fiscal,
      preparedBy: CITY.preparedBy,
      peers: CITY.peers,
      generatedAt: new Date().toISOString(),
      rows,
      summary: { total: rows.length, withPeer: withPeer.length, aboveMedian, inLine, belowMedian, avgVariance },
    };
  }, [services, derived.fbhr]);
}

/** Fee Benchmark export handlers — PDF opens the print route in a new
 *  tab; Excel builds an .xlsx workbook from the live state. */
export function useBenchmarkExport() {
  const payload = useBenchmarkPayload();

  const downloadExcel = useCallback(async () => {
    const blob = await exportBenchmarkXlsx(payload);
    const city = payload.cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    downloadBlob(blob, `${city}-fee-benchmark.xlsx`);
  }, [payload]);

  const openPdf = useCallback(() => {
    window.open("/export/fee-benchmark", "_blank", "noopener,noreferrer");
  }, []);

  return { downloadExcel, openPdf };
}
