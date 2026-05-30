import { createFileRoute, Outlet } from "@tanstack/react-router";

// Annual Update is a single page (Review changes) mounted directly at
// /annual. This layout exists so nested annual/* routes can register
// under the parent, even though there is only one child today.
export const Route = createFileRoute("/annual")({
  component: () => <Outlet/>,
});
