import { createFileRoute } from "@tanstack/react-router";
import CapPage from "@/src/pages/build/cap";

export const Route = createFileRoute("/build/cap")({
  component: CapPage,
});
