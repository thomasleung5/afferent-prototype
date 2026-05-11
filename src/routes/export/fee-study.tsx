import { createFileRoute } from "@tanstack/react-router";
import FeeStudyExportPage from "@/app/export/fee-study/page";

export const Route = createFileRoute("/export/fee-study")({
  component: FeeStudyExportPage,
});
