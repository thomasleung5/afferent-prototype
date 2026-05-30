import { createFileRoute } from "@tanstack/react-router";
import RevenueOpportunityPage from "@/src/pages/opportunity";

export const Route = createFileRoute("/opportunity")({
  component: RevenueOpportunityPage,
});
