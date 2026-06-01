import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/source-data")({
  component: lazyRouteComponent(() => import("@/src/pages/source-data")),
});
