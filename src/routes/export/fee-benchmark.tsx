import { createFileRoute } from "@tanstack/react-router";
import FeeBenchmarkExportPage from "@/src/pages/export/fee-benchmark";

export const Route = createFileRoute("/export/fee-benchmark")({
  component: FeeBenchmarkExportPage,
});
