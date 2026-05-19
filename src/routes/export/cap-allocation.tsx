import { createFileRoute } from "@tanstack/react-router";
import CapAllocationExportPage from "@/src/pages/export/cap-allocation";

export const Route = createFileRoute("/export/cap-allocation")({
  component: CapAllocationExportPage,
});
