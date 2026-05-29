import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/annual/")({
  beforeLoad: () => {
    throw redirect({ to: "/annual/changes" });
  },
});
