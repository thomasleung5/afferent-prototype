import { createFileRoute, Outlet } from "@tanstack/react-router";

// Annual Update is now a single page (Review changes) — the previous
// SubNav layer with one tab has been removed. The layout still exists
// because /annual/changes is kept as a redirect for bookmarked links.
export const Route = createFileRoute("/annual")({
  component: () => <Outlet/>,
});
