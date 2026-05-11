import { createFileRoute } from "@tanstack/react-router";
import ServicesPage from "@/src/pages/build/services";

export const Route = createFileRoute("/build/services")({
  component: ServicesPage,
});
