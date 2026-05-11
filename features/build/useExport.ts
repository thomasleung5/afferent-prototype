
import { useCallback } from "react";
import { useBuildState } from "@/lib/store";
import { buildExportPayload } from "@/lib/export/buildPayload";
import { exportFeeStudyXlsx, downloadBlob } from "@/lib/export/excel";

/** Shared Export handlers used by every page that surfaces an ExportMenu. */
export function useExport() {
  const state = useBuildState();

  const downloadExcel = useCallback(async () => {
    const payload = buildExportPayload({
      positions:    state.positions,
      operating:    state.operating,
      capAllocation: state.capAllocation,
      capPools:     state.capPools,
      workload:     state.workload,
      services:     state.services,
      policyTargets: state.policyTargets,
      policyExceptions: state.policyExceptions,
      pendingReview: state.pendingReview,
      lineage:      state.lineage,
      derived:      state.derived,
    });
    const blob = await exportFeeStudyXlsx(payload);
    const city = payload.cover.cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    downloadBlob(blob, `${city}-fee-study.xlsx`);
  }, [state]);

  const openPdf = useCallback(() => {
    // /export/fee-study reads from the same BuildProvider; a same-origin tab
    // shares the React tree so live state is available there too.
    window.open("/export/fee-study", "_blank", "noopener,noreferrer");
  }, []);

  return { downloadExcel, openPdf };
}
