import { createFileRoute } from "@tanstack/react-router";
import ServicesPage from "@/app/build/services/page";

export const Route = createFileRoute("/build/services")({
  component: ServicesPage,
});
