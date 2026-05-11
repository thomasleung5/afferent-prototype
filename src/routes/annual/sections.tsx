import { createFileRoute } from "@tanstack/react-router";
import AnnualSectionsPage from "@/src/pages/annual/sections";

export const Route = createFileRoute("/annual/sections")({
  component: AnnualSectionsPage,
});
