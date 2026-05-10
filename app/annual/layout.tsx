import type { ReactNode } from "react";
import { SubNav, type SubNavItem } from "@/components/layout";

const ITEMS: SubNavItem[] = [
  { href: "/annual",          label: "Overview" },
  { href: "/annual/refresh",  label: "Refresh inputs" },
  { href: "/annual/sections", label: "Review queue", prefix: "/annual/sections" },
  { href: "/annual/changes",  label: "Review changes" },
  { href: "/annual/packet",   label: "Update packet" },
];

export default function AnnualLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SubNav items={ITEMS}/>
      {children}
    </>
  );
}
