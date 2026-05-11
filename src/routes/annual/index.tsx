import { createFileRoute } from "@tanstack/react-router";
import AnnualOverviewPage from "@/app/annual/page";

export const Route = createFileRoute("/annual/")({
  component: AnnualOverviewPage,
});
