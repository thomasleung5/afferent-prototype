import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/monitoring")({
  component: lazyRouteComponent(() => import("@/src/pages/monitoring")),
});
