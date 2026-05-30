import { createFileRoute } from "@tanstack/react-router";
import ServicesPage from "@/src/pages/build/services";

interface ServicesSearch {
  serviceId?: string;
}

export const Route = createFileRoute("/build/services")({
  // Cross-navigation from another tab (Cost of Service, Fee Schedule,
  // Fee Benchmarks) passes ?serviceId=<service.id> so this view can
  // auto-open, scroll to, and highlight the matching service row.
  validateSearch: (search: Record<string, unknown>): ServicesSearch => {
    const id = search.serviceId;
    return { serviceId: typeof id === "string" && id.length > 0 ? id : undefined };
  },
  component: ServicesPage,
});
