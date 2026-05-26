import { createFileRoute } from "@tanstack/react-router";
import FunctionalAllocationPage from "@/src/pages/build/functional-allocation";

export const Route = createFileRoute("/build/functional-allocation")({
  component: FunctionalAllocationPage,
});
