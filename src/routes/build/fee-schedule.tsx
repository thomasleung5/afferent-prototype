import { createFileRoute } from "@tanstack/react-router";
import FeeSchedulePage from "@/src/pages/build/fee-schedule";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

interface FeeScheduleSearch extends DeptSearch {
  serviceId?: string;
}

export const Route = createFileRoute("/build/fee-schedule")({
  // Cross-navigation from another tab (Cost of Service, Fee Benchmarks)
  // passes ?serviceId=<service.id> so this view can auto-open, scroll
  // to, and highlight the matching fee-schedule row. Functional
  // Allocation drilldowns pass ?dept=<DeptCode> to pre-filter.
  validateSearch: (search: Record<string, unknown>): FeeScheduleSearch => {
    const id = search.serviceId;
    return {
      serviceId: typeof id === "string" && id.length > 0 ? id : undefined,
      dept: coerceDeptCode(search.dept),
    };
  },
  component: FeeSchedulePage,
});
