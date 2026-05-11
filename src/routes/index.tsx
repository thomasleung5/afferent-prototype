import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/src/pages";

export const Route = createFileRoute("/")({
  component: HomePage,
});
