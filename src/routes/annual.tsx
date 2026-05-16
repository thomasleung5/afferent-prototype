import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SubNav, type SubNavItem } from "@/components/layout";

const ITEMS: SubNavItem[] = [
  { href: "/annual/refresh", label: "Refresh inputs" },
  { href: "/annual/changes", label: "Review changes" },
  { href: "/annual/packet",  label: "Update packet" },
];

export const Route = createFileRoute("/annual")({
  component: () => (
    <>
      <SubNav items={ITEMS}/>
      <Outlet/>
    </>
  ),
});
