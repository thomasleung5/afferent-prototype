import { createFileRoute } from "@tanstack/react-router";
import PolicyPage from "@/src/pages/build/policy";

export const Route = createFileRoute("/build/policy")({
  component: PolicyPage,
});
