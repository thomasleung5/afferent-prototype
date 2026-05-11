import { createFileRoute } from "@tanstack/react-router";
import BenchmarkPage from "@/app/build/benchmark/page";

export const Route = createFileRoute("/build/benchmark")({
  component: BenchmarkPage,
});
