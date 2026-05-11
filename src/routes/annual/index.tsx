import { createFileRoute } from "@tanstack/react-router";
import AnnualOverviewPage from "@/src/pages/annual";

export const Route = createFileRoute("/annual/")({
  component: AnnualOverviewPage,
});
