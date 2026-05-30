import { createFileRoute } from "@tanstack/react-router";
import OverheadCostsPage from "@/src/pages/build/overhead";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/overhead")({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: OverheadCostsPage,
});
