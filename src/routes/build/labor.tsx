import { createFileRoute } from "@tanstack/react-router";
import LaborPage from "@/src/pages/build/labor";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/labor")({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: LaborPage,
});
