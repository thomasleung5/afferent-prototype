import { createFileRoute } from "@tanstack/react-router";
import FeeSchedulePage from "@/src/pages/build/feestudy";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

interface FeeStudySearch extends DeptSearch {
  serviceId?: string;
}

export const Route = createFileRoute("/build/feestudy")({
  // Cross-navigation from another tab (Cost of Service, Fee Benchmarks)
  // passes ?serviceId=<service.id> so this view can auto-open, scroll
  // to, and highlight the matching fee-schedule row. Functional
  // Allocation drilldowns pass ?dept=<DeptCode> to pre-filter.
  validateSearch: (search: Record<string, unknown>): FeeStudySearch => {
    const id = search.serviceId;
    return {
      serviceId: typeof id === "string" && id.length > 0 ? id : undefined,
      dept: coerceDeptCode(search.dept),
    };
  },
  component: FeeSchedulePage,
});
