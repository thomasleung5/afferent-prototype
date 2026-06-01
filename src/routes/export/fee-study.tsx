import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/export/fee-study")({
  component: lazyRouteComponent(() => import("@/src/pages/export/fee-study")),
});
