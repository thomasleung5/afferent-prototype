import { createFileRoute } from "@tanstack/react-router";
import AnnualChangesPage from "@/src/pages/annual/changes";

export const Route = createFileRoute("/annual/changes")({
  component: AnnualChangesPage,
});
