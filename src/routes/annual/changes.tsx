import { createFileRoute } from "@tanstack/react-router";
import AnnualChangesPage from "@/app/annual/changes/page";

export const Route = createFileRoute("/annual/changes")({
  component: AnnualChangesPage,
});
