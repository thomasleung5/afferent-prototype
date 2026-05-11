import { createFileRoute } from "@tanstack/react-router";
import CostsPage from "@/app/build/costs/page";

export const Route = createFileRoute("/build/costs")({
  component: CostsPage,
});
