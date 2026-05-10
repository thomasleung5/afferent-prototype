import type { ReactNode } from "react";
import { SubNav, type SubNavItem } from "@/components/layout";

const ITEMS: SubNavItem[] = [
  { href: "/build",          label: "Overview" },
  { href: "/build/services", label: "Services" },
  { href: "/build/salary",   label: "Direct Labor" },
  { href: "/build/operating", label: "Operating" },
  { href: "/build/cap",      label: "Cost Allocation" },
  { href: "/build/workload", label: "Workload" },
  { href: "/build/costs",    label: "Cost of service" },
  { href: "/build/policy",   label: "Recovery policy" },
  { href: "/build/feestudy", label: "Fee schedule" },
];

export default function BuildLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SubNav items={ITEMS}/>
      {children}
    </>
  );
}
