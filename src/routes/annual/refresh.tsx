import { createFileRoute } from "@tanstack/react-router";
import AnnualRefreshPage from "@/src/pages/annual/refresh";

export const Route = createFileRoute("/annual/refresh")({
  component: AnnualRefreshPage,
});
