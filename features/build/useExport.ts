
import { useCallback } from "react";
import { useBuildState } from "@/lib/store";
import { useActiveFiscalYear, useActiveJurisdiction } from "@/lib/active";
import { buildExportPayload } from "@/lib/export/buildPayload";
import { exportFeeStudyXlsx, downloadBlob } from "@/lib/export/excel";
import { slugCity } from "@/lib/printing";

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
    const city = slugCity(payload.cover.cityName);
    downloadBlob(blob, `${city}-fee-study.xlsx`);
  }, [state, jurisdiction, fiscalYear]);

  // /export/fee-study reads from the same BuildProvider; a same-origin tab
  // shares the React tree so live state is available there too. Exposed as a
  // URL (not a window.open callback) so the ExportMenu can render it as a
  // plain <a target="_blank"> — that pattern isn't subject to pop-up blockers.
  const pdfHref = "/export/fee-study";

  return { downloadExcel, pdfHref };
}
