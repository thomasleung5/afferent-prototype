import { createFileRoute } from "@tanstack/react-router";
import SalaryPage from "@/app/build/salary/page";

export const Route = createFileRoute("/build/salary")({
  component: SalaryPage,
});
