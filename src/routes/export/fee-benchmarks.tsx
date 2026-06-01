import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/export/fee-benchmarks")({
  component: lazyRouteComponent(() => import("@/src/pages/export/fee-benchmarks")),
});
