import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { coerceDeptCode, type DeptSearch } from "@/lib/data/deptSearch";

export const Route = createFileRoute("/build/overhead")({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    dept: coerceDeptCode(search.dept),
  }),
  component: lazyRouteComponent(() => import("@/src/pages/build/overhead")),
});
