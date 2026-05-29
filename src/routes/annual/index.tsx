import { createFileRoute } from "@tanstack/react-router";
import AnnualUpdatePage from "@/src/pages/annual";

export const Route = createFileRoute("/annual/")({
  component: AnnualUpdatePage,
});
