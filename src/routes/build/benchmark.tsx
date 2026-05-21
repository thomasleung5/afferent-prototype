import { createFileRoute } from "@tanstack/react-router";
import BenchmarkPage from "@/src/pages/build/benchmark";

interface BenchmarkSearch {
  serviceId?: string;
}

export const Route = createFileRoute("/build/benchmark")({
  // Validate the optional serviceId query param. Cross-navigation from
  // any other view (Fee Schedule, Cost of Service) passes ?serviceId=
  // <service.id> so this view can auto-open, scroll to, and highlight
  // the matching benchmark row.
  validateSearch: (search: Record<string, unknown>): BenchmarkSearch => {
    const id = search.serviceId;
    return { serviceId: typeof id === "string" && id.length > 0 ? id : undefined };
  },
  component: BenchmarkPage,
});
