import { createFileRoute } from "@tanstack/react-router";
import SalaryPage from "@/src/pages/build/salary";

export const Route = createFileRoute("/build/salary")({
  component: SalaryPage,
});
