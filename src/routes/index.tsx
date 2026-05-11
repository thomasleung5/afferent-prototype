import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => <div style={{ padding: 40 }}>Vite scaffold ready</div>,
});
