
import { useCallback } from "react";
import { useBuildState } from "@/lib/store";
import { useActiveFiscalYear, useActiveJurisdiction } from "@/lib/active";
import { buildExportPayload } from "@/lib/export/buildPayload";
import { exportFeeStudyXlsx, downloadBlob } from "@/lib/export/excel";

/** Shared Export handlers used by every page that surfaces an ExportMenu. */
export function useExport() {
  const state = useBuildState();
  const jurisdiction = useActiveJurisdiction();
  const fiscalYear = useActiveFiscalYear();

  const downloadExcel = useCallback(async () => {
    const payload = buildExportPayload({
      positions:    state.positions,
      operating:    state.operating,
      capPools:     state.capPools,
      workload:     state.workload,
      services:     state.services,
      policyTargets: state.policyTargets,
      policyExceptions: state.policyExceptions,
      pendingReview: state.pendingReview,
      lineage:      state.lineage,
      derived:      state.derived,
      jurisdiction: {
        name: jurisdiction.name,
        fiscal: fiscalYear,
        preparedBy: jurisdiction.preparedBy,
        peers: jurisdiction.peers,
      },
    });
    const blob = await exportFeeStudyXlsx(payload);
    const city = payload.cover.cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    downloadBlob(blob, `${city}-fee-study.xlsx`);
  }, [state, jurisdiction, fiscalYear]);

  const openPdf = useCallback(() => {
    // /export/fee-study reads from the same BuildProvider; a same-origin tab
    // shares the React tree so live state is available there too.
    // Note: noopener/noreferrer omitted intentionally — Safari's "Save as
    // PDF" fails (1KB blank PDF) on noopener'd tabs in some versions.
    window.open("/export/fee-study", "_blank");
  }, []);

  return { downloadExcel, openPdf };
}
