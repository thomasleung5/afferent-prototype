
import { useCallback } from "react";
import { useBuildState } from "@/lib/store";
import { downloadBlob } from "@/lib/export/excel";
import { slugCity } from "@/lib/printing";
import { exportCapXlsx, type CapExportPayload } from "@/lib/export/capExcel";
import { capAllocatedFromGl } from "@/lib/data/capStepDownEngine";

/** Overhead-page Export handlers. PDF opens the print route in a new tab;
 *  Excel builds an .xlsx workbook from the live engine model. */
export function useOverheadExport() {
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
    stepDownMethod: state.stepDownMethod,
  }), [state]);

  const downloadExcel = useCallback(async () => {
    const payload = buildPayload();
    const blob = await exportCapXlsx(payload);
    const city = slugCity(payload.cityName);
    downloadBlob(blob, `${city}-cost-allocation-plan.xlsx`);
  }, [buildPayload]);

  const pdfHref = "/export/overhead";

  return { downloadExcel, pdfHref };
}
