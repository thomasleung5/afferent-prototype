import { createFileRoute } from "@tanstack/react-router";
import AnnualRefreshPage from "@/app/annual/refresh/page";

export const Route = createFileRoute("/annual/refresh")({
  component: AnnualRefreshPage,
});
