import { createFileRoute } from "@tanstack/react-router";
import OperatingPage from "@/src/pages/build/operating";

export const Route = createFileRoute("/build/operating")({
  component: OperatingPage,
});
