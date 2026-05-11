import { createFileRoute } from "@tanstack/react-router";
import AnnualPacketPage from "@/src/pages/annual/packet";

export const Route = createFileRoute("/annual/packet")({
  component: AnnualPacketPage,
});
