import { createFileRoute } from "@tanstack/react-router";
import OperatingPage from "@/src/pages/build/operating";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/operating")({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: OperatingPage,
});
