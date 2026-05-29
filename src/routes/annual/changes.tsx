import { createFileRoute, redirect } from "@tanstack/react-router";

// Annual Update used to live at /annual/changes under a one-item SubNav.
// The page is now mounted directly at /annual; redirect any stale links.
export const Route = createFileRoute("/annual/changes")({
  beforeLoad: () => {
    throw redirect({ to: "/annual" });
  },
});
