import { createFileRoute, redirect } from "@tanstack/react-router";

// /build has no landing page — Departments is the canonical first step in
// the model-building flow, so the index route just bounces there.
export const Route = createFileRoute("/build/")({
  beforeLoad: () => {
    throw redirect({ to: "/build/departments" });
  },
});
