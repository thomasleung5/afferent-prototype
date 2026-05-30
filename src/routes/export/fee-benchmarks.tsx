import { createFileRoute } from "@tanstack/react-router";
import FeeBenchmarksExportPage from "@/src/pages/export/fee-benchmarks";

export const Route = createFileRoute("/export/fee-benchmarks")({
  component: FeeBenchmarksExportPage,
});
