import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy path kept so bookmarks and saved links to /build/workload still
// land on the renamed Volume of Activity tab.
export const Route = createFileRoute("/build/workload")({
  beforeLoad: () => {
    throw redirect({ to: "/build/volume" });
  },
});
