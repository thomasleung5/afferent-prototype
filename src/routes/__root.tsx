import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TopBar } from "@/components/layout";
import { BuildProvider } from "@/features/build/BuildContext";

export const Route = createRootRoute({
  component: () => (
    <BuildProvider>
      <TopBar/>
      <Outlet/>
    </BuildProvider>
  ),
});
