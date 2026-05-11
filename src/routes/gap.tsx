import { createFileRoute } from "@tanstack/react-router";
import RevenueGapPage from "@/app/gap/page";

export const Route = createFileRoute("/gap")({
  component: RevenueGapPage,
});
