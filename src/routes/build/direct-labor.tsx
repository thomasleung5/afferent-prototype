import { createFileRoute } from "@tanstack/react-router";
import DirectLaborPage from "@/src/pages/build/direct-labor";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/direct-labor")({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: DirectLaborPage,
});
