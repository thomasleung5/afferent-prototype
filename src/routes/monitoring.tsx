import { createFileRoute } from "@tanstack/react-router";
import RevenueMonitoringPage from "@/src/pages/monitoring";

export const Route = createFileRoute("/monitoring")({
  component: RevenueMonitoringPage,
});
