import { createFileRoute } from "@tanstack/react-router";
import CostsPage from "@/src/pages/build/costs";

interface CostsSearch {
  serviceId?: string;
}

export const Route = createFileRoute("/build/costs")({
  // Cross-navigation from another tab (Fee Schedule, Fee Benchmark)
  // passes ?serviceId=<service.id> so this view can auto-open, scroll
  // to, and highlight the matching cost-of-service row.
  validateSearch: (search: Record<string, unknown>): CostsSearch => {
    const id = search.serviceId;
    return { serviceId: typeof id === "string" && id.length > 0 ? id : undefined };
  },
  component: CostsPage,
});
