import { createFileRoute } from "@tanstack/react-router";
import PolicyPage from "@/app/build/policy/page";

export const Route = createFileRoute("/build/policy")({
  component: PolicyPage,
});
