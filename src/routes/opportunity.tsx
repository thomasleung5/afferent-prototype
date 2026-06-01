import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/opportunity")({
  component: lazyRouteComponent(() => import("@/src/pages/opportunity")),
});
