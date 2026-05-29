import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SubNav, type SubNavItem } from "@/components/layout";

const ITEMS: SubNavItem[] = [
  { href: "/annual/changes", label: "Review changes" },
];

export const Route = createFileRoute("/annual")({
  component: () => (
    <>
      <SubNav items={ITEMS}/>
      <Outlet/>
    </>
  ),
});
