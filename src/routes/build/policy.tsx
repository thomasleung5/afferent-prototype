import { createFileRoute } from "@tanstack/react-router";
import PolicyPage from "@/src/pages/build/policy";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/policy")({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: PolicyPage,
});
