import { createFileRoute } from "@tanstack/react-router";
import FunctionalAllocationPage from "@/src/pages/build/functional-allocation";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/functional-allocation")({
  // Cost of Service drilldowns pass ?dept=<DeptCode> to land the user
  // on that dept's row in the summary table with its drilldown open.
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: FunctionalAllocationPage,
});
