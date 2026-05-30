import { createFileRoute } from "@tanstack/react-router";
import OverheadCostsPage from "@/src/pages/build/overhead-costs";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/overhead-costs")({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: OverheadCostsPage,
});
