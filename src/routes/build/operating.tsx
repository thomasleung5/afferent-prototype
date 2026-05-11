import { createFileRoute } from "@tanstack/react-router";
import OperatingPage from "@/app/build/operating/page";

export const Route = createFileRoute("/build/operating")({
  component: OperatingPage,
});
