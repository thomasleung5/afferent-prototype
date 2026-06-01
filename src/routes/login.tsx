import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/src/pages/login";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});
