import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/export/monitoring")({
  component: lazyRouteComponent(() => import("@/src/pages/export/monitoring")),
});
