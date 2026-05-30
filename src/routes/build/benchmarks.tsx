import { createFileRoute } from "@tanstack/react-router";
import BenchmarksPage from "@/src/pages/build/benchmarks";

interface BenchmarksSearch {
  serviceId?: string;
}

export const Route = createFileRoute("/build/benchmarks")({
  // Validate the optional serviceId query param. Cross-navigation from
  // any other view (Fee Schedule, Cost of Service) passes ?serviceId=
  // <service.id> so this view can auto-open, scroll to, and highlight
  // the matching benchmark row.
  validateSearch: (search: Record<string, unknown>): BenchmarksSearch => {
    const id = search.serviceId;
    return { serviceId: typeof id === "string" && id.length > 0 ? id : undefined };
  },
  component: BenchmarksPage,
});
