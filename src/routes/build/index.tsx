import { createFileRoute } from "@tanstack/react-router";
import BuildOverviewPage from "@/src/pages/build";

export const Route = createFileRoute("/build/")({
  component: BuildOverviewPage,
});
