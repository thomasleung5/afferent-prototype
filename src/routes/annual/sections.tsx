import { createFileRoute } from "@tanstack/react-router";
import AnnualSectionsPage from "@/app/annual/sections/page";

export const Route = createFileRoute("/annual/sections")({
  component: AnnualSectionsPage,
});
