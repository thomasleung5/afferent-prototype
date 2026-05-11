import { createFileRoute } from "@tanstack/react-router";
import WorkloadPage from "@/src/pages/build/workload";

export const Route = createFileRoute("/build/workload")({
  component: WorkloadPage,
});
