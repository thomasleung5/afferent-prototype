import { createFileRoute } from "@tanstack/react-router";
import WorkloadPage from "@/app/build/workload/page";

export const Route = createFileRoute("/build/workload")({
  component: WorkloadPage,
});
