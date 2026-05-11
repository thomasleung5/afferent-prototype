import { createFileRoute } from "@tanstack/react-router";
import FeeSchedulePage from "@/src/pages/build/feestudy";

export const Route = createFileRoute("/build/feestudy")({
  component: FeeSchedulePage,
});
