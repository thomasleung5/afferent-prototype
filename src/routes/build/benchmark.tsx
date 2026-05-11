import { createFileRoute } from "@tanstack/react-router";
import BenchmarkPage from "@/src/pages/build/benchmark";

export const Route = createFileRoute("/build/benchmark")({
  component: BenchmarkPage,
});
