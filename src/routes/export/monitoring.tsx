import { createFileRoute } from "@tanstack/react-router";
import RevenueMonitoringExportPage from "@/src/pages/export/monitoring";

export const Route = createFileRoute("/export/monitoring")({
  component: RevenueMonitoringExportPage,
});
