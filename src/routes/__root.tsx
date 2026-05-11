import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TopBar } from "@/components/layout";

export const Route = createRootRoute({
  component: () => (
    <>
      <TopBar/>
      <Outlet/>
    </>
  ),
});
