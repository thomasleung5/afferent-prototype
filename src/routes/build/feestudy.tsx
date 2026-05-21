import { createFileRoute } from "@tanstack/react-router";
import FeeSchedulePage from "@/src/pages/build/feestudy";

interface FeeStudySearch {
  serviceId?: string;
}

export const Route = createFileRoute("/build/feestudy")({
  // Cross-navigation from another tab (Cost of Service, Fee Benchmark)
  // passes ?serviceId=<service.id> so this view can auto-open, scroll
  // to, and highlight the matching fee-schedule row.
  validateSearch: (search: Record<string, unknown>): FeeStudySearch => {
    const id = search.serviceId;
    return { serviceId: typeof id === "string" && id.length > 0 ? id : undefined };
  },
  component: FeeSchedulePage,
});
