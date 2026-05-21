import { createFileRoute } from "@tanstack/react-router";
import BenchmarkPage from "@/src/pages/build/benchmark";

interface BenchmarkSearch {
  feeId?: string;
}

export const Route = createFileRoute("/build/benchmark")({
  // Validate the optional feeId query param. Cross-navigation from the
  // Fee Schedule drilldown passes ?feeId=<service.id> so the destination
  // can auto-open, scroll to, and highlight the matching benchmark row.
  validateSearch: (search: Record<string, unknown>): BenchmarkSearch => {
    const feeId = search.feeId;
    return { feeId: typeof feeId === "string" && feeId.length > 0 ? feeId : undefined };
  },
  component: BenchmarkPage,
});
