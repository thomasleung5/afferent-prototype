import { createFileRoute } from "@tanstack/react-router";
import CapPage from "@/src/pages/build/cap";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/cap")({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: CapPage,
});
