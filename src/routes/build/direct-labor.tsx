import { createFileRoute } from "@tanstack/react-router";
import DirectLaborPage from "@/src/pages/build/direct-labor";

export const Route = createFileRoute("/build/direct-labor")({
  component: DirectLaborPage,
});
