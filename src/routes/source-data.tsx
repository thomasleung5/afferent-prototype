import { createFileRoute } from "@tanstack/react-router";
import SourceDataPage from "@/src/pages/source-data";

export const Route = createFileRoute("/source-data")({
  component: SourceDataPage,
});
