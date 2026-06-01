import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/src/pages/reset-password";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});
