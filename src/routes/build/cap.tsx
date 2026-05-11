import { createFileRoute } from "@tanstack/react-router";
import CapPage from "@/app/build/cap/page";

export const Route = createFileRoute("/build/cap")({
  component: CapPage,
});
