import { createFileRoute } from "@tanstack/react-router";
import FeeStudyExportPage from "@/src/pages/export/fee-study";

export const Route = createFileRoute("/export/fee-study")({
  component: FeeStudyExportPage,
});
