import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/export/cap-allocation")({
  component: lazyRouteComponent(() => import("@/src/pages/export/cap-allocation")),
});
