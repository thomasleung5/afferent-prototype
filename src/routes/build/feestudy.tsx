import { createFileRoute } from "@tanstack/react-router";
import FeeSchedulePage from "@/app/build/feestudy/page";

export const Route = createFileRoute("/build/feestudy")({
  component: FeeSchedulePage,
});
