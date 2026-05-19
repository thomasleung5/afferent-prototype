
import { useCallback } from "react";
import { useBuildState } from "@/lib/store";
import { downloadBlob } from "@/lib/export/excel";
import { exportCapXlsx, type CapExportPayload } from "@/lib/export/capExcel";
import { capAllocatedFromGl } from "@/lib/data/capStepDownGl";

/** CAP-specific Export handlers. PDF opens the print route in a new tab;
 *  Excel builds an .xlsx workbook from the live engine model. */
export function useCapExport() {
  const state = useBuildState();

  const buildPayload = useCallback((): CapExportPayload => ({
    cityName: "Town of Los Altos Hills",
    fiscal: "FY 2025-26",
    generatedAt: new Date().toISOString(),
    capPools: state.capPools,
    allocationBases: state.allocationBases,
    capCenterTotals: state.capCenterTotals,
    capCenterDisallowed: state.capCenterDisallowed,
    capCenterOrder: state.capCenterOrder,
    model: state.derived.capStepDown,
    fbhrRollup: capAllocatedFromGl(state.derived.capStepDown),
  }), [state]);

  const downloadExcel = useCallback(async () => {
    const payload = buildPayload();
    const blob = await exportCapXlsx(payload);
    const city = payload.cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    downloadBlob(blob, `${city}-cost-allocation-plan.xlsx`);
  }, [buildPayload]);

  const openPdf = useCallback(() => {
    window.open("/export/cap-allocation", "_blank", "noopener,noreferrer");
  }, []);

  return { downloadExcel, openPdf };
}
