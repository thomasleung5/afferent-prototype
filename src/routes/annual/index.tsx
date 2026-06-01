import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/annual/")({
  component: lazyRouteComponent(() => import("@/src/pages/annual")),
});
