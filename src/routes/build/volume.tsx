import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/build/volume")({
  component: lazyRouteComponent(() => import("@/src/pages/build/volume")),
});
