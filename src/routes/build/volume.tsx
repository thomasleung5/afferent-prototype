import { createFileRoute } from "@tanstack/react-router";
import VolumePage from "@/src/pages/build/volume";

export const Route = createFileRoute("/build/volume")({
  component: VolumePage,
});
