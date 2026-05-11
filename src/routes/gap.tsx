import { createFileRoute } from "@tanstack/react-router";
import RevenueGapPage from "@/src/pages/gap";

export const Route = createFileRoute("/gap")({
  component: RevenueGapPage,
});
