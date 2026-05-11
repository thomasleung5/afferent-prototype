import { createFileRoute } from "@tanstack/react-router";
import AnnualPacketPage from "@/app/annual/packet/page";

export const Route = createFileRoute("/annual/packet")({
  component: AnnualPacketPage,
});
