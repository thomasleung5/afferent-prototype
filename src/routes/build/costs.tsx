import { createFileRoute } from "@tanstack/react-router";
import CostsPage from "@/src/pages/build/costs";

export const Route = createFileRoute("/build/costs")({
  component: CostsPage,
});
