import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/build/departments")({
  component: lazyRouteComponent(() => import("@/src/pages/build/departments")),
});
