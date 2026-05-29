import { createFileRoute, redirect } from "@tanstack/react-router";

// Source Data was promoted to a top-level route in the nav. The old
// /annual/refresh path now redirects so any stale links keep working.
export const Route = createFileRoute("/annual/refresh")({
  beforeLoad: () => {
    throw redirect({ to: "/source-data" });
  },
});
