import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/export/overhead")({
  component: lazyRouteComponent(() => import("@/src/pages/export/overhead")),
});
